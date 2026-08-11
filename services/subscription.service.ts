/**
 * Subscriptions (Stripe) — guide §12.
 *
 * Mobile flow: POST /checkout → open the hosted Stripe Checkout URL in
 * expo-web-browser → poll /me until the Stripe webhook flips status to active.
 *
 * Gaps on the backend (per guide): no /prices or /portal endpoints, so price IDs
 * come from env and billing management isn't available yet.
 */
import * as WebBrowser from "expo-web-browser";
import { apiClient, ApiError } from "./api.client";
import { ENV } from "@/config/env";
import type { CheckoutResponse, Subscription } from "@/types/api";

export const subscriptionService = {
    /** Free users get a default `{ status: "inactive", tier: "free" }` (200, never 404). */
    async me(): Promise<Subscription> {
        const { data } = await apiClient.get<Subscription>("/api/subscriptions/me");
        return data;
    },

    async createCheckout(priceId: string): Promise<CheckoutResponse> {
        // Security checklist (§19): only allow env-allowlisted price IDs.
        const allowed = [ENV.STRIPE_PREMIUM_PRICE_ID, ENV.STRIPE_PRO_PRICE_ID].filter(Boolean);
        if (!/^price_[A-Za-z0-9]+$/.test(priceId) || !allowed.includes(priceId)) {
            throw new ApiError(400, {
                error: "This plan isn't available right now. Please try again later.",
                code: "INVALID_PRICE",
            });
        }
        const { data } = await apiClient.post<CheckoutResponse>("/api/subscriptions/checkout", {
            priceId,
        });
        return data;
    },

    /** Opens Stripe Checkout in an in-app browser session. Deep-link return is configured server-side. */
    async openCheckout(priceId: string): Promise<WebBrowser.WebBrowserResult> {
        const { url } = await this.createCheckout(priceId);
        if (!url.startsWith("https://checkout.stripe.com/")) {
            throw new ApiError(400, {
                error: "Unexpected checkout URL — refusing to open it.",
                code: "UNTRUSTREDIRECT",
            });
        }
        return WebBrowser.openBrowserAsync(url);
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
