/**
 * Central environment configuration.
 *
 * Expo exposes EXPO_PUBLIC_* vars to JS at bundle time. For physical devices,
 * point these at your machine's LAN IP (see FRONTEND_INTEGRATION.md §2):
 *
 *   EXPO_PUBLIC_API_URL=http://192.168.x.x:4000
 *   EXPO_PUBLIC_WS_URL=ws://192.168.x.x:4000
 */
import Constants from "expo-constants";

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, any>;

const pick = (envVal: string | undefined, extraKey: string, fallback: string) =>
    envVal ?? extra[extraKey] ?? fallback;

export const ENV = {
    /** Root of glimms-api. REST lives at `${API_URL}/api/...`, v1 sessions at `${API_URL}/v1/...`. */
    API_URL: pick(process.env.EXPO_PUBLIC_API_URL, "apiUrl", "http://localhost:4000"),
    /** Socket.IO endpoint (same host as the API). */
    WS_URL: pick(process.env.EXPO_PUBLIC_WS_URL ?? process.env.EXPO_PUBLIC_API_URL, "wsUrl", "http://localhost:4000"),

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
