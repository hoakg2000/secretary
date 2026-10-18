import { apiFetch } from "../client";
import type { GoogleConnectResult, GoogleStatus, LoginInput, LoginResult, SessionInfo } from "../types";

export const login = (input: LoginInput) =>
  apiFetch<LoginResult>("/auth/login", { method: "POST", json: input, auth: false });

export const logout = (sessionId?: string) =>
  apiFetch<null>("/auth/logout", { method: "POST", json: sessionId ? { sessionId } : {} });

export const getSession = () => apiFetch<SessionInfo>("/auth/session");

export const getGoogleConnectUrl = () => apiFetch<GoogleConnectResult>("/auth/google/connect");
export const getGoogleStatus = () => apiFetch<GoogleStatus>("/auth/google/status");
export const disconnectGoogle = () => apiFetch<null>("/auth/google", { method: "DELETE" });
