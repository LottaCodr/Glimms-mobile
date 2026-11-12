/**
 * The paywall end to end inside the app: real screen, hook, plan building and
 * auth store; only the HTTP-facing subscription service is replaced.
 */
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import PaywallScreen from "@/app/paywall";
import { refreshTokens } from "@/services/api.client";
import * as authApi from "@/services/auth.services";
import { subscriptionService } from "@/services/subscription.service";
import { useAuthStore } from "@/store/auth.store";
import type { PlanPrice } from "@/types/api";

jest.mock("expo-router", () => ({
    useRouter: () => ({ back: jest.fn(), push: jest.fn(), canGoBack: () => false }),
}));
jest.mock("@/services/subscription.service", () => ({
    subscriptionService: {
        me: jest.fn(),
        prices: jest.fn(),
        openCheckout: jest.fn(),
        confirm: jest.fn(),
        waitForPayment: jest.fn(),
        credoPlans: jest.fn(async () => []),
    },
}));
jest.mock("@/services/api.client", () => ({
    ...jest.requireActual("@/services/api.client"),
    refreshTokens: jest.fn(async () => null),
}));
jest.mock("@/services/auth.services");
jest.mock("@/services/notifications.service", () => ({ notificationService: {} }));
jest.mock("@/services/analytics.service", () => ({ analyticsService: { track: jest.fn() } }));
jest.mock("@/services/websocket.service", () => ({ wsService: { disconnect: jest.fn() } }));

const service = subscriptionService as jest.Mocked<typeof subscriptionService>;
const inactive = { status: "inactive", tier: "free" } as any;
const price = (tier: "premium" | "pro", unitAmount: number): PlanPrice => ({
    tier, planCode: `PLN_${tier}`, name: tier, description: null,
    currency: "usd", unitAmount, interval: "month", intervalCount: 1, trialDays: null,
});

function renderPaywall() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    return render(
        <QueryClientProvider client={client}>
            <PaywallScreen />
        </QueryClientProvider>,
    );
}

beforeEach(() => {
    useAuthStore.setState({ user: { id: "u1", tier: "free" } as any, isAuthenticated: true, isLoading: false });
    service.me.mockResolvedValue(inactive);
    service.prices.mockResolvedValue([price("premium", 999), price("pro", 1999)]);
});

it("lists the paid plans with the server's prices", async () => {
    renderPaywall();

    expect(await screen.findByText("$9.99")).toBeTruthy();
    expect(screen.getByText("$19.99")).toBeTruthy();
    expect(screen.queryByText("Free")).toBeNull();
});

it("says upgrades are unavailable when the server sells nothing", async () => {
    service.prices.mockResolvedValue([]);
    renderPaywall();

    expect(await screen.findByText(/Upgrades aren't available right now/)).toBeTruthy();
    expect(screen.getAllByText("Coming soon")).toHaveLength(2);
});

it("offers a retry when plans cannot be loaded", async () => {
    service.prices.mockRejectedValueOnce(new Error("offline"));
    renderPaywall();

    fireEvent.press(await screen.findByText(/Couldn't load plans/));

    expect(await screen.findByText("$9.99")).toBeTruthy();
});

it("opens checkout for the chosen plan", async () => {
    service.openCheckout.mockResolvedValue({ reference: "glm_1", result: { type: "success" } } as any);
    service.waitForPayment.mockResolvedValue("paid");
    renderPaywall();

    fireEvent.press(await screen.findByLabelText("Choose Pro plan"));

    await waitFor(() => expect(service.openCheckout).toHaveBeenCalledWith("pro"));
    await waitFor(() => expect(service.waitForPayment).toHaveBeenCalledWith("glm_1"));
});

it("picks up the new tier once the subscription is active", async () => {
    service.openCheckout.mockResolvedValue({ reference: "glm_1", result: { type: "success" } } as any);
    service.waitForPayment.mockResolvedValue("paid");
    (authApi.fetchMe as jest.Mock).mockResolvedValue({ id: "u1", tier: "pro" });
    renderPaywall();

    fireEvent.press(await screen.findByLabelText("Choose Pro plan"));

    // New access token (it carries the tier used for scan limits), then the profile.
    await waitFor(() => expect(refreshTokens).toHaveBeenCalled());
    await waitFor(() => expect(useAuthStore.getState().user?.tier).toBe("pro"));
});

it("tells the user nothing was charged when they close checkout unpaid", async () => {
    service.openCheckout.mockResolvedValue({ reference: "glm_1", result: { type: "cancel" } } as any);
    service.confirm.mockResolvedValue("pending");
    renderPaywall();

    fireEvent.press(await screen.findByLabelText("Choose Premium plan"));

    expect(await screen.findByText("Checkout closed — no charge was made.")).toBeTruthy();
    // One look, in case they paid and then closed the browser; no long wait.
    expect(service.confirm).toHaveBeenCalledWith("glm_1");
    expect(service.waitForPayment).not.toHaveBeenCalled();
});

it("upgrades a user who paid and then closed the browser themselves", async () => {
    service.openCheckout.mockResolvedValue({ reference: "glm_1", result: { type: "dismiss" } } as any);
    service.confirm.mockResolvedValue("paid");
    (authApi.fetchMe as jest.Mock).mockResolvedValue({ id: "u1", tier: "premium" });
    renderPaywall();

    fireEvent.press(await screen.findByLabelText("Choose Premium plan"));

    await waitFor(() => expect(useAuthStore.getState().user?.tier).toBe("premium"));
});

it("says so when the payment was declined", async () => {
    service.openCheckout.mockResolvedValue({ reference: "glm_1", result: { type: "success" } } as any);
    service.waitForPayment.mockResolvedValue("failed");
    renderPaywall();

    fireEvent.press(await screen.findByLabelText("Choose Premium plan"));

    expect(await screen.findByText(/payment did not go through/i)).toBeTruthy();
});

it("shows the server's reason when checkout cannot start", async () => {
    service.openCheckout.mockRejectedValue(new Error("You already have a subscription."));
    renderPaywall();

    fireEvent.press(await screen.findByLabelText("Choose Premium plan"));

    expect(await screen.findByText("You already have a subscription.")).toBeTruthy();
});

it("shows naira prices with the naira sign", async () => {
    service.prices.mockResolvedValue([{ ...price("premium", 250000), currency: "ngn" }]);
    renderPaywall();
    expect(await screen.findByText("₦2,500")).toBeTruthy();
});
