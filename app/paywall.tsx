/**
 * Paywall — shown on SCAN_LIMIT_REACHED or from Settings (guide §12/§16.8).
 * Picks a plan → Stripe Checkout (in-app browser) → polls until the webhook
 * flips the subscription active.
 */
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useSubscription } from "@/hooks/useSubscription";
import { PricingCard } from "@/components/premium/PricingCard";
import { useAuthStore } from "@/store/auth.store";
import { Celebration, Enter, Shakeable, Touchable } from "@/components/motion";
import { formatPrice } from "@/lib/subscription/plans";
import { Colors, Radius, Spacing, Typography } from "@/theme";

export default function PaywallScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { plans, plansLoading, plansError, refetchPlans, loading, error, subscribe, payWithCredo, credoPlans } = useSubscription();
    const paidPlans = plans.filter((p) => p.id !== "free");
    const cardPlansForSale = paidPlans.some((p) => p.purchasable);
    const nothingForSale = !plansLoading && !plansError && !cardPlansForSale && credoPlans.length === 0;
    const user = useAuthStore((s) => s.user);
    const [notice, setNotice] = useState<string | null>(null);

    const [celebrating, setCelebrating] = useState(false);
    // The tier the user arrived with: a change from it is an upgrade to celebrate.
    const [tierAtOpen] = useState(user?.tier ?? "free");

    // Celebrate once the plan is active (the tier comes from /users/me).
    useEffect(() => {
        if (user && user.tier !== "free" && user.tier !== tierAtOpen) {
            const timer = setTimeout(() => setCelebrating(true), 0);
            return () => clearTimeout(timer);
        }
    }, [user, tierAtOpen]);

    const report = (result: Awaited<ReturnType<typeof subscribe>>) => {
        if (result === "cancelled") setNotice("Checkout closed — no charge was made.");
        if (result === "pending") setNotice("Confirming your payment… your plan activates as soon as it clears.");
        if (result === "failed") setNotice("The payment did not go through. No plan was activated.");
    };

    return (
        <SafeAreaView style={styles.container} edges={["top"]}>
            <View style={styles.header}>
                <Text style={styles.label}>GLIMMS PLANS</Text>
                <Text style={styles.title}>
                    Unlock your <Text style={styles.accent}>full wardrobe</Text>
                </Text>
                <Text style={styles.sub}>
                    Free accounts get 10 scans a day. Upgrade for higher limits and priority AI.
                </Text>
                <Touchable onPress={() => router.back()} style={styles.closeBtn} hitSlop={10}>
                    <Ionicons name="close" size={22} color={Colors.text} />
                </Touchable>
            </View>

            <ScrollView
                contentContainerStyle={[styles.scroll, { paddingBottom: 48 + insets.bottom }]}
                showsVerticalScrollIndicator={false}
            >
                {plansLoading && (
                    <View style={styles.statusRow}>
                        <ActivityIndicator color={Colors.gold} />
                        <Text style={styles.statusText}>Loading plans…</Text>
                    </View>
                )}
                {plansError && (
                    <Touchable onPress={() => refetchPlans()} accessibilityRole="button">
                        <Text style={styles.error}>{"Couldn't load plans. Tap to try again."}</Text>
                    </Touchable>
                )}
                {nothingForSale && (
                    <Text style={styles.notice}>{"Upgrades aren't available right now. Please check back soon."}</Text>
                )}

                {!plansLoading && !plansError && (cardPlansForSale || credoPlans.length === 0) && paidPlans.map((plan, index) => (
                    <Enter key={plan.id} index={index}>
                    <PricingCard
                        key={plan.id}
                        plan={plan}
                        onSelect={async (id) => {
                            setNotice(null);
                            report(await subscribe(id));
                        }}
                        loading={loading}
                    />
                    </Enter>
                ))}

                {/* Naira passes through Credo: card or bank transfer, no auto-renewal. */}
                {credoPlans.length > 0 && (
                    <Enter index={3} style={styles.credo}>
                        <Text style={styles.credoTitle}>Pay in naira</Text>
                        <Text style={styles.credoSub}>
                            Card or bank transfer, secured by Credo. One payment, no automatic renewal.
                        </Text>
                        {credoPlans.map((plan, enterIdx) => (
                            <Touchable
                                key={plan.tier} enterIndex={enterIdx}
                                style={[styles.credoBtn, loading && { opacity: 0.5 }]}
                                disabled={loading}
                                haptic="light"
                                onPress={async () => {
                                    setNotice(null);
                                    report(await payWithCredo(plan.tier));
                                }}
                                accessibilityLabel={`${plan.tier === "pro" ? "Pro" : "Premium"} for ${plan.periodDays} days, ${formatPrice(plan.amount, plan.currency)}`}
                            >
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.credoPlan}>{plan.tier === "pro" ? "Pro" : "Premium"}</Text>
                                    <Text style={styles.credoPeriod}>
                                        {plan.periodDays} days{plan.feeOnTop ? " · processing fee added at checkout" : ""}
                                    </Text>
                                </View>
                                <Text style={styles.credoPrice}>{formatPrice(plan.amount, plan.currency)}</Text>
                                <Ionicons name="chevron-forward" size={16} color={Colors.gold} style={{ marginLeft: 6 }} />
                            </Touchable>
                        ))}
                    </Enter>
                )}

                {loading && (
                    <View style={styles.statusRow}>
                        <ActivityIndicator color={Colors.gold} />
                        <Text style={styles.statusText}>Opening secure checkout…</Text>
                    </View>
                )}
                {!!error && (
                    <Shakeable trigger={error}>
                        <Text style={styles.error} accessibilityRole="alert">{error}</Text>
                    </Shakeable>
                )}
                {!!notice && <Text style={styles.notice}>{notice}</Text>}

                <Touchable onPress={() => router.back()} style={styles.maybeLater}>
                    <Text style={{ color: Colors.mid, fontSize: 13 }}>Maybe later</Text>
                </Touchable>
            </ScrollView>

            <Celebration
                visible={celebrating}
                emblem="◆"
                title={`Welcome to ${user?.tier === "pro" ? "Pro" : "Premium"}`}
                message="Your higher scan limits and priority styling are active."
                onDone={() => {
                    setCelebrating(false);
                    if (router.canGoBack()) router.back();
                }}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg },
    header: { padding: Spacing.lg, paddingBottom: 0 },
    label: { fontSize: 11, letterSpacing: 2, color: Colors.gold, marginBottom: 6 },
    title: { fontSize: 30, fontFamily: Typography.serif, fontWeight: "300", color: Colors.text, lineHeight: 38 },
    accent: { fontStyle: "italic", color: Colors.gold },
    sub: { fontSize: 13, color: Colors.mid, marginTop: 8, lineHeight: 19 },
    closeBtn: { position: "absolute", top: Spacing.lg, right: Spacing.lg },
    scroll: { padding: Spacing.lg, paddingBottom: 48 },
    statusRow: { flexDirection: "row", alignItems: "center", gap: 10, justifyContent: "center", marginTop: 8 },
    statusText: { color: Colors.mid, fontSize: 13 },
    error: { color: Colors.error, fontSize: 13, textAlign: "center", marginTop: 12 },
    notice: { color: "#F59E0B", fontSize: 13, textAlign: "center", marginTop: 12 },
    maybeLater: { alignItems: "center", marginTop: 18 },
    credo: {
        marginTop: Spacing.md, padding: Spacing.md, borderRadius: Radius.lg,
        backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
    },
    credoTitle: { fontSize: 16, fontWeight: "700", color: Colors.text },
    credoSub: { fontSize: 12, color: Colors.mid, marginTop: 4, marginBottom: 12, lineHeight: 17 },
    credoBtn: {
        flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 14,
        borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.gold, marginTop: 8,
    },
    credoPlan: { fontSize: 15, fontWeight: "700", color: Colors.text },
    credoPeriod: { fontSize: 12, color: Colors.mid, marginTop: 2 },
    credoPrice: { fontSize: 16, fontWeight: "700", color: Colors.gold },
});
