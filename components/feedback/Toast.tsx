/**
 * Top-of-screen toast stack — mount once in the root layout.
 * Drive it via `toast.success/error/info/warning` from `@/store/toast.store`.
 */
import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors, Radius, Spacing } from "@/theme";
import { AppIcon } from "@/components/ui/Icon";
import { ToastItem, useToastStore } from "@/store/toast.store";

const TYPE_CONFIG: Record<ToastItem["type"], { icon: string; color: string }> = {
    success: { icon: "checkmark-circle", color: "#5DBB7D" },
    error: { icon: "alert-circle", color: Colors.error },
    warning: { icon: "warning", color: "#F59E0B" },
    info: { icon: "information-circle", color: Colors.gold },
};

function ToastRow({ item }: { item: ToastItem }) {
    const dismiss = useToastStore((s) => s.dismiss);
    const translateY = useRef(new Animated.Value(-80)).current;
    const opacity = useRef(new Animated.Value(0)).current;
    const cfg = TYPE_CONFIG[item.type];

    useEffect(() => {
        Animated.parallel([
            Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 8, tension: 90 }),
            Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        ]).start();
    }, [translateY, opacity]);

    return (
        <Animated.View style={[styles.toast, { transform: [{ translateY }], opacity }]}>
            <AppIcon name={cfg.icon} size={18} color={cfg.color} />
            <Text style={styles.message} numberOfLines={2}>
                {item.message}
            </Text>
            <TouchableOpacity onPress={() => dismiss(item.id)} hitSlop={10} accessibilityLabel="Dismiss">
                <AppIcon name="close" size={14} color={Colors.mid} />
            </TouchableOpacity>
        </Animated.View>
    );
}

export function Toaster() {
    const toasts = useToastStore((s) => s.toasts);
    const insets = useSafeAreaInsets();
    if (!toasts.length) return null;
    return (
        <View pointerEvents="box-none" style={[styles.container, { top: insets.top + 8 }]}>
            {toasts.map((t) => (
                <ToastRow key={t.id} item={t} />
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: "absolute",
        left: Spacing.md,
        right: Spacing.md,
        zIndex: 999,
        gap: 8,
    },
    toast: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        backgroundColor: Colors.card2,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: Radius.md,
        paddingHorizontal: Spacing.md,
        paddingVertical: 12,
        shadowColor: "#000",
        shadowOpacity: 0.35,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        elevation: 12,
    },
    message: { flex: 1, color: Colors.text, fontSize: 13, fontWeight: "500" },
});
