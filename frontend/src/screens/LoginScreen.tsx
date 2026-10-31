import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useDiagram } from "../state/useDiagram";
import { getSession, isSignedIn, setSession } from "../state/session";
import { api } from "../lib/api";
import { loginUrl } from "../lib/config";
import { safeNext } from "../lib/access";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Tab = "magic-link" | "google" | "saml" | "oidc";

export default function LoginScreen() {
  const navigate = useNavigate();
  const { pushToast, pushLog } = useDiagram();
  const [tab, setTab] = useState<Tab>("magic-link");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicSent, setMagicSent] = useState(false);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    emailRef.current?.focus();
    // Returns to the page that asked for sign-in (R1-E07-T06 `?next=`), if it is an in-app path.
    // A guest is not signed in: a shared link (`next`) needs a real sign-in, so a guest stays here instead of
    // bouncing back to the link, which sends them to login again (endless redirect).
    const next = safeNext(searchParams.get("next"));
    if (isSignedIn()) navigate(next ?? "/dashboard", { replace: true });
    else if (getSession() && !next) navigate("/dashboard", { replace: true });
    const err = searchParams.get("error");
    if (err) setError(`Sign-in failed: ${err}`);
  }, [navigate, searchParams]);

  const wasOnboarded = () => {
    try {
      return !!localStorage.getItem("archflux:onboarded");
    } catch {
      return true;
    }
  };

  const seedGuest = () => {
    // Zero-barrier path: no network, seed default workspace.
    // First visit → onboarding; returning guests → straight to canvas.
    const returning = wasOnboarded();
    setSession({ mode: "guest" });
    try {
      if (!returning) localStorage.setItem("archflux:onboarded", "true");
    } catch {
      /* ignore */
    }
    pushLog("Guest session started (local-first)");
    pushToast("Continuing as Local Guest — data stays in this browser");
    navigate(returning ? "/canvas" : "/onboarding", { replace: true });
  };

  const startNewProject = () => {
    setSession({ mode: "guest" });
    try {
      localStorage.setItem("archflux:onboarded", "true");
    } catch {
      /* ignore */
    }
    pushLog("New project started (local-first)");
    pushToast("Starting a new project");
    navigate("/canvas", { replace: true });
  };

  const submitMagicLink = (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (!EMAIL_RE.test(email.trim())) {
      setError("Invalid email format — expected name@company.com");
      return;
    }
    setBusy(true);
    // Real cookie-session magic link: server emails a single-use link that
    // sets HttpOnly ARCHFLUX_TOKEN and lands on /auth/callback?provider=.
    void api
      .sendMagicLink(email.trim())
      .then(() => {
        setBusy(false);
        setMagicSent(true);
        pushToast(`Magic link sent to ${email.trim()}`);
        pushLog(`Magic link sent to ${email.trim()}`);
      })
      .catch((err: Error) => {
        setBusy(false);
        setError(err.message);
      });
  };

  const [busyGithub, setBusyGithub] = useState(false);
  const [busyGoogle, setBusyGoogle] = useState(false);
  const [busySaml, setBusySaml] = useState(false);
  const [busyOidc, setBusyOidc] = useState(false);
  const github = () => {
    // Real GitHub OAuth redirect
    // Backend returns to {frontend}/auth/callback itself (SERVICES_SPEC §4.1).
    const oauthUrl = loginUrl("github");
    
    setBusyGithub(true);
    pushToast("Redirecting to GitHub...");
    
    // Redirect to backend OAuth endpoint which will redirect to GitHub
    window.location.href = oauthUrl;
  };

  const google = () => {
    // Real Google OAuth redirect
    // Backend returns to {frontend}/auth/callback itself (SERVICES_SPEC §4.1).
    const oauthUrl = loginUrl("google");
    
    setBusyGoogle(true);
    pushToast("Redirecting to Google...");
    
    // Redirect to backend OAuth endpoint which will redirect to Google
    window.location.href = oauthUrl;
  };

  const saml = () => {
    // Real SAML OAuth redirect
    // Backend returns to {frontend}/auth/callback itself (SERVICES_SPEC §4.1).
    const samlUrl = loginUrl("saml");
    
    setBusySaml(true);
    pushToast("Redirecting to SAML Identity Provider...");
    
    // Redirect to backend SAML endpoint which will redirect to IdP
    window.location.href = samlUrl;
  };

  const oidc = () => {
    // Real OIDC redirect
    // Backend returns to {frontend}/auth/callback itself (SERVICES_SPEC §4.1).
    const oidcUrl = loginUrl("oidc");
    
    setBusyOidc(true);
    pushToast("Redirecting to OIDC Identity Provider...");
    
    // Redirect to backend OIDC endpoint which will redirect to IdP
    window.location.href = oidcUrl;
  };

  const submitSaml = (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    saml();
  };

  const submitOidc = (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    oidc();
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexWrap: "wrap",
        background: "var(--bg-app, #F7F7F5)",
      }}>
      {/* Brand column — animated drift-resolution motif + quotes */}
      <div
        style={{
          flex: "1 1 320px",
          minWidth: 0,
          background:
            "linear-gradient(135deg, #1E1B4B 0%, #4C1D95 55%, #0E7490 100%)",
          color: "#fff",
          padding: "clamp(20px, 6vw, 40px)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img
            src="/icons/tools/select.svg"
            alt=""
            style={{ width: 28, height: 28 }}
          />
          <div>
            <div style={{ fontWeight: 800, fontSize: 20 }}>ArchFlux</div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              Living System Canvas
            </div>
          </div>
        </div>
        <div>
          <svg
            viewBox="0 0 400 180"
            style={{ width: "100%", marginBottom: 20 }}
            role="img"
            aria-label="Drift resolution animation">
            <rect
              x="20"
              y="60"
              width="100"
              height="56"
              rx="8"
              fill="none"
              stroke="#F59E0B"
              strokeWidth="2"
              strokeDasharray="6 4">
              <animate
                attributeName="stroke-dashoffset"
                from="0"
                to="40"
                dur="2s"
                repeatCount="indefinite"
              />
            </rect>
            <text
              x="30"
              y="92"
              fill="#FDE68A"
              fontSize="11"
              fontFamily="monospace">
              ⚠ Drift
            </text>
            <line
              x1="120"
              y1="88"
              x2="180"
              y2="88"
              stroke="#fff"
              strokeWidth="2"
            />
            <polygon points="180,82 192,88 180,94" fill="#fff" />
            <rect
              x="192"
              y="60"
              width="100"
              height="56"
              rx="8"
              fill="none"
              stroke="#34D399"
              strokeWidth="2"
            />
            <text
              x="202"
              y="92"
              fill="#A7F3D0"
              fontSize="11"
              fontFamily="monospace">
              ● Synced
            </text>
            <line
              x1="292"
              y1="88"
              x2="340"
              y2="88"
              stroke="#34D399"
              strokeWidth="2"
            />
            <polygon points="340,82 352,88 340,94" fill="#34D399" />
          </svg>
        </div>
        <div
          style={{
            fontSize: 11,
            opacity: 0.6,
            fontFamily: "var(--mono-font)",
          }}>
          Local-first · .arch in git · deterministic sync
        </div>
      </div>

      {/* Auth stage */}
      <div
        style={{
          flex: "1 1 320px",
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // Phones: the card gets the full width minus a 16 px gutter (FE-Q3).
          padding: "clamp(16px, 5vw, 32px)",
        }}>
        <div
          className="content-card"
          style={{ width: 440, maxWidth: "100%", minWidth: 0, boxSizing: "border-box" }}
          role="main"
          aria-label="Sign in">
          <div className="card-head">
            <span className="card-title">Sign in to ArchFlux</span>
          </div>
          <div
            style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}
            role="tablist"
            aria-label="Sign-in method">
            {(["magic-link", "google", "saml", "oidc"] as Tab[]).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                className={`btn btn--sm btn--${tab === t ? 'primary' : 'secondary'}`}
                onClick={() => {
                  setTab(t);
                  setError(null);
                }}>
                {t === "magic-link" ? "Magic Link" : t === "google" ? "Google" : t === "saml" ? "SSO (SAML)" : "OIDC"}
              </button>
            ))}
          </div>

          <button
            className="btn btn-primary"
            style={{ width: "100%", justifyContent: "center", marginBottom: 6 }}
            onClick={github}
            disabled={busyGithub}
            aria-busy={busyGithub}>
            {busyGithub ? "Connecting…" : "⬢ Continue with GitHub"}
