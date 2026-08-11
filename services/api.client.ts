/**
 * Core API client — axios with auth + refresh interceptors.
 * Mirrors FRONTEND_INTEGRATION.md §4.
 *
 * - baseURL is the API root; services address `/api/...` and `/v1/...` paths.
 * - Attaches `Authorization: Bearer <accessToken>` from expo-secure-store.
 * - Sends `X-Request-Id` for cross-service tracing of AI pipeline failures.
 * - On 401: single-flight refresh, queued retries, **rotates both tokens**
 *   (refresh tokens are single-use server-side).
 * - On refresh failure: clears tokens and notifies auth listeners so the app
 *   can drop back to the auth stack.
 */
import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from "axios";
import { secureStorage as SecureStore } from "./storage";
import { ENV, apiUrl } from "@/config/env";
import type { ApiErrorPayload, AuthTokens } from "@/types/api";

export const TOKEN_KEYS = {
    access: "glimms_access_token",
    refresh: "glimms_refresh_token",
    expiry: "glimms_access_exp", // epoch ms of access-token expiry
} as const;

// ─── Token storage helpers ───────────────────────────────────────────────────
export const tokenStore = {
    async getAccessToken() {
        return SecureStore.getItemAsync(TOKEN_KEYS.access);
    },
    async getRefreshToken() {
        return SecureStore.getItemAsync(TOKEN_KEYS.refresh);
    },
    async save(tokens: AuthTokens) {
        await SecureStore.setItemAsync(TOKEN_KEYS.access, tokens.accessToken);
        await SecureStore.setItemAsync(TOKEN_KEYS.refresh, tokens.refreshToken);
        // Schedule proactive refresh support: remember expiry (with 30s leeway).
        const expMs = Date.now() + Math.max(0, (tokens.expiresIn ?? 900) - 30) * 1000;
        await SecureStore.setItemAsync(TOKEN_KEYS.expiry, String(expMs));
    },
    async clear() {
        await SecureStore.deleteItemAsync(TOKEN_KEYS.access);
        await SecureStore.deleteItemAsync(TOKEN_KEYS.refresh);
        await SecureStore.deleteItemAsync(TOKEN_KEYS.expiry);
    },
    /** True when the cached access token is missing or within its expiry leeway. */
    async isAccessTokenStale() {
        const [token, exp] = await Promise.all([
            SecureStore.getItemAsync(TOKEN_KEYS.access),
            SecureStore.getItemAsync(TOKEN_KEYS.expiry),
        ]);
        if (!token) return true;
        if (!exp) return false; // unknown — let the server decide
        return Date.now() >= Number(exp);
    },
};

// ─── Auth failure listeners (auth store subscribes → drops to login) ─────────
type AuthFailureListener = () => void;
const authFailureListeners = new Set<AuthFailureListener>();
export function onAuthFailure(cb: AuthFailureListener): () => void {
    authFailureListeners.add(cb);
    return () => void authFailureListeners.delete(cb);
}
function emitAuthFailure() {
    authFailureListeners.forEach((cb) => {
        try {
            cb();
        } catch {
            /* listener must not break the client */
        }
    });
}

// ─── Request ID (tracing; avoids uuid's crypto polyfill issues on Hermes) ────
function randomId(): string {
    const rnd = () =>
        Math.floor(Math.random() * 0xffffffff)
            .toString(16)
            .padStart(8, "0");
    return `${Date.now().toString(16)}-${rnd()}${rnd()}`;
}

// ─── Error normalization (guide §5) ──────────────────────────────────────────
export class ApiError extends Error {
    status: number;
    code: string;
    details?: { field: string; message: string }[];
    payload?: ApiErrorPayload;
    isNetworkError: boolean;
    /** Seconds until a rate limit lifts (from the Retry-After header). */
    retryAfterSeconds?: number;

    constructor(
        status: number,
        payload: ApiErrorPayload | undefined,
        isNetworkError = false,
        retryAfterSeconds?: number,
    ) {
        super(payload?.error ?? (isNetworkError ? "Network request failed" : "Request failed"));
        this.name = "ApiError";
        this.status = status;
        this.code = payload?.code ?? (isNetworkError ? "NETWORK_ERROR" : "UNKNOWN");
        this.details = payload?.details;
        this.payload = payload;
        this.isNetworkError = isNetworkError;
        this.retryAfterSeconds = retryAfterSeconds;
    }

