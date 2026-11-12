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
        const prices = [{ tier: "premium", planCode: "PLN_1", unitAmount: 250000, currency: "ngn" }];
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
    const openAuthSession = WebBrowser.openAuthSessionAsync as jest.Mock;
    beforeEach(() => openAuthSession.mockClear());

    it("asks the server for a checkout by tier and opens Paystack in a session that returns to the app", async () => {
        api.post.mockResolvedValue({ data: { reference: "glm_1", url: "https://checkout.paystack.com/abc123" } });
        openAuthSession.mockResolvedValue({ type: "success", url: "glimms://billing/return?status=paid" });

        const { reference, result } = await subscriptionService.openCheckout("pro");

        expect(api.post).toHaveBeenCalledWith("/api/subscriptions/checkout", { tier: "pro" });
        expect(openAuthSession).toHaveBeenCalledWith("https://checkout.paystack.com/abc123", "glimms://billing/return");
        expect(reference).toBe("glm_1");
        expect(result.type).toBe("success");
    });

    it.each([
        "https://evil.example/checkout",
        "https://checkout.paystack.com.evil.example/pay",
        "https://checkout.paystack.com@evil.example/pay",
        "https://evilpaystack.com/abc",
        "http://checkout.paystack.com/abc123",
        "javascript:alert(1)",
        undefined,
    ])("refuses to open %s", async (url) => {
        api.post.mockResolvedValue({ data: { reference: "glm_1", url } });

        await expect(subscriptionService.openCheckout("premium")).rejects.toMatchObject({ code: "UNTRUSTED_REDIRECT" });
        expect(openAuthSession).not.toHaveBeenCalled();
    });
});

describe("confirm / waitForPayment", () => {
    it("asks the server what Paystack says about the payment", async () => {
        api.post.mockResolvedValueOnce({ data: { status: "paid", tier: "pro" } });
        await expect(subscriptionService.confirm("glm_1")).resolves.toBe("paid");
        expect(api.post).toHaveBeenCalledWith("/api/subscriptions/confirm", { reference: "glm_1" });
    });

    it("polls until the payment is settled", async () => {
        api.post.mockReset();
        api.post
            .mockResolvedValueOnce({ data: { status: "pending" } })
            .mockResolvedValueOnce({ data: { status: "pending" } })
            .mockResolvedValueOnce({ data: { status: "failed" } });

        await expect(subscriptionService.waitForPayment("glm_1", { intervalMs: 0 })).resolves.toBe("failed");
        expect(api.post).toHaveBeenCalledTimes(3);
    });

    it("gives up after the allowed attempts and reports it as pending", async () => {
        api.post.mockReset();
        api.post.mockResolvedValue({ data: { status: "pending" } });

        await expect(subscriptionService.waitForPayment("glm_1", { attempts: 2, intervalMs: 0 })).resolves.toBe("pending");
        expect(api.post).toHaveBeenCalledTimes(3); // first look + 2 retries
    });
});

describe("openBillingPortal", () => {
    beforeEach(() => openBrowser.mockClear());

    it("opens Paystack's manage-subscription page", async () => {
        const url = "https://paystack.com/manage/subscriptions/SUB_1?subscription_token=t";
        api.post.mockResolvedValue({ data: { url } });

        await subscriptionService.openBillingPortal();

        expect(api.post).toHaveBeenCalledWith("/api/subscriptions/portal");
        expect(openBrowser).toHaveBeenCalledWith(url);
    });

    it("refuses a link on another host", async () => {
        api.post.mockResolvedValue({ data: { url: "https://paystack.com.evil.example/manage" } });
        await expect(subscriptionService.openBillingPortal()).rejects.toMatchObject({ code: "UNTRUSTED_REDIRECT" });
        expect(openBrowser).not.toHaveBeenCalled();
    });
});

describe("Credo (naira) payments", () => {
    const openAuthSession = WebBrowser.openAuthSessionAsync as jest.Mock;

    it("lists the passes the server sells, and none when the response is malformed", async () => {
        const plans = [{ tier: "premium", currency: "NGN", amount: 250000, periodDays: 30, feeOnTop: false }];
        api.get.mockResolvedValueOnce({ data: { plans } });
        await expect(subscriptionService.credoPlans()).resolves.toEqual(plans);
        expect(api.get).toHaveBeenCalledWith("/api/subscriptions/credo/plans");

        api.get.mockResolvedValueOnce({ data: null });
        await expect(subscriptionService.credoPlans()).resolves.toEqual([]);
    });

    it("opens Credo's checkout in a session that returns to the app", async () => {
        api.post.mockResolvedValue({ data: { url: "https://pay.credocentral.com/checkout/abc", reference: "glm1" } });
        openAuthSession.mockResolvedValue({ type: "success", url: "glimms://billing/return?status=paid" });

        const { reference } = await subscriptionService.openCredoCheckout("premium");

        expect(api.post).toHaveBeenCalledWith("/api/subscriptions/credo/checkout", { tier: "premium" });
        expect(openAuthSession).toHaveBeenCalledWith("https://pay.credocentral.com/checkout/abc", "glimms://billing/return");
        expect(reference).toBe("glm1");
    });

    it("accepts the sandbox checkout host", async () => {
        api.post.mockResolvedValue({ data: { url: "https://pay.credodemo.com/checkout/abc", reference: "glm1" } });
        openAuthSession.mockResolvedValue({ type: "dismiss" });
        await expect(subscriptionService.openCredoCheckout("pro")).resolves.toMatchObject({ reference: "glm1" });
    });

    it.each([
        "https://evil.example/checkout",
        "https://pay.credocentral.com.evil.example/checkout",
        "https://pay.credocentral.com@evil.example/checkout",
        "https://evilcredocentral.com/checkout",
        "http://pay.credocentral.com/checkout",
        "javascript:alert(1)",
        undefined,
    ])("refuses to open %s", async (url) => {
        openAuthSession.mockClear();
        api.post.mockResolvedValue({ data: { url, reference: "glm1" } });

        await expect(subscriptionService.openCredoCheckout("premium")).rejects.toMatchObject({ code: "UNTRUSTED_REDIRECT" });
        expect(openAuthSession).not.toHaveBeenCalled();
    });

    it("polls the server until the payment is settled", async () => {
        api.post
            .mockResolvedValueOnce({ data: { status: "pending" } })
            .mockResolvedValueOnce({ data: { status: "pending" } })
            .mockResolvedValueOnce({ data: { status: "paid" } });

        await expect(subscriptionService.waitForCredo("glm1", { intervalMs: 0 })).resolves.toBe("paid");
        expect(api.post).toHaveBeenLastCalledWith("/api/subscriptions/credo/confirm", { reference: "glm1" });
    });

    it("reports a payment that never settles as pending", async () => {
        api.post.mockResolvedValue({ data: { status: "pending" } });
        await expect(subscriptionService.waitForCredo("glm1", { attempts: 2, intervalMs: 0 })).resolves.toBe("pending");
    });
});
