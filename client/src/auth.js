import { api } from "./apiClient.js";

export { getToken, setToken, clearToken } from "./apiClient.js";

export const signup = (name, email, password) =>
  api("/api/auth/signup", { method: "POST", body: JSON.stringify({ name, email, password }) });

export const login = (email, password) =>
  api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });

export const fetchMe = () => api("/api/auth/me");

export const forgotPassword = (email) =>
  api("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });

export const resetPassword = (uid, token, newPassword) =>
  api("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ uid, token, newPassword }) });
