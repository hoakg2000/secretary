import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch, ApiError, getAccessToken, setAccessToken, setAuthLostHandler } from "./client";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const ok = (data: unknown) => json(200, { statusCode: 200, message: "ok", data });
const refreshOk = (accessToken: string) => ok({ accessToken });

let fetchMock: ReturnType<typeof vi.fn>;
const authLost = vi.fn();

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  setAccessToken("old");
  authLost.mockClear();
  setAuthLostHandler(authLost);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setAuthLostHandler(null);
  setAccessToken(null);
});

const bearer = (call: unknown[]) => new Headers((call[1] as RequestInit).headers).get("Authorization");

describe("apiFetch", () => {
  it("unwraps the envelope and sends bearer + credentials", async () => {
    fetchMock.mockResolvedValueOnce(ok({ a: 1 }));
    await expect(apiFetch("/things", { query: { page: 2, skip: undefined } })).resolves.toEqual({ a: 1 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:3000/api/v1/things?page=2");
    expect(init.credentials).toBe("include");
    expect(bearer(fetchMock.mock.calls[0])).toBe("Bearer old");
  });

  it("returns null for data: null", async () => {
    fetchMock.mockResolvedValueOnce(ok(null));
    await expect(apiFetch("/x", { method: "DELETE" })).resolves.toBeNull();
  });

  it("throws ApiError with status and joined messages", async () => {
    fetchMock.mockResolvedValueOnce(json(400, { statusCode: 400, message: ["a bad", "b bad"], error: "Bad Request" }));
    const error = await apiFetch("/x").catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, message: "a bad; b bad" });
  });

  it("does not refresh on a login 401 (auth: false)", async () => {
    fetchMock.mockResolvedValueOnce(json(401, { statusCode: 401, message: "Sai mật khẩu" }));
    await expect(apiFetch("/auth/login", { method: "POST", json: {}, auth: false })).rejects.toMatchObject({
      status: 401,
      message: "Sai mật khẩu",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(authLost).not.toHaveBeenCalled();
  });

  it("refreshes once for parallel 401s, then retries each with the new token", async () => {
    let refreshCalls = 0;
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith("/auth/refresh")) {
        refreshCalls++;
        await Promise.resolve();
        return refreshOk("new");
      }
      return new Headers(init.headers).get("Authorization") === "Bearer new"
        ? ok(url)
        : json(401, { statusCode: 401, message: "Unauthorized" });
    });

    const results = await Promise.all([apiFetch("/a"), apiFetch("/b"), apiFetch("/c")]);

    expect(results).toHaveLength(3);
    expect(refreshCalls).toBe(1);
    expect(getAccessToken()).toBe("new");
    expect(authLost).not.toHaveBeenCalled();
  });

  it("clears auth and calls the handler when the refresh fails", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/auth/refresh")
        ? json(401, { statusCode: 401, message: "expired" })
        : json(401, { statusCode: 401, message: "Unauthorized" }),
    );

    await expect(apiFetch("/a")).rejects.toMatchObject({ status: 401 });
    expect(getAccessToken()).toBeNull();
    expect(authLost).toHaveBeenCalledTimes(1);
  });

  it("gives up when the retry is still 401", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/auth/refresh") ? refreshOk("new") : json(401, { statusCode: 401, message: "Unauthorized" }),
    );
    await expect(apiFetch("/a")).rejects.toMatchObject({ status: 401 });
    expect(authLost).toHaveBeenCalledTimes(1);
  });
});