    /** First Zod-style field error, e.g. for inline form display. */
    fieldError(field?: string): string | null {
        if (!this.details?.length) return null;
        const hit = field ? this.details.find((d) => d.field === field) : this.details[0];
        return hit?.message ?? null;
    }
}

export function toApiError(err: unknown): ApiError {
    if (err instanceof ApiError) return err;
    const axErr = err as AxiosError<ApiErrorPayload>;
    if (!axErr.response) {
        return new ApiError(0, undefined, true);
    }
    const retryAfter = Number(axErr.response.headers?.["retry-after"]);
    return new ApiError(
        axErr.response.status,
        axErr.response.data ?? undefined,
        false,
        Number.isFinite(retryAfter) && retryAfter > 0 ? Math.round(retryAfter) : undefined,
    );
}

// ─── Axios instance ──────────────────────────────────────────────────────────
const NO_AUTH_PATHS = ["/api/auth/register", "/api/auth/login", "/api/auth/refresh", "/api/auth/logout"];

export const apiClient: AxiosInstance = axios.create({
    baseURL: ENV.API_URL,
    timeout: ENV.API_TIMEOUT,
    headers: { "Content-Type": "application/json" },
});

apiClient.interceptors.request.use(async (config) => {
    (config.headers as any)["X-Request-Id"] = randomId();
    const url = config.url ?? "";
    if (!NO_AUTH_PATHS.some((p) => url.startsWith(p))) {
        const token = await tokenStore.getAccessToken();
        if (token) config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// ─── 401 → single-flight refresh → retry queue ───────────────────────────────
let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];

function processQueue(error: unknown, token: string | null) {
    failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token!)));
    failedQueue = [];
}

/** Shared refresh routine — also usable for proactive refresh before expiry. */
export async function refreshTokens(): Promise<AuthTokens | null> {
    const refreshToken = await tokenStore.getRefreshToken();
    if (!refreshToken) return null;
    const { data } = await axios.post<AuthTokens>(
        apiUrl("/api/auth/refresh"),
        { refreshToken },
        { timeout: ENV.API_TIMEOUT },
    );
    await tokenStore.save(data); // rotation: store BOTH new tokens
    return data;
}

apiClient.interceptors.response.use(
    (res) => res,
    async (error: AxiosError<ApiErrorPayload>) => {
        const original = (error.config ?? {}) as AxiosRequestConfig & { _retry?: boolean };
        const url = original.url ?? "";
        const isAuthPath = NO_AUTH_PATHS.some((p) => url.startsWith(p));

        if (error.response?.status === 401 && !original._retry && !isAuthPath) {
            // Another refresh is in flight — wait for it.
            if (isRefreshing) {
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                }).then((token) => {
                    original.headers = { ...original.headers, Authorization: `Bearer ${token}` };
                    return apiClient(original);
                });
            }

            original._retry = true;
            isRefreshing = true;
            try {
                const tokens = await refreshTokens();
                if (!tokens) throw toApiError(error);
                processQueue(null, tokens.accessToken);
                original.headers = { ...original.headers, Authorization: `Bearer ${tokens.accessToken}` };
                return apiClient(original);
            } catch (refreshError) {
                processQueue(refreshError, null);
                await tokenStore.clear();
                emitAuthFailure(); // → auth store signs out → router redirects
                throw toApiError(refreshError);
            } finally {
                isRefreshing = false;
            }
        }

        throw toApiError(error);
    },
);

// ─── Scan-limit header snapshot (guide §5: X-Scan-* on every upload attempt) ─
export type ScanQuota = { used: number; limit: number; tier: string } | null;

export function extractScanQuota(headers: Record<string, any> | undefined): ScanQuota {
    if (!headers) return null;
    const used = Number(headers["x-scan-count-today"]);
    const limit = Number(headers["x-scan-limit"]);
    const tier = headers["x-scan-tier"] ?? "free";
    if (Number.isNaN(used) || Number.isNaN(limit)) return null;
    return { used, limit, tier };
}

// ─── Health (guide §6) ───────────────────────────────────────────────────────
export async function fetchHealth() {
    const { data } = await axios.get(apiUrl("/health"), { timeout: 8000 });
    return data as import("@/types/api").HealthResponse;
}
