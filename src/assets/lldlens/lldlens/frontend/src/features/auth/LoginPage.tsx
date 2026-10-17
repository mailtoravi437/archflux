import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../../api/client";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const { data } = await apiClient.post("/api/auth/login", { email, password });
      localStorage.setItem("lldlens_token", data.token);
      navigate("/problems");
    } catch {
      setError("Invalid email or password.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="auth-form">
      <h1>Log in to LLDLens</h1>
      {error && <div className="error-state">{error}</div>}
      <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      <button type="submit">Log in</button>
    </form>
  );
}
