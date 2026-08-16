/**
 * Central environment configuration.
 *
 * Expo exposes EXPO_PUBLIC_* vars to JS at bundle time. For physical devices,
 * point these at your machine's LAN IP (see FRONTEND_INTEGRATION.md §2):
 *
 *   EXPO_PUBLIC_API_URL=http://192.168.x.x:4000
 *   EXPO_PUBLIC_WS_URL=http://192.168.x.x:4000
 */
import Constants from "expo-constants";
import { Platform } from "react-native";

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | number | null | undefined>;

function configuredValue(envVal: string | undefined, extraKey: string): string | undefined {
    const value = envVal ?? extra[extraKey];
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Find the machine running Metro when the app is opened in Expo Go.
 * `localhost` on a phone means the phone itself, not the development machine,
 * so using it as the mobile fallback makes every API call fail.
 */
function metroHost(): string | null {
    const hostUri = Constants.expoConfig?.hostUri;
    if (!hostUri) return null;

    try {
        return new URL(hostUri.includes("://") ? hostUri : `http://${hostUri}`).hostname;
    } catch {
        // Older Expo manifests can expose a simple host:port value that URL
        // cannot parse (notably some IPv6 forms). IPv4/hostname is enough for
        // the automatic development fallback; users can configure IPv6 URLs.
        return hostUri.split(":")[0] || null;
    }
}

function developmentApiUrl(): string {
    if (Platform.OS === "web") return "http://localhost:4000";

    const host = metroHost();
    if (host && host !== "localhost" && host !== "127.0.0.1" && host !== "[::1]") {
        return `http://${host}:4000`;
    }

    // Android emulators reach services on the host through this special IP.
    // iOS Simulator can use localhost directly.
    return Platform.OS === "android" ? "http://10.0.2.2:4000" : "http://localhost:4000";
}

function baseUrl(value: string): string {
    return value.replace(/\/+$/, "");
}

const configuredApiUrl = configuredValue(process.env.EXPO_PUBLIC_API_URL, "apiUrl");
const configuredWsUrl = configuredValue(process.env.EXPO_PUBLIC_WS_URL, "wsUrl");
const apiUrlRoot = baseUrl(configuredApiUrl ?? developmentApiUrl());

export const ENV = {
    /** Root of glimms-api. REST lives at `${API_URL}/api/...`, v1 sessions at `${API_URL}/v1/...`. */
    API_URL: apiUrlRoot,
    /** Socket.IO endpoint (same host as the API unless explicitly overridden). */
    WS_URL: baseUrl(configuredWsUrl ?? apiUrlRoot),

    API_TIMEOUT: Number(process.env.EXPO_PUBLIC_API_TIMEOUT ?? extra.apiTimeout) || 20000,
    /** Uploads + pipeline waits can be slow (sharp → S3 → queue). */
    UPLOAD_TIMEOUT: Number(process.env.EXPO_PUBLIC_UPLOAD_TIMEOUT ?? extra.uploadTimeout) || 120000,
    API_RETRY: Number(process.env.EXPO_PUBLIC_API_RETRY ?? extra.apiRetry) || 3,

    /** Stripe price IDs (guide §12 — backend has no /prices endpoint yet, so they live in env). */
    STRIPE_PREMIUM_PRICE_ID: process.env.EXPO_PUBLIC_STRIPE_PREMIUM_PRICE_ID ?? extra.stripePremiumPriceId ?? "",
    STRIPE_PRO_PRICE_ID: process.env.EXPO_PUBLIC_STRIPE_PRO_PRICE_ID ?? extra.stripeProPriceId ?? "",

    // Client-side mirrors of backend limits (guide §5/§8).
    SCAN_MAX_IMAGES: 5,
    SCAN_MAX_FILE_BYTES: 15 * 1024 * 1024, // 15 MB (v1 sessions)
    ALLOWED_IMAGE_MIME: ["image/jpeg", "image/png", "image/webp"] as readonly string[],

    /** Daily scan quotas by tier — display only, backend is the source of truth via X-Scan-* headers. */
    SCAN_LIMITS: { free: 10, premium: 100, pro: Infinity } as Record<string, number>,
} as const;

export const apiUrl = (path: string) => `${ENV.API_URL}${path.startsWith("/") ? path : `/${path}`}`;
