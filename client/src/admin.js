import { api } from "./apiClient.js";

export const fetchUsers = () => api("/api/admin/users");

export const disableUser = (id) => api(`/api/admin/users/${id}/disable`, { method: "POST" });

export const enableUser = (id) => api(`/api/admin/users/${id}/enable`, { method: "POST" });

export const resetUserPassword = (id) => api(`/api/admin/users/${id}/reset-password`, { method: "POST" });

export const deleteUser = (id) => api(`/api/admin/users/${id}`, { method: "DELETE" });
