/**
 * Subscriptions — guide §12. Stripe (renewing card subscriptions) and Credo by
 * eTranzact (naira card / bank-transfer passes that last a fixed period).
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
    CredoCheckoutResponse,
    CredoPaymentStatus,
    CredoPlan,
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

/** Credo's hosted checkout lives on these hosts (live and sandbox). */
const CREDO_HOST = /(^|\.)(credocentral\.com|credodemo\.com)$/;

function assertCredoCheckout(url: unknown): asserts url is string {
    let host = "";
    if (typeof url === "string" && url.startsWith("https://")) {
        // Authority = everything up to the first "/", "?" or "#"; reject userinfo tricks.
        const authority = url.slice("https://".length).split(/[/?#]/)[0];
        if (!authority.includes("@")) host = authority.split(":")[0].toLowerCase();
    }
    if (!host || !CREDO_HOST.test(host)) {
        throw new ApiError(400, {
            error: "Unexpected payment link — refusing to open it.",
            code: "UNTRUSTED_REDIRECT",
        });
    }
}

/** Where the API sends the browser when a Credo payment finishes. */
export const CREDO_RETURN_URL = "glimms://billing/return";

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

    // ── Credo (eTranzact): naira card / bank transfer passes ────────────────

    /** Naira passes that can be bought. Empty when Credo is switched off. */
    async credoPlans(): Promise<CredoPlan[]> {
        const { data } = await apiClient.get<{ plans?: CredoPlan[] }>("/api/subscriptions/credo/plans");
        return Array.isArray(data?.plans) ? data.plans : [];
    },

    /**
     * Opens Credo's hosted checkout and resolves when the browser closes or
     * returns to the app. The reference is what `confirmCredo` checks.
     */
    async openCredoCheckout(tier: PaidTier): Promise<{ reference: string; result: WebBrowser.WebBrowserAuthSessionResult }> {
        const { data } = await apiClient.post<CredoCheckoutResponse>("/api/subscriptions/credo/checkout", { tier });
        assertCredoCheckout(data?.url);
        const result = await WebBrowser.openAuthSessionAsync(data.url, CREDO_RETURN_URL);
        return { reference: data.reference, result };
    },

    /** Asks the API to check the payment with Credo. Safe to call repeatedly. */
    async confirmCredo(reference: string): Promise<CredoPaymentStatus> {
        const { data } = await apiClient.post<{ status: CredoPaymentStatus }>("/api/subscriptions/credo/confirm", { reference });
        return data.status;
    },

    /**
     * Bank transfers can take a little while to land. Polls until the payment
     * is paid or failed, or gives up and reports it as still pending.
     */
    async waitForCredo(reference: string, opts: { attempts?: number; intervalMs?: number } = {}): Promise<CredoPaymentStatus> {
        const attempts = opts.attempts ?? 6;
        const intervalMs = opts.intervalMs ?? 2500;
        let status = await this.confirmCredo(reference);
        for (let i = 0; i < attempts && status === "pending"; i++) {
            await new Promise((r) => setTimeout(r, intervalMs));
            status = await this.confirmCredo(reference);
        }
        return status;
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
