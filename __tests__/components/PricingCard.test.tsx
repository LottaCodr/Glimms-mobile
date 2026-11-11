import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { PricingCard } from "@/components/premium/PricingCard";
import { buildPlans } from "@/lib/subscription/plans";
import type { PlanPrice } from "@/types/api";

const premiumPrice: PlanPrice = {
    tier: "premium", priceId: "price_1", name: "Glimms Premium", description: null,
    currency: "usd", unitAmount: 999, interval: "month", intervalCount: 1, trialDays: 7,
};
const plan = (id: string, prices: PlanPrice[] = [premiumPrice]) => buildPlans(prices).find((p) => p.id === id)!;

it("shows the server's price, the plan's features and the trial", () => {
    render(<PricingCard plan={plan("premium")} onSelect={jest.fn()} />);

    expect(screen.getByText("Premium")).toBeTruthy();
    expect(screen.getByText("$9.99")).toBeTruthy();
    expect(screen.getByText("/month")).toBeTruthy();
    expect(screen.getByText("7-day free trial")).toBeTruthy();
    expect(screen.getByText("100 scans per day")).toBeTruthy();
    expect(screen.getByText("MOST POPULAR")).toBeTruthy();
});

it("selects the plan when the button is pressed", () => {
    const onSelect = jest.fn();
    render(<PricingCard plan={plan("premium")} onSelect={onSelect} />);

    fireEvent.press(screen.getByLabelText("Choose Premium plan"));

    expect(onSelect).toHaveBeenCalledWith("premium");
});

it("cannot be chosen when the server does not sell the plan", () => {
    const onSelect = jest.fn();
    render(<PricingCard plan={plan("pro")} onSelect={onSelect} />);

    expect(screen.getByText("Coming soon")).toBeTruthy();
    expect(screen.getByText("Not available yet")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Choose Pro plan"));
    expect(onSelect).not.toHaveBeenCalled();
});

it("cannot be pressed again while a checkout is opening", () => {
    const onSelect = jest.fn();
    render(<PricingCard plan={plan("premium")} onSelect={onSelect} loading />);

    fireEvent.press(screen.getByLabelText("Choose Premium plan"));

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByText("Choose Plan")).toBeNull();
});
