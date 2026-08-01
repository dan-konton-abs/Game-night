import React, { useState } from "react";
import { signup, login, forgotPassword } from "../auth.js";

export default function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState("login"); // "login" | "signup" | "forgot"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [forgotSent, setForgotSent] = useState(false);

  function switchMode(next) {
    setMode(next);
    setError(null);
    setForgotSent(false);
  }

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") {
        const { token, user } = await login(email.trim(), password);
        onAuthenticated(token, user);
      } else if (mode === "signup") {
        const { token, user } = await signup(name.trim(), email.trim(), password);
        onAuthenticated(token, user);
      } else {
        await forgotPassword(email.trim());
        setForgotSent(true);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="home-screen">
      <div className="home-card">
        <h1>🎲 Game Night</h1>
        <p className="subtitle">A shared game board for your online sessions.</p>

        {mode !== "forgot" && (
          <div className="mode-toggle">
            <button className={mode === "login" ? "active" : ""} onClick={() => switchMode("login")} type="button">
              Log In
            </button>
            <button className={mode === "signup" ? "active" : ""} onClick={() => switchMode("signup")} type="button">
              Sign Up
            </button>
          </div>
        )}

        {mode === "forgot" && forgotSent ? (
          <div>
            <p>If an account exists for that email, a reset link is on its way.</p>
            <button type="button" onClick={() => switchMode("login")}>
              Back to log in
            </button>
          </div>
        ) : (
          <form onSubmit={submit}>
            {mode === "signup" && (
              <label>
                Your name
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ripley" maxLength={40} />
              </label>
            )}
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </label>
            {mode !== "forgot" && (
              <label>
                Password
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} />
              </label>
            )}

            {error && <div className="error-text">{error}</div>}

            <button type="submit" className="primary" disabled={busy}>
              {busy
                ? "Please wait…"
                : mode === "login"
                ? "Log In"
                : mode === "signup"
                ? "Create Account"
                : "Send Reset Link"}
            </button>
          </form>
        )}

        {mode === "login" && !forgotSent && (
          <p className="hint">
            <button type="button" className="link-button" onClick={() => switchMode("forgot")}>
              Forgot password?
            </button>
          </p>
        )}
        {mode === "forgot" && !forgotSent && (
          <p className="hint">
            <button type="button" className="link-button" onClick={() => switchMode("login")}>
              Back to log in
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
