import React, { useEffect, useState } from "react";
import { fetchUsers, disableUser, enableUser, resetUserPassword, deleteUser } from "../admin.js";

function formatDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function AdminScreen({ user, onLogout }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  function load() {
    setLoading(true);
    fetchUsers()
      .then(({ users: list }) => setUsers(list))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function run(id, action) {
    setError(null);
    setBusyId(id);
    try {
      await action();
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  function onToggleDisabled(u) {
    const verb = u.disabled ? "Re-enable" : "Disable";
    if (!confirm(`${verb} ${u.name}'s account (${u.email})?`)) return;
    run(u.id, () => (u.disabled ? enableUser(u.id) : disableUser(u.id)));
  }

  async function onResetPassword(u) {
    if (!confirm(`Send a password reset for ${u.name} (${u.email})?`)) return;
    setError(null);
    setBusyId(u.id);
    try {
      const { resetUrl } = await resetUserPassword(u.id);
      load();
      window.prompt(
        `Reset link for ${u.email} (also emailed if SMTP is configured) - copy and send it to them:`,
        resetUrl
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  function onDelete(u) {
    if (!confirm(`Permanently delete ${u.name}'s account (${u.email})? This can't be undone.`)) return;
    run(u.id, () => deleteUser(u.id));
  }

  return (
    <div className="home-screen">
      <div className="home-card admin-card">
        <div className="games-header">
          <div>
            <h1>🛠 Admin</h1>
            <p className="subtitle">Signed in as {user.name} - account administration only, no games here.</p>
          </div>
          <button type="button" className="link-button" onClick={onLogout}>
            Log out
          </button>
        </div>

        {error && <div className="error-text">{error}</div>}

        <h3>Registered accounts</h3>
        {loading && <p className="muted">Loading…</p>}
        {!loading && users.length === 0 && <p className="muted">No accounts registered yet.</p>}
        {!loading && users.length > 0 && (
          <div className="admin-users-table-wrap">
            <table className="admin-users-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Registered</th>
                  <th>Games</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className={u.disabled ? "admin-row-disabled" : ""}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>{formatDate(u.createdAt)}</td>
                    <td>{u.gameCount}</td>
                    <td>{u.disabled ? "Disabled" : "Active"}</td>
                    <td className="admin-actions">
                      <button type="button" className="small" disabled={busyId === u.id} onClick={() => onToggleDisabled(u)}>
                        {u.disabled ? "Enable" : "Disable"}
                      </button>
                      <button type="button" className="small" disabled={busyId === u.id} onClick={() => onResetPassword(u)}>
                        Reset password
                      </button>
                      <button type="button" className="small danger" disabled={busyId === u.id} onClick={() => onDelete(u)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="hint">
          Deleting only removes the login/account - it won't remove them from any games they've already joined.
          Deleting someone who's a GM of a game is blocked until that game is transferred or deleted.
        </p>
      </div>
    </div>
  );
}
