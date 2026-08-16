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
    TouchableOpacity,
    View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useSubscription } from "@/hooks/useSubscription";
import { PricingCard } from "@/components/premium/PricingCard";
import { useAuthStore } from "@/store/auth.store";
import { Colors, Spacing, Typography } from "@/theme";

export default function PaywallScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { plans, loading, error, subscribe } = useSubscription();
    const user = useAuthStore((s) => s.user);
    const [notice, setNotice] = useState<string | null>(null);

    // Close automatically once the subscription activates (tier comes from /users/me).
    useEffect(() => {
        if (user && user.tier !== "free") {
            const t = setTimeout(() => {
                setNotice(`Welcome to ${user.tier.toUpperCase()} — enjoy your expanded limits.`);
                if (router.canGoBack()) router.back();
            }, 1200);
            return () => clearTimeout(t);
        }
    }, [user, router]);

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
                <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn} hitSlop={10}>
                    <Ionicons name="close" size={22} color={Colors.text} />
                </TouchableOpacity>
            </View>

            <ScrollView
                contentContainerStyle={[styles.scroll, { paddingBottom: 48 + insets.bottom }]}
                showsVerticalScrollIndicator={false}
            >
                {plans.filter((p) => p.id !== "free").map((plan) => (
                    <PricingCard
                        key={plan.id}
                        plan={plan}
                        onSelect={async (id) => {
                            setNotice(null);
                            const result = await subscribe(id);
                            if (result === "cancelled") setNotice("Checkout closed — no charge was made.");
                            if (result === "pending") setNotice("Confirming your payment… this can take a minute.");
                        }}
                        loading={loading}
                    />
                ))}

                {loading && (
                    <View style={styles.statusRow}>
                        <ActivityIndicator color={Colors.gold} />
                        <Text style={styles.statusText}>Opening secure checkout…</Text>
                    </View>
                )}
                {!!error && <Text style={styles.error}>{error}</Text>}
                {!!notice && <Text style={styles.notice}>{notice}</Text>}

                <TouchableOpacity onPress={() => router.back()} style={styles.maybeLater}>
                    <Text style={{ color: Colors.mid, fontSize: 13 }}>Maybe later</Text>
                </TouchableOpacity>
            </ScrollView>
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
});
