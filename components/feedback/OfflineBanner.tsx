/**
 * Slim offline indicator — listens to NetInfo and shows a banner while
 * disconnected. Scans taken offline auto-queue (store/offlineQueue.store.ts).
 */
import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppIcon } from "@/components/ui/Icon";
import { Colors, Radius } from "@/theme";
import { useOfflineQueueStore } from "@/store/offlineQueue.store";

export function OfflineBanner() {
    const insets = useSafeAreaInsets();
    const queuedCount = useOfflineQueueStore((s) => s.items.length);
    const [offline, setOffline] = React.useState(false);
    const translate = useRef(new Animated.Value(-60)).current;

    useEffect(() => {
        const sub = NetInfo.addEventListener((state) => {
            setOffline(state.isConnected === false);
        });
        return () => sub();
    }, []);

    useEffect(() => {
        Animated.timing(translate, {
            toValue: offline ? 0 : -60,
            duration: 220,
            useNativeDriver: true,
        }).start();
    }, [offline, translate]);

    if (!offline && translate === undefined) return null;

    return (
        <Animated.View
            style={[styles.banner, { top: insets.top + 6, transform: [{ translateY: translate }] }]}
            pointerEvents="none"
        >
            <AppIcon name="cloud-offline-outline" size={14} color="#F59E0B" />
            <Text style={styles.text}>
                You’re offline{queuedCount > 0 ? ` — ${queuedCount} scan${queuedCount === 1 ? "" : "s"} queued` : ""}
            </Text>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    banner: {
        position: "absolute",
        alignSelf: "center",
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        backgroundColor: Colors.card2,
        borderWidth: 1,
        borderColor: "rgba(245,158,11,0.35)",
        borderRadius: Radius.full,
        paddingHorizontal: 14,
        paddingVertical: 7,
        zIndex: 998,
        shadowColor: "#000",
        shadowOpacity: 0.3,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 8,
    },
    text: { color: Colors.text, fontSize: 12, fontWeight: "600" },
});
