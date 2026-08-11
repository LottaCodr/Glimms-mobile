/**
 * Subscription hook — guide §12/§16.8.
 * Plans are hardcoded (backend has no /prices endpoint yet); the two paid
 * tiers map to env-configured Stripe price IDs. Checkout opens in an in-app
 * browser; the Stripe webhook then flips the subscription active and we poll
 * for it.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { subscriptionService } from "@/services/subscription.service";
import { useAuthStore } from "@/store/auth.store";
import { ENV } from "@/config/env";

export interface SubscriptionPlan {
    id: "free" | "premium" | "pro";
    name: string;
    price: string;
    interval: "month" | "year";
    features: string[];
    isPopular?: boolean;
    /** Stripe price_* ID from env — null means "not purchasable" (free tier). */
    priceId: string | null;
}

const PLANS: SubscriptionPlan[] = [
    {
        id: "free",
        name: "Free",
        price: "$0",
        interval: "month",
        features: ["10 scans per day", "Standard AI designs", "Basic catalog"],
        priceId: null,
    },
    {
        id: "premium",
        name: "Premium",
        price: "$9.99",
        interval: "month",
        features: ["100 scans per day", "Priority AI pipeline", "Climate-aware styling"],
        isPopular: true,
        priceId: ENV.STRIPE_PREMIUM_PRICE_ID || null,
    },
    {
        id: "pro",
        name: "Pro",
        price: "$19.99",
        interval: "month",
        features: ["Unlimited scans", "Fastest priority queue", "Early feature access"],
        priceId: ENV.STRIPE_PRO_PRICE_ID || null,
    },
];

export type SubscribeResult = "active" | "pending" | "cancelled" | "idle";

export const useSubscription = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const qc = useQueryClient();
    const refreshUser = useAuthStore((s) => s.refreshUser);

    const subscription = useQuery({
        queryKey: ["subscription", "me"],
        queryFn: () => subscriptionService.me(),
        staleTime: 60_000,
    });

    /**
     * Starts Stripe Checkout for a plan. Returns:
     * - "active"   → webhook already processed; UI can close the paywall
     * - "pending"  → user may still be mid-checkout; keep waiting
     * - "cancelled"→ user dismissed the browser without paying
     */
    const subscribe = async (planId: string): Promise<SubscribeResult> => {
        const plan = PLANS.find((p) => p.id === planId);
        if (!plan?.priceId) {
            setError("That plan isn't purchasable yet.");
            return "idle";
        }
        setLoading(true);
        setError(null);
        try {
            const result = await subscriptionService.openCheckout(plan.priceId);
            // The sheet closing without a redirect means the user bailed.
            if (result.type === "cancel" || result.type === "dismiss") {
                // Could still have completed → check before calling it cancelled.
                const sub = await subscriptionService.me();
                if (sub.status !== "active") return "cancelled";
            }

            const sub = await subscriptionService.waitUntilActive();
            if (sub.status === "active") {
                await refreshUser().catch(() => {}); // tier badge updates
                qc.invalidateQueries({ queryKey: ["subscription", "me"] });
                qc.invalidateQueries({ queryKey: ["analytics", "me"] });
                return "active";
            }
            return "pending";
        } catch (e: any) {
            setError(e?.message ?? "Checkout failed — please try again.");
            return "idle";
        } finally {
            setLoading(false);
        }
    };

    return {
        plans: PLANS,
        loading,
        error,
        subscribe,
        subscription: subscription.data ?? null,
        subscriptionLoading: subscription.isLoading,
        refetch: subscription.refetch,
    };
};
