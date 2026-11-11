/**
 * Subscription hook — guide §12/§16.8.
 * Plans are priced by the API (GET /subscriptions/prices). Checkout opens in an
 * in-app browser; the Stripe webhook then flips the subscription active and we
 * poll for it. Subscribers manage billing in the Stripe portal.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { refreshTokens } from "@/services/api.client";
import { subscriptionService } from "@/services/subscription.service";
import { useAuthStore } from "@/store/auth.store";
import { buildPlans } from "@/lib/subscription/plans";

export type { SubscriptionPlan } from "@/lib/subscription/plans";
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

    const prices = useQuery({
        queryKey: ["subscription", "prices"],
        queryFn: () => subscriptionService.prices(),
        staleTime: 5 * 60_000,
    });

    const plans = useMemo(() => buildPlans(prices.data), [prices.data]);

    const refreshBilling = async () => {
        // The access token carries the tier the API enforces scan limits with,
        // so rotate it now rather than waiting for it to expire.
        await refreshTokens().catch(() => null);
        await refreshUser().catch(() => {}); // tier badge updates
        qc.invalidateQueries({ queryKey: ["subscription", "me"] });
        qc.invalidateQueries({ queryKey: ["analytics", "me"] });
    };

    /**
     * Starts Stripe Checkout for a plan. Returns:
     * - "active"   → webhook already processed; UI can close the paywall
     * - "pending"  → user may still be mid-checkout; keep waiting
     * - "cancelled"→ user dismissed the browser without paying
     */
    const subscribe = async (planId: string): Promise<SubscribeResult> => {
        const plan = plans.find((p) => p.id === planId);
        if (!plan?.purchasable || plan.id === "free") {
            setError("That plan isn't available right now.");
            return "idle";
        }
        setLoading(true);
        setError(null);
        try {
            const result = await subscriptionService.openCheckout(plan.id);
            // The sheet closing without a redirect means the user bailed.
            if (result.type === "cancel" || result.type === "dismiss") {
                // Could still have completed → check before calling it cancelled.
                const sub = await subscriptionService.me();
                if (sub.status !== "active") return "cancelled";
            }

            const sub = await subscriptionService.waitUntilActive();
            if (sub.status === "active") {
                await refreshBilling();
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

    /** Opens the Stripe billing portal, then picks up whatever changed there. Resolves false on failure. */
    const manageBilling = async (): Promise<boolean> => {
        setLoading(true);
        setError(null);
        try {
            await subscriptionService.openBillingPortal();
            await refreshBilling();
            return true;
        } catch (e: any) {
            setError(e?.message ?? "Couldn't open billing — please try again.");
            return false;
        } finally {
            setLoading(false);
        }
    };

    return {
        plans,
        plansLoading: prices.isLoading,
        plansError: prices.isError,
        refetchPlans: prices.refetch,
        loading,
        error,
        subscribe,
        manageBilling,
        subscription: subscription.data ?? null,
        subscriptionLoading: subscription.isLoading,
        refetch: subscription.refetch,
    };
};
