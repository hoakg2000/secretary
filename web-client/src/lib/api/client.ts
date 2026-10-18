import type { ApiEnvelope, ApiErrorBody } from "./types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /** Parsed error body when the server sent one. */
    public readonly body?: ApiErrorBody,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiInit extends Omit<RequestInit, "body"> {
  /** Serialized as JSON with the right Content-Type. */
  json?: unknown;
  /** Query string values; undefined/null/"" are dropped. */
  query?: object;
  /** `false` for login/refresh: no bearer, no refresh-and-retry on 401. */
  auth?: boolean;
}

// ---- in-memory auth state (never persisted) ----

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;
let authLostHandler: (() => void) | null = null;

export const getAccessToken = () => accessToken;
export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

/** AuthProvider registers this to clear its state and navigate to /login. */
export const setAuthLostHandler = (handler: (() => void) | null) => {
  authLostHandler = handler;
};

function authLost() {
  accessToken = null;
  if (authLostHandler) authLostHandler();
  // fallback before AuthProvider mounts; the proxy adds the locale prefix
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  else if (typeof window !== "undefined") window.location.href = "/login";
}

function buildUrl(path: string, query?: object) {
  const url = new URL(API_URL.replace(/\/$/, "") + path);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function toApiError(res: Response): Promise<ApiError> {
  let body: ApiErrorBody | undefined;
  try {
    body = await res.json();
  } catch {
    // not JSON (proxy error page, empty body)
  }
  const message = Array.isArray(body?.message) ? body.message.join("; ") : body?.message;
  return new ApiError(res.status, message || res.statusText || `HTTP ${res.status}`, body);
}

/** One shared refresh for all parallel 401s. Resolves to the new token, or null when the session is gone. */
export function refreshAccessToken(): Promise<string | null> {
  refreshPromise ??= (async () => {
    try {
      const res = await fetch(buildUrl("/auth/refresh"), { method: "POST", credentials: "include" });
      if (!res.ok) return null;
      const envelope = (await res.json()) as ApiEnvelope<{ accessToken: string }>;
      accessToken = envelope.data.accessToken;
      return accessToken;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

function send(path: string, init: ApiInit, token: string | null) {
  const { json, query, auth, headers: initHeaders, ...rest } = init;
  const headers = new Headers(initHeaders);
  if (json !== undefined) headers.set("Content-Type", "application/json");
  if (token && auth !== false) headers.set("Authorization", `Bearer ${token}`);
  return fetch(buildUrl(path, query), {
    ...rest,
    headers,
    body: json === undefined ? undefined : JSON.stringify(json),
    credentials: "include",
  });
}

/** Authenticated fetch that returns the raw Response (blob / SSE). Throws ApiError on non-2xx. */
export async function apiFetchRaw(path: string, init: ApiInit = {}): Promise<Response> {
  const used = accessToken;
  let res: Response;
  try {
    res = await send(path, init, used);
    if (res.status === 401 && init.auth !== false) {
      // Another request may already have refreshed while this one was in flight.
      const token = accessToken && accessToken !== used ? accessToken : await refreshAccessToken();
      if (!token) {
        authLost();
        throw await toApiError(res);
      }
      res = await send(path, init, token);
      if (res.status === 401) {
        authLost();
        throw await toApiError(res);
      }
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, error instanceof Error ? error.message : "Network error");
  }
  if (!res.ok) throw await toApiError(res);
  return res;
}

/** JSON call: unwraps `{ statusCode, message, data }` and returns `data`. */
export async function apiFetch<T>(path: string, init: ApiInit = {}): Promise<T> {
  const res = await apiFetchRaw(path, init);
  const text = await res.text();
  if (!text) return null as T;
  return (JSON.parse(text) as ApiEnvelope<T>).data;
}
