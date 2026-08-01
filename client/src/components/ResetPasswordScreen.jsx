import React, { useState } from "react";
import { resetPassword } from "../auth.js";

export default function ResetPasswordScreen({ uid, token }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await resetPassword(uid, token, password);
      setDone(true);
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
        {done ? (
          <>
            <p>Password updated. You can log in with it now.</p>
            <button type="button" className="primary" onClick={() => window.location.assign("/")}>
              Go to log in
            </button>
          </>
        ) : (
          <form onSubmit={submit}>
            <label>
              New password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} />
            </label>
            {error && <div className="error-text">{error}</div>}
            <button type="submit" className="primary" disabled={busy}>
              {busy ? "Please wait…" : "Set new password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
