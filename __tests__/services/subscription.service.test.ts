import * as WebBrowser from "expo-web-browser";
import { apiClient } from "@/services/api.client";
import { subscriptionService } from "@/services/subscription.service";

jest.mock("@/services/api.client", () => {
    const actual = jest.requireActual("@/services/api.client");
    return { ...actual, apiClient: { get: jest.fn(), post: jest.fn() } };
});

const api = apiClient as unknown as { get: jest.Mock; post: jest.Mock };
const openBrowser = WebBrowser.openBrowserAsync as jest.Mock;

describe("prices", () => {
    it("returns the plans the server sells", async () => {
        const prices = [{ tier: "premium", priceId: "price_1", unitAmount: 999, currency: "usd" }];
        api.get.mockResolvedValue({ data: { prices } });

        await expect(subscriptionService.prices()).resolves.toEqual(prices);
        expect(api.get).toHaveBeenCalledWith("/api/subscriptions/prices");
    });

    it("treats a malformed response as nothing for sale", async () => {
        api.get.mockResolvedValue({ data: {} });
        await expect(subscriptionService.prices()).resolves.toEqual([]);
    });
});

describe("openCheckout", () => {
    it("asks the server for a session by tier and opens Stripe Checkout", async () => {
        api.post.mockResolvedValue({ data: { id: "cs_1", url: "https://checkout.stripe.com/c/pay/cs_1" } });

        await subscriptionService.openCheckout("pro");

        expect(api.post).toHaveBeenCalledWith("/api/subscriptions/checkout", { tier: "pro" });
        expect(openBrowser).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_1");
    });

    it.each([
        "https://evil.example/checkout",
        "https://checkout.stripe.com.evil.example/pay",
        "http://checkout.stripe.com/c/pay/cs_1",
        undefined,
    ])("refuses to open %s", async (url) => {
        api.post.mockResolvedValue({ data: { id: "cs_1", url } });

        await expect(subscriptionService.openCheckout("premium")).rejects.toMatchObject({ code: "UNTRUSTED_REDIRECT" });
        expect(openBrowser).not.toHaveBeenCalled();
    });
});

describe("openBillingPortal", () => {
    it("opens the Stripe billing portal", async () => {
        api.post.mockResolvedValue({ data: { url: "https://billing.stripe.com/p/session/1" } });

        await subscriptionService.openBillingPortal();

        expect(api.post).toHaveBeenCalledWith("/api/subscriptions/portal");
        expect(openBrowser).toHaveBeenCalledWith("https://billing.stripe.com/p/session/1");
    });

    it("refuses a portal link on another host", async () => {
        api.post.mockResolvedValue({ data: { url: "https://checkout.stripe.com/c/pay/cs_1" } });
        await expect(subscriptionService.openBillingPortal()).rejects.toMatchObject({ code: "UNTRUSTED_REDIRECT" });
        expect(openBrowser).not.toHaveBeenCalled();
    });
});

describe("waitUntilActive", () => {
    it("polls until the webhook has activated the subscription", async () => {
        api.get
            .mockResolvedValueOnce({ data: { status: "inactive" } })
            .mockResolvedValueOnce({ data: { status: "inactive" } })
            .mockResolvedValueOnce({ data: { status: "active" } });

        const sub = await subscriptionService.waitUntilActive({ attempts: 5, intervalMs: 0 });

        expect(sub.status).toBe("active");
        expect(api.get).toHaveBeenCalledTimes(3);
    });

    it("gives up after the allowed attempts and reports the last status", async () => {
        api.get.mockResolvedValue({ data: { status: "inactive" } });

        const sub = await subscriptionService.waitUntilActive({ attempts: 2, intervalMs: 0 });

        expect(sub.status).toBe("inactive");
        expect(api.get).toHaveBeenCalledTimes(3); // first look + 2 retries
    });
});
