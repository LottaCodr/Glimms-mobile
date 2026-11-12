/**
 * Landing route for `glimms://billing/return`, where the API sends the browser
 * after a Credo payment. Normally the in-app browser session catches that URL
 * and this screen never shows; it exists for the cases where the system opens
 * the link as an ordinary deep link instead.
 *
 * The `status` in the URL is only used to choose a message. What the user has
 * actually paid for is read from the API.
 */
import React, { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuthStore } from "@/store/auth.store";
import { toast } from "@/store/toast.store";
import { Colors } from "@/theme";

export default function BillingReturn() {
    const router = useRouter();
    const { status } = useLocalSearchParams<{ status?: string }>();
    const { refreshBilling } = useSubscription();
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (isAuthenticated) await refreshBilling().catch(() => {});
            if (cancelled) return;
            const tier = useAuthStore.getState().user?.tier ?? "free";
            if (tier !== "free") toast.success("Your plan is active");
            else if (status === "failed") toast.error("The payment did not go through");
            else toast.info("We'll activate your plan as soon as the payment clears");
            router.replace(isAuthenticated ? "/(tabs)/profile" : "/");
        })();
        return () => { cancelled = true; };
        // Runs once when the link opens the app.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <View style={styles.container}>
            <ActivityIndicator color={Colors.gold} />
            <Text style={styles.text}>Checking your payment…</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg, alignItems: "center", justifyContent: "center", gap: 12 },
    text: { color: Colors.mid, fontSize: 14 },
});