</button>
            <button
            className="btn"
            style={{ width: "100%", justifyContent: "center", marginBottom: 6 }}
            onClick={google}
            disabled={busyGoogle}
            aria-busy={busyGoogle}>
            {busyGoogle ? "Connecting…" : "🌐 Continue with Google"}
</button>
            <div
              style={{
                fontSize: 10,
                color: "var(--text-muted)",
                marginBottom: 12,
              }}>
              Requests repository read/write scope for .arch commits.
            </div>

          {tab === "magic-link" && (
            <form onSubmit={submitMagicLink}>
              {import.meta.env.DEV && (
                <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 8px" }}>
                  Dev note: with the mock email provider the link is only server-logged — check the server logs.
                </p>
              )}
              {magicSent ? (
                <div role="status" style={{ fontSize: 13, padding: "10px 0" }}>
                  Check your email — click the sign-in link to finish.
                  <div style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      className="btn btn--sm btn--secondary"
                      onClick={() => setMagicSent(false)}>
                      ← Use a different email
                    </button>
                  </div>
                </div>
              ) : (
              <>
              <label style={{ fontSize: 11, color: "var(--text-muted)" }}>
                Work email
                <input
                  ref={emailRef}
                  type="email"
                  className="doc-title-input"
                  style={{
                    width: "100%",
                    background: "var(--bg-panel-subtle)",
                    border: "1px solid var(--border-panel)",
                    borderRadius: 6,
                    padding: "8px 10px",
                    marginTop: 4,
                  }}
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy}
                  aria-label="Work email"
                  aria-errormessage={error ? "login-error" : undefined}
                />
              </label>
              <button
                type="submit"
                className="btn btn-primary"
                style={{
                  width: "100%",
                  justifyContent: "center",
                  marginTop: 10,
                }}
                disabled={busy}
                aria-busy={busy}>
                {busy ? "Sending…" : "Send magic link"}
              </button>
              </>
              )}
            </form>
          )}
          {tab === "saml" && (
            <form onSubmit={submitSaml}>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
                Redirects to your SAML Identity Provider (Okta, Azure AD, etc.)
              </p>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: "100%", justifyContent: "center", marginTop: 10 }}
                disabled={busy}
                aria-busy={busy}>
                {busySaml ? "Redirecting…" : "Continue with SAML"}
              </button>
            </form>
          )}
          {tab === "oidc" && (
            <form onSubmit={submitOidc}>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
                Redirects to your OIDC provider (Keycloak, Auth0, etc.)
              </p>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: "100%", justifyContent: "center", marginTop: 10 }}
                disabled={busyOidc}
                aria-busy={busyOidc}>
                {busyOidc ? "Redirecting…" : "Continue with OIDC"}
              </button>
            </form>
          )}
          {error && (
            <div
              role="alert"
              style={{
                marginTop: 12,
                fontSize: 12,
                background: "var(--accent-rose-bg, #FEE2E2)",
                border: "1px solid var(--accent-rose, #DC2626)",
                borderRadius: 6,
                padding: "8px 10px",
                color: "var(--accent-rose, #991B1B)",
              }} id="login-error">
              {error}
            </div>
          )}

          <div
            style={{
              borderTop: "1px solid var(--border-panel)",
              marginTop: 16,
              paddingTop: 14,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}>
            <button
              className="btn"
              style={{
                width: "100%",
                justifyContent: "center",
                borderStyle: "dashed",
              }}
              onClick={startNewProject}>
              + Start New Project
            </button>
            <button
              className="btn"
              style={{
                width: "100%",
                justifyContent: "center",
                borderStyle: "dashed",
              }}
              onClick={seedGuest}
              autoFocus={false}>
              Continue as Local Guest (No account needed — data saved in
              browser) →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
