import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useDiagram } from "../useDiagram";
import { setSession } from "../session";

export default function AuthCallbackScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { pushToast, pushLog } = useDiagram();

  const wasOnboarded = () => {
    try {
      return !!localStorage.getItem("archflux:onboarded");
    } catch {
      return true;
    }
  };

  useEffect(() => {
    const token = searchParams.get("token");
    const provider = searchParams.get("provider");
    const error = searchParams.get("error");

    if (error) {
      pushToast("Authentication failed: " + error);
      navigate("/login", { replace: true });
      return;
    }

    if (!token) {
      pushToast("Authentication failed: No token received");
      navigate("/login", { replace: true });
      return;
    }

    // Store the JWT token
    localStorage.setItem("archflux:auth_token", token);
    
    // Also store in session for the session service
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      setSession({ 
        mode: provider || "github", 
        email: payload.email 
      });
    } catch {
      // Ignore session parsing errors
    }

    pushLog(`Signed in via ${provider || "GitHub"}`);
    pushToast(`Signed in via ${provider || "GitHub"} — welcome back`);
    
    navigate(wasOnboarded() ? "/canvas" : "/onboarding", { replace: true });
  }, [navigate, pushToast, pushLog]);

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