/**
 * Subscriptions (Stripe) — guide §12.
 *
 * Plans and prices come from the API (GET /prices); the app holds no price IDs.
 * Checkout: POST /checkout → open the hosted Stripe page in expo-web-browser →
 * poll /me until the Stripe webhook flips the status to active.
 * Billing management: POST /portal → open the Stripe billing portal.
 */
import * as WebBrowser from "expo-web-browser";
import { apiClient, ApiError } from "./api.client";
import type {
    CheckoutResponse,
    PaidTier,
    PlanPrice,
    PortalResponse,
    PricesResponse,
    Subscription,
} from "@/types/api";

/** Only ever hand the in-app browser a page on the expected Stripe host. */
function assertHostedBy(url: unknown, origin: string): asserts url is string {
    if (typeof url !== "string" || !url.startsWith(`${origin}/`)) {
        throw new ApiError(400, {
            error: "Unexpected billing link — refusing to open it.",
            code: "UNTRUSTED_REDIRECT",
        });
    }
}

export const subscriptionService = {
    /** Free users get a default `{ status: "inactive", tier: "free" }` (200, never 404). */
    async me(): Promise<Subscription> {
        const { data } = await apiClient.get<Subscription>("/api/subscriptions/me");
        return data;
    },

    /** Plans that can be bought right now. Empty when purchases are switched off. */
    async prices(): Promise<PlanPrice[]> {
        const { data } = await apiClient.get<PricesResponse>("/api/subscriptions/prices");
        return Array.isArray(data?.prices) ? data.prices : [];
    },

    async createCheckout(tier: PaidTier): Promise<CheckoutResponse> {
        const { data } = await apiClient.post<CheckoutResponse>("/api/subscriptions/checkout", { tier });
        return data;
    },

    /** Opens Stripe Checkout in an in-app browser session. Return URLs are configured server-side. */
    async openCheckout(tier: PaidTier): Promise<WebBrowser.WebBrowserResult> {
        const { url } = await this.createCheckout(tier);
        assertHostedBy(url, "https://checkout.stripe.com");
        return WebBrowser.openBrowserAsync(url);
    },

    /** Opens the Stripe billing portal (change plan, payment method, cancel). */
    async openBillingPortal(): Promise<WebBrowser.WebBrowserResult> {
        const { data } = await apiClient.post<PortalResponse>("/api/subscriptions/portal");
        assertHostedBy(data?.url, "https://billing.stripe.com");
        return WebBrowser.openBrowserAsync(data.url);
    },

    /**
     * After returning from checkout, the Stripe webhook needs a moment.
     * Poll every 2s (max ~14s) until the subscription reports active.
     */
    async waitUntilActive(opts: { attempts?: number; intervalMs?: number } = {}): Promise<Subscription> {
        const attempts = opts.attempts ?? 7;
        const intervalMs = opts.intervalMs ?? 2000;
        let sub = await this.me();
        for (let i = 0; i < attempts && sub.status !== "active"; i++) {
            await new Promise((r) => setTimeout(r, intervalMs));
            sub = await this.me();
        }
        return sub;
    },
};
