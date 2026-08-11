import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Colors } from "@/theme";
import { AppIcon } from "./Icon";

type Props = {
    title: string;
    actionLabel?: string;
    onAction?: () => void;
};

/** Section title row with an optional chevron action (used across home/wardrobe/saved). */
export function SectionHeader({ title, actionLabel, onAction }: Props) {
    return (
        <View style={styles.row}>
            <Text style={styles.title}>{title}</Text>
            {!!actionLabel && (
                <TouchableOpacity onPress={onAction} style={styles.action} hitSlop={8} accessibilityRole="button">
                    <Text style={styles.actionText}>{actionLabel}</Text>
                    <AppIcon name="chevron-forward" size={12} color={Colors.gold} />
                </TouchableOpacity>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 10,
    },
    title: { fontSize: 13, fontWeight: "600", color: Colors.text, letterSpacing: 0.2 },
    action: { flexDirection: "row", alignItems: "center", gap: 2 },
    actionText: { fontSize: 11, color: Colors.gold, fontWeight: "600" },
});
