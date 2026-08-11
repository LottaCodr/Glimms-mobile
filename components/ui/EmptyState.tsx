import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Colors, Spacing, Typography } from "@/theme";
import { AppIcon } from "./Icon";
import { PrimaryButton } from "./PrimaryButton";

type Props = {
    icon: string;
    title: string;
    subtitle?: string;
    actionLabel?: string;
    onAction?: () => void;
    compact?: boolean;
};

/** Consistent empty / error state used across catalog, saved, home, sessions. */
export function EmptyState({ icon, title, subtitle, actionLabel, onAction, compact }: Props) {
    return (
        <View style={[styles.wrap, compact && { paddingVertical: Spacing.lg }]}>
            <View style={styles.iconCircle}>
                <AppIcon name={icon} size={30} color={Colors.gold} />
            </View>
            <Text style={styles.title}>{title}</Text>
            {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
            {!!actionLabel && !!onAction && (
                <PrimaryButton label={actionLabel} onPress={onAction} style={{ marginTop: Spacing.md, minWidth: 180 }} />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: Spacing.xxl,
        paddingHorizontal: Spacing.lg,
    },
    iconCircle: {
        width: 68,
        height: 68,
        borderRadius: 34,
        backgroundColor: Colors.goldGlow,
        borderWidth: 1,
        borderColor: "rgba(191,146,69,0.3)",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: Spacing.md,
    },
    title: {
        fontSize: 17,
        fontFamily: Typography.serif,
        fontWeight: "600",
        color: Colors.text,
        textAlign: "center",
    },
    subtitle: {
        fontSize: 13,
        color: Colors.mid,
        textAlign: "center",
        lineHeight: 19,
        marginTop: 6,
        maxWidth: 300,
    },
});
