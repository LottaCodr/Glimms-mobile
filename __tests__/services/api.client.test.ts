/**
 * The HTTP client against a fake network (an axios adapter), so the real
 * interceptors — auth header, 401 → refresh → retry, error normalisation — run.
 */
import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";
import {
    ApiError,
    apiClient,
    extractScanQuota,
    onAuthFailure,
    toApiError,
    tokenStore,
} from "@/services/api.client";

type Reply = { status: number; data?: unknown; headers?: Record<string, string> };
type Handler = (config: AxiosRequestConfig) => Reply | Promise<Reply>;

let handler: Handler;
let requests: AxiosRequestConfig[];

const adapter = async (config: any): Promise<AxiosResponse> => {
    requests.push(config);
    const reply = await handler(config);
    const response = {
        status: reply.status, statusText: "", data: reply.data, headers: reply.headers ?? {}, config,
    } as AxiosResponse;
    if (reply.status >= 200 && reply.status < 300) return response;
    throw new AxiosError(`HTTP ${reply.status}`, "ERR_BAD_RESPONSE", config, null, response);
};

const pathOf = (config: AxiosRequestConfig) => (config.url ?? "").replace(/^https?:\/\/[^/]+/, "");
const authOf = (config: AxiosRequestConfig) => (config.headers as any)?.Authorization;
const tokens = (n: number) => ({ accessToken: `access-${n}`, refreshToken: `refresh-${n}`, expiresIn: 900 });

beforeAll(() => {
    apiClient.defaults.adapter = adapter;
    axios.defaults.adapter = adapter; // the refresh call uses bare axios
});

beforeEach(async () => {
    requests = [];
    await tokenStore.clear();
});

describe("requests", () => {
    it("send the stored access token and a request id", async () => {
        await tokenStore.save(tokens(1));
        handler = () => ({ status: 200, data: { ok: true } });

        await apiClient.get("/api/users/me");

        expect(authOf(requests[0])).toBe("Bearer access-1");
        expect((requests[0].headers as any)["X-Request-Id"]).toEqual(expect.any(String));
    });

    it("do not attach the token to auth endpoints", async () => {
        await tokenStore.save(tokens(1));
        handler = () => ({ status: 200, data: tokens(2) });

        await apiClient.post("/api/auth/login", { email: "a@b.c", password: "x" });

        expect(authOf(requests[0])).toBeUndefined();
    });
});

describe("expired access token", () => {
    it("refreshes once, stores both rotated tokens and retries the request", async () => {
        await tokenStore.save(tokens(1));
        handler = (config) => {
            if (pathOf(config) === "/api/auth/refresh") return { status: 200, data: tokens(2) };
            return authOf(config) === "Bearer access-2"
                ? { status: 200, data: { id: "u1" } }
                : { status: 401, data: { error: "Token expired", code: "UNAUTHORIZED" } };
        };

        const res = await apiClient.get("/api/users/me");

        expect(res.data).toEqual({ id: "u1" });
        expect(await tokenStore.getAccessToken()).toBe("access-2");
        expect(await tokenStore.getRefreshToken()).toBe("refresh-2");
        const refresh = requests.find((r) => pathOf(r) === "/api/auth/refresh")!;
        expect(JSON.parse(refresh.data as string)).toEqual({ refreshToken: "refresh-1" });
    });

    it("uses a single refresh for requests that fail together", async () => {
        await tokenStore.save(tokens(1));
        handler = async (config) => {
            if (pathOf(config) === "/api/auth/refresh") {
                await new Promise((r) => setTimeout(r, 10)); // both 401s land first
                return { status: 200, data: tokens(2) };
            }
            return authOf(config) === "Bearer access-2"
                ? { status: 200, data: { path: pathOf(config) } }
                : { status: 401, data: { error: "Token expired", code: "UNAUTHORIZED" } };
        };

        const [a, b] = await Promise.all([apiClient.get("/api/catalog"), apiClient.get("/api/designs")]);

        expect(a.data).toEqual({ path: "/api/catalog" });
        expect(b.data).toEqual({ path: "/api/designs" });
        // Refresh tokens are single-use: a second refresh would log the user out.
        expect(requests.filter((r) => pathOf(r) === "/api/auth/refresh")).toHaveLength(1);
    });

    it("signs the user out when the refresh is rejected", async () => {
        await tokenStore.save(tokens(1));
        const signedOut = jest.fn();
        const unsubscribe = onAuthFailure(signedOut);
        handler = () => ({ status: 401, data: { error: "Invalid refresh token", code: "UNAUTHORIZED" } });

        await expect(apiClient.get("/api/users/me")).rejects.toMatchObject({ status: 401 });

        expect(signedOut).toHaveBeenCalledTimes(1);
        expect(await tokenStore.getAccessToken()).toBeNull();
        expect(await tokenStore.getRefreshToken()).toBeNull();
        unsubscribe();
    });

    it("does not try to refresh a failed login", async () => {
        handler = () => ({ status: 401, data: { error: "Invalid credentials", code: "UNAUTHORIZED" } });

        await expect(apiClient.post("/api/auth/login", {})).rejects.toMatchObject({
            status: 401, message: "Invalid credentials",
        });
        expect(requests).toHaveLength(1);
    });
});

describe("errors", () => {
    it("carry the server's message, code and field details", async () => {
        handler = () => ({
            status: 400,
            data: { error: "Validation failed", code: "VALIDATION_ERROR", details: [{ field: "email", message: "Invalid email" }] },
        });

        const err: ApiError = await apiClient.post("/api/auth/register", {}).catch((e) => e);

        expect(err).toBeInstanceOf(ApiError);
        expect(err).toMatchObject({ status: 400, code: "VALIDATION_ERROR", message: "Validation failed" });
        expect(err.fieldError("email")).toBe("Invalid email");
        expect(err.fieldError("password")).toBeNull();
    });

    it("expose how long a rate limit lasts", async () => {
        handler = () => ({ status: 429, data: { error: "Slow down", code: "RATE_LIMITED" }, headers: { "retry-after": "42" } });
        await expect(apiClient.get("/api/catalog")).rejects.toMatchObject({ status: 429, retryAfterSeconds: 42 });
    });

    it("mark a request that got no response as a network error", () => {
        expect(toApiError(new AxiosError("Network Error"))).toMatchObject({
            status: 0, code: "NETWORK_ERROR", isNetworkError: true,
        });
    });
});

describe("tokenStore.isAccessTokenStale", () => {
    it("is stale with no token, fresh after saving, stale once expired", async () => {
        expect(await tokenStore.isAccessTokenStale()).toBe(true);
        await tokenStore.save(tokens(1));
        expect(await tokenStore.isAccessTokenStale()).toBe(false);
        await tokenStore.save({ ...tokens(1), expiresIn: 0 });
        expect(await tokenStore.isAccessTokenStale()).toBe(true);
    });
});

describe("extractScanQuota", () => {
    it("reads the scan quota headers", () => {
        expect(extractScanQuota({ "x-scan-count-today": "3", "x-scan-limit": "10", "x-scan-tier": "free" }))
            .toEqual({ used: 3, limit: 10, tier: "free" });
    });

    it("is null when the headers are absent", () => {
        expect(extractScanQuota({})).toBeNull();
        expect(extractScanQuota(undefined)).toBeNull();
    });
});
