import { buildPlans, formatInterval, formatPrice } from "@/lib/subscription/plans";
import type { PlanPrice } from "@/types/api";

const premium: PlanPrice = {
    tier: "premium", priceId: "price_1", name: "Glimms Premium", description: null,
    currency: "usd", unitAmount: 999, interval: "month", intervalCount: 1, trialDays: null,
};

describe("formatPrice", () => {
    it("formats minor units as money", () => {
        expect(formatPrice(999, "usd")).toBe("$9.99");
        expect(formatPrice(1050, "usd")).toBe("$10.50");
    });

    it("drops the cents for whole amounts", () => {
        expect(formatPrice(2000, "usd")).toBe("$20");
    });

    it("does not divide zero-decimal currencies", () => {
        expect(formatPrice(1500, "jpy")).toBe("¥1,500");
    });

    it("falls back to the currency code when it cannot be formatted", () => {
        expect(formatPrice(999, "not-a-currency")).toBe("NOT-A-CURRENCY 9.99");
    });
});

describe("formatInterval", () => {
    it("names the billing period", () => {
        expect(formatInterval("month", 1)).toBe("month");
        expect(formatInterval("month", 3)).toBe("3 months");
    });
});

describe("buildPlans", () => {
    it("always lists free, premium and pro in that order", () => {
        expect(buildPlans([]).map((p) => p.id)).toEqual(["free", "premium", "pro"]);
    });

    it("prices a tier from the server and makes it purchasable", () => {
        const plan = buildPlans([{ ...premium, trialDays: 7 }]).find((p) => p.id === "premium")!;
        expect(plan).toMatchObject({ price: "$9.99", interval: "month", trialDays: 7, purchasable: true });
    });

    it("shows a tier the server does not sell as unavailable, with no invented price", () => {
        const plans = buildPlans([premium]);
        expect(plans.find((p) => p.id === "pro")).toMatchObject({ price: null, purchasable: false });
    });

    it("treats a missing price list as nothing for sale", () => {
        expect(buildPlans(undefined).filter((p) => p.purchasable)).toEqual([]);
    });

    it("never offers the free plan for purchase", () => {
        expect(buildPlans([premium]).find((p) => p.id === "free")).toMatchObject({ price: "$0", purchasable: false });
    });
});
