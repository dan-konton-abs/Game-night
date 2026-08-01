const TOKEN_KEY = "gamenight:token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function api(path, options = {}) {
  const token = getToken();
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

export const signup = (name, email, password) =>
  api("/api/auth/signup", { method: "POST", body: JSON.stringify({ name, email, password }) });

export const login = (email, password) =>
  api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });

export const fetchMe = () => api("/api/auth/me");

export const forgotPassword = (email) =>
  api("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });

export const resetPassword = (uid, token, newPassword) =>
  api("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ uid, token, newPassword }) });
