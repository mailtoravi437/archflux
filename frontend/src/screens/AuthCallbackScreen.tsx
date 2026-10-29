import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { safeNext } from "../lib/access";
import { useDiagram } from "../state/useDiagram";
import { setSession } from "../state/session";
import { api, resetAuthFailure } from "../lib/api";
import { getPendingInvite } from "../lib/workspaceSetup";

export interface CallbackParams {
  provider: string | null;
  error: string | null;
}

/** Pure: parse the `#/auth/callback?provider=&error=` hash query. */
export function parseAuthCallbackParams(
  params: URLSearchParams | Record<string, string | null>,
): CallbackParams {
  const get = (k: string) =>
    typeof (params as URLSearchParams).get === "function"
      ? (params as URLSearchParams).get(k)
      : ((params as Record<string, string | null>)[k] ?? null);
  return { provider: get("provider"), error: get("error") };
}

/** Pure: post-auth landing target based on onboarding state. */
export function resolvePostAuthTarget(wasOnboarded: boolean): string {
  return wasOnboarded ? "/canvas" : "/onboarding";
}

function emailFromMe(me: unknown): string | undefined {
  if (!me || typeof me !== "object") return undefined;
  const m = me as { email?: unknown; data?: { email?: unknown } };
  if (typeof m.email === "string") return m.email;
  if (m.data && typeof m.data.email === "string") return m.data.email;
  return undefined;
}

/** Pure: session to store after a successful cookie `/me` probe. */
export function resolveSessionMode(
  provider: string | null,
  me: unknown,
): { mode: string; email?: string } {
  const email = emailFromMe(me);
  return email ? { mode: provider || "email", email } : { mode: provider || "email" };
}

export function wasOnboarded(): boolean {
  try {
    return !!localStorage.getItem("archflux:onboarded");
  } catch {
    return true;
  }
}

export default function AuthCallbackScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { pushToast, pushLog } = useDiagram();

  useEffect(() => {
    const { provider, error } = parseAuthCallbackParams(searchParams);
    if (error) {
      pushToast("Authentication failed: " + error);
      navigate("/login", { replace: true });
      return;
    }
    let cancelled = false;
    // Cookie flow: the backend set HttpOnly ARCHFLUX_TOKEN and redirected
    // with NO token. Probe the session via cookie and establish local state.
    void api
      .me()
      .then((me) => {
        if (cancelled) return;
        const session = resolveSessionMode(provider, me);
        setSession(session);
        resetAuthFailure();
        pushLog(`Signed in via ${provider || "email"}`);
        pushToast(`Signed in via ${provider || "email"} — welcome back`);
        // A pending workspace invite (R1-E11-T03) is accepted before anything else.
        const pendingInvite = getPendingInvite();
        const next = safeNext(searchParams.get("next"));
        navigate(pendingInvite ? `/invite/${encodeURIComponent(pendingInvite)}` : next ?? resolvePostAuthTarget(wasOnboarded()), { replace: true });
      })
      .catch(() => {
        if (cancelled) return;
        navigate("/login?error=unauthorized", { replace: true });
      });
    return () => {
      cancelled = true;
    };
  }, [navigate, pushToast, pushLog, searchParams]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-app, #F7F7F5)",
      }}>
      <div className="content-card" style={{ textAlign: "center", padding: 40 }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>⏳</div>
        <div className="card-title">Completing sign in…</div>
        <p className="card-sub">Redirecting you to your workspace</p>
      </div>
    </div>
  );
}
