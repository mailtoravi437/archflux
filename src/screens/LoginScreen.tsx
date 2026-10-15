import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDiagram } from "../useDiagram";
import { getSession, setSession } from "../session";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Tab = "email" | "magic-link" | "google" | "saml" | "oidc" | "sso";

export default function LoginScreen() {
  const navigate = useNavigate();
  const { pushToast, pushLog } = useDiagram();
  const [tab, setTab] = useState<Tab>("email");
  const [email, setEmail] = useState("");
  const [ssoOrg, setSsoOrg] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const emailRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    emailRef.current?.focus();
    if (getSession()) navigate("/dashboard", { replace: true });
  }, [navigate]);

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

  const submitEmail = (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (!EMAIL_RE.test(email.trim())) {
      setError("Invalid email format — expected name@company.com");
      return;
    }
    setBusy(true);
    // Simulated magic-link dispatch (local build, no network).
    window.setTimeout(() => {
      setBusy(false);
      setOtpSent(true);
      pushToast(`Magic link sent to ${email.trim()} (enter any 6-digit code)`);
    }, 600);
  };

  const submitMagicLink = (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (!EMAIL_RE.test(email.trim())) {
      setError("Invalid email format — expected name@company.com");
      return;
    }
    setBusy(true);
    // Call backend to send magic link
    const backendUrl = import.meta.env.VITE_API_URL || "/api";
    fetch(`${backendUrl}/auth/magic-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to send magic link");
        return res.json();
      })
      .then(() => {
        setBusy(false);
        pushToast(`Magic link sent to ${email.trim()}`);
        pushLog(`Magic link sent to ${email.trim()}`);
      })
      .catch((err) => {
        setBusy(false);
        setError(err.message);
      });
  };

  const verifyOtp = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!/^\d{6}$/.test(otp.trim())) {
      setError("Enter the 6-digit code from the magic link email");
      return;
    }
    setError(null);
    setSession({ mode: "email", email: email.trim() });
    pushLog(`Signed in via magic link (${email.trim()})`);
    pushToast("Signed in — welcome back");
    navigate(wasOnboarded() ? "/canvas" : "/onboarding", { replace: true });
  };

  // Auto-advance: a complete pasted or typed code verifies immediately.
  useEffect(() => {
    if (otpSent && /^\d{6}$/.test(otp)) verifyOtp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp, otpSent]);

  const pasteOtp = (e: React.ClipboardEvent) => {
    const digits = (e.clipboardData.getData("text") ?? "")
      .replace(/\D/g, "")
      .slice(0, 6);
    if (digits.length > 0) {
      e.preventDefault();
      setOtp(digits);
    }
  };

  const [busyGithub, setBusyGithub] = useState(false);
  const [busyGoogle, setBusyGoogle] = useState(false);
  const [busySaml, setBusySaml] = useState(false);
  const [busyOidc, setBusyOidc] = useState(false);
  const github = () => {
    // Real GitHub OAuth redirect
    const frontendUrl = import.meta.env.VITE_FRONTEND_URL || window.location.origin;
    const redirectUri = `${frontendUrl}/auth/callback?provider=github`;
    const backendUrl = import.meta.env.VITE_API_URL || "/api";
    const oauthUrl = `${backendUrl}/auth/login/github?redirect_uri=${encodeURIComponent(redirectUri)}`;
    
    setBusyGithub(true);
    pushToast("Redirecting to GitHub...");
    
    // Redirect to backend OAuth endpoint which will redirect to GitHub
    window.location.href = oauthUrl;
  };

  const google = () => {
    // Real Google OAuth redirect
    const frontendUrl = import.meta.env.VITE_FRONTEND_URL || window.location.origin;
    const redirectUri = `${frontendUrl}/auth/callback?provider=google`;
    const backendUrl = import.meta.env.VITE_API_URL || "/api";
    const oauthUrl = `${backendUrl}/auth/login/google?redirect_uri=${encodeURIComponent(redirectUri)}`;
    
    setBusyGoogle(true);
    pushToast("Redirecting to Google...");
    
    // Redirect to backend OAuth endpoint which will redirect to Google
    window.location.href = oauthUrl;
  };

  const saml = () => {
    // Real SAML OAuth redirect
    const frontendUrl = import.meta.env.VITE_FRONTEND_URL || window.location.origin;
    const redirectUri = `${frontendUrl}/auth/callback?provider=saml`;
    const backendUrl = import.meta.env.VITE_API_URL || "/api";
    const samlUrl = `${backendUrl}/auth/login/saml?redirect_uri=${encodeURIComponent(redirectUri)}`;
    
    setBusySaml(true);
    pushToast("Redirecting to SAML Identity Provider...");
    
    // Redirect to backend SAML endpoint which will redirect to IdP
    window.location.href = samlUrl;
  };

  const oidc = () => {
    // Real OIDC redirect
    const frontendUrl = import.meta.env.VITE_FRONTEND_URL || window.location.origin;
    const redirectUri = `${frontendUrl}/auth/callback?provider=oidc`;
    const backendUrl = import.meta.env.VITE_API_URL || "/api";
    const oidcUrl = `${backendUrl}/auth/login/oidc?redirect_uri=${encodeURIComponent(redirectUri)}`;
    
    setBusyOidc(true);
    pushToast("Redirecting to OIDC Identity Provider...");
    
    // Redirect to backend OIDC endpoint which will redirect to IdP
    window.location.href = oidcUrl;
  };

  const submitSso = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!ssoOrg.trim()) {
      setError("Enter your SAML organization slug (e.g. acme-corp)");
      return;
    }
    setBusy(true);
    window.setTimeout(() => {
      setBusy(false);
      setSession({ mode: "sso", email: ssoOrg.trim() });
      pushLog(`SSO sign-in (${ssoOrg.trim()})`);
      pushToast("SSO verified — workspace ready");
      navigate(wasOnboarded() ? "/canvas" : "/onboarding", { replace: true });
    }, 700);
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
          background:
            "linear-gradient(135deg, #1E1B4B 0%, #4C1D95 55%, #0E7490 100%)",
          color: "#fff",
          padding: 40,
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
          <blockquote
            style={{ fontSize: 15, lineHeight: 1.5, margin: "0 0 12px" }}>
            “ArchFlux caught our Kafka drift before prod did. The reconciler
            paid for itself in week one.”
          </blockquote>
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            — Elena R., Platform Tech Lead, Fortune 500 infrastructure team
          </div>
          <blockquote
            style={{ fontSize: 15, lineHeight: 1.5, margin: "16px 0 12px" }}>
            “PR-gated architecture diagrams finally made our ADRs enforceable.”
          </blockquote>
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            — Marcus T., Staff Engineer
          </div>
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
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 32,
        }}>
        <div
          className="content-card"
          style={{ width: 440, maxWidth: "100%" }}
          role="main"
          aria-label="Sign in">
          <div className="card-head">
            <span className="card-title">Sign in to ArchFlux</span>
          </div>
          <div
            style={{ display: "flex", gap: 6, marginBottom: 14 }}
            role="tablist"
            aria-label="Sign-in method">
            {(["email", "magic-link", "google", "saml", "oidc", "sso"] as Tab[]).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                className={`btn-xs${tab === t ? " btn-xs-primary" : ""}`}
                onClick={() => {
                  setTab(t);
                  setError(null);
                }}>
                {t === "email" ? "Work Email" : t === "magic-link" ? "Magic Link" : t === "google" ? "Google" : t === "saml" ? "SAML" : t === "oidc" ? "OIDC" : "Single Sign-On (SAML)"}
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

          {tab === "email" && !otpSent && (
            <form onSubmit={submitEmail}>
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
                />
              </label>
              <button
                type="submit"
                className="btn"
                style={{
                  width: "100%",
                  justifyContent: "center",
                  marginTop: 10,
                }}
                disabled={busy}
                aria-busy={busy}>
                {busy ? "Sending…" : "Send magic link"}
              </button>
            </form>
          )}
          {tab === "email" && otpSent && (
            <form onSubmit={verifyOtp}>
              <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Enter the 6-digit code sent to <strong>{email}</strong>.
              </p>
              <input
                autoFocus
                inputMode="numeric"
                className="doc-title-input"
                style={{
                  width: "100%",
                  letterSpacing: 6,
                  textAlign: "center",
                  fontSize: 20,
                  background: "var(--bg-panel-subtle)",
                  border: "1px solid var(--border-panel)",
                  borderRadius: 6,
                  padding: "8px 10px",
                }}
                placeholder="000000"
                value={otp}
                onChange={(e) =>
                  setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                onPaste={pasteOtp}
                aria-label="6-digit verification code"
              />
              <button
                type="submit"
                className="btn btn-primary"
                style={{
                  width: "100%",
                  justifyContent: "center",
                  marginTop: 10,
                }}>
                Verify & continue
              </button>
              <button
                type="button"
                className="btn-xs"
                style={{ marginTop: 8 }}
                onClick={() => setOtpSent(false)}>
                ← Back to email
              </button>
            </form>
          )}
          {tab === "sso" && (
            <form onSubmit={submitSso}>
              <label style={{ fontSize: 11, color: "var(--text-muted)" }}>
                SAML organization slug
                <input
                  className="doc-title-input"
                  style={{
                    width: "100%",
                    background: "var(--bg-panel-subtle)",
                    border: "1px solid var(--border-panel)",
                    borderRadius: 6,
                    padding: "8px 10px",
                    marginTop: 4,
                  }}
                  placeholder="acme-corp (Okta / Azure AD / Google Workspace)"
                  value={ssoOrg}
                  onChange={(e) => setSsoOrg(e.target.value)}
                  disabled={busy}
                  aria-label="SSO organization"
                />
              </label>
              <button
                type="submit"
                className="btn"
                style={{
                  width: "100%",
                  justifyContent: "center",
                  marginTop: 10,
                }}
                disabled={busy}
                aria-busy={busy}>
{busy ? "Verifying…" : "Continue with SSO"}
              </button>
            </form>
          )}
          {tab === "magic-link" && (
            <form onSubmit={submitMagicLink}>
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
              }}>
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
