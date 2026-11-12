/**
 * Paywall plans: what each tier includes (app copy) joined with what it costs
 * (GET /api/subscriptions/prices). The server decides what is for sale; a paid
 * tier the server does not list is shown but cannot be bought.
 */
import type { PlanPrice, Tier } from "@/types/api";

export interface SubscriptionPlan {
    id: Tier;
    name: string;
    /** Formatted price, e.g. "$9.99". Null when the server lists no price for the tier. */
    price: string | null;
    /** Billing period, e.g. "month" or "3 months". */
    interval: string;
    trialDays: number | null;
    features: string[];
    isPopular?: boolean;
    purchasable: boolean;
}

const PLAN_COPY: Record<Tier, { name: string; features: string[]; isPopular?: boolean }> = {
    free: {
        name: "Free",
        features: ["10 scans per day", "Standard AI designs", "Basic catalog"],
    },
    premium: {
        name: "Premium",
        features: ["100 scans per day", "Priority AI pipeline", "Climate-aware styling"],
        isPopular: true,
    },
    pro: {
        name: "Pro",
        features: ["Unlimited scans", "Fastest priority queue", "Early feature access"],
    },
};

/** Currencies charged in whole units (no cents). */
const ZERO_DECIMAL = new Set([
    "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);

/** Formats an amount (minor units) for display: (999, "usd") → "$9.99". */
export function formatPrice(unitAmount: number, currency: string): string {
    const code = currency.toUpperCase();
    const zeroDecimal = ZERO_DECIMAL.has(currency.toLowerCase());
    const amount = zeroDecimal ? unitAmount : unitAmount / 100;
    const wholeNumber = Number.isInteger(amount);
    const digits = { minimumFractionDigits: wholeNumber ? 0 : 2, maximumFractionDigits: zeroDecimal ? 0 : 2 };
    // "narrowSymbol" gives ₦2,500 rather than NGN 2,500, but older JS engines
    // reject it, so fall back to the default symbol before giving up on Intl.
    for (const currencyDisplay of ["narrowSymbol", "symbol"] as const) {
        try {
            return new Intl.NumberFormat("en-US", { style: "currency", currency: code, currencyDisplay, ...digits }).format(amount);
        } catch {
            // try the next form
        }
    }
    try {
        return `${code} ${amount.toLocaleString("en-US", digits)}`;
    } catch {
        // Unknown currency code or no Intl support on the device.
        return `${code} ${wholeNumber ? amount : amount.toFixed(2)}`;
    }
}

export function formatInterval(interval: string, intervalCount: number): string {
    return intervalCount > 1 ? `${intervalCount} ${interval}s` : interval;
}

export function buildPlans(prices: PlanPrice[] | undefined): SubscriptionPlan[] {
    const byTier = new Map((prices ?? []).map((p) => [p.tier, p]));
    return (["free", "premium", "pro"] as Tier[]).map((tier) => {
        const copy = PLAN_COPY[tier];
        if (tier === "free") {
            return { id: tier, ...copy, price: "$0", interval: "month", trialDays: null, purchasable: false };
        }
        const listed = byTier.get(tier);
        if (!listed) {
            return { id: tier, ...copy, price: null, interval: "month", trialDays: null, purchasable: false };
        }
        return {
            id: tier,
            ...copy,
            price: formatPrice(listed.unitAmount, listed.currency),
            interval: formatInterval(listed.interval, listed.intervalCount),
            trialDays: listed.trialDays,
            purchasable: true,
        };
    });
}
