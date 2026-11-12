/**
 * Subscriptions — guide §12. Paystack (renewing card subscriptions) and Credo
 * by eTranzact (naira card / bank-transfer passes that last a fixed period).
 *
 * Plans and prices come from the API (GET /prices); the app holds no plan codes.
 * Checkout: POST /checkout → open Paystack's hosted page in an in-app browser
 * session → ask the API (POST /confirm) whether Paystack says it was paid.
 * Billing management: POST /portal → open Paystack's manage-subscription page.
 */
import * as WebBrowser from "expo-web-browser";
import { apiClient, ApiError } from "./api.client";
import type {
    CheckoutResponse,
    CredoCheckoutResponse,
    CredoPaymentStatus,
    CredoPlan,
    PaymentStatus,
    PaidTier,
    PlanPrice,
    PortalResponse,
    PricesResponse,
    Subscription,
} from "@/types/api";

/** Paystack's hosted pages: checkout.paystack.com and paystack.com/manage/…. */
const PAYSTACK_HOST = /(^|\.)paystack\.com$/;
/** Credo's hosted checkout lives on these hosts (live and sandbox). */
const CREDO_HOST = /(^|\.)(credocentral\.com|credodemo\.com)$/;

/** Only ever hand the in-app browser an https page on the expected provider's host. */
function assertHostedBy(url: unknown, allowed: RegExp): asserts url is string {
    let host = "";
    if (typeof url === "string" && url.startsWith("https://")) {
        // Authority = everything up to the first "/", "?" or "#"; reject userinfo tricks.
        const authority = url.slice("https://".length).split(/[/?#]/)[0];
        if (!authority.includes("@")) host = authority.split(":")[0].toLowerCase();
    }
    if (!host || !allowed.test(host)) {
        throw new ApiError(400, {
            error: "Unexpected billing link — refusing to open it.",
            code: "UNTRUSTED_REDIRECT",
        });
    }
}

/** Where the API sends the browser when a payment finishes. */
export const BILLING_RETURN_URL = "glimms://billing/return";
export const CREDO_RETURN_URL = BILLING_RETURN_URL;

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

    /**
     * Opens Paystack's hosted checkout and resolves when the browser closes or
     * returns to the app. The reference is what `confirm` checks.
     */
    async openCheckout(tier: PaidTier): Promise<{ reference: string; result: WebBrowser.WebBrowserAuthSessionResult }> {
        const { url, reference } = await this.createCheckout(tier);
        assertHostedBy(url, PAYSTACK_HOST);
        const result = await WebBrowser.openAuthSessionAsync(url, BILLING_RETURN_URL);
        return { reference, result };
    },

    /** Asks the API to check the payment with Paystack. Safe to call repeatedly. */
    async confirm(reference: string): Promise<PaymentStatus> {
        const { data } = await apiClient.post<{ status: PaymentStatus }>("/api/subscriptions/confirm", { reference });
        return data.status;
    },

    /** Polls until the payment is paid or failed, or gives up and reports it as still pending. */
    async waitForPayment(reference: string, opts: { attempts?: number; intervalMs?: number } = {}): Promise<PaymentStatus> {
        const attempts = opts.attempts ?? 6;
        const intervalMs = opts.intervalMs ?? 2500;
        let status = await this.confirm(reference);
        for (let i = 0; i < attempts && status === "pending"; i++) {
            await new Promise((r) => setTimeout(r, intervalMs));
            status = await this.confirm(reference);
        }
        return status;
    },

    /** Opens Paystack's manage-subscription page (update card, cancel). */
    async openBillingPortal(): Promise<WebBrowser.WebBrowserResult> {
        const { data } = await apiClient.post<PortalResponse>("/api/subscriptions/portal");
        assertHostedBy(data?.url, PAYSTACK_HOST);
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
        assertHostedBy(data?.url, CREDO_HOST);
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
};
