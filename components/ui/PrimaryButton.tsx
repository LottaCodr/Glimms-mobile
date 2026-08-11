import React from "react";
import {
    ActivityIndicator,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    ViewStyle,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Colors, Radius, Spacing } from "@/theme";
import { AppIcon } from "./Icon";

type Variant = "gold" | "outline" | "ghost" | "danger";

type Props = {
    label: string;
    onPress: () => void;
    icon?: string;
    loading?: boolean;
    disabled?: boolean;
    variant?: Variant;
    style?: ViewStyle;
    small?: boolean;
};

/** One button to rule secondary actions: gold CTA, outline, ghost, danger. */
export function PrimaryButton({
    label,
    onPress,
    icon,
    loading,
    disabled,
    variant = "gold",
    style,
    small,
}: Props) {
    const dimmed = disabled || loading;
    return (
        <TouchableOpacity
            onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onPress();
            }}
            disabled={dimmed}
            activeOpacity={0.85}
            style={[
                styles.base,
                small && styles.small,
                variantStyles[variant].btn,
                dimmed && { opacity: 0.5 },
                style,
            ]}
            accessibilityRole="button"
            accessibilityLabel={label}
        >
            {loading ? (
                <ActivityIndicator size="small" color={variantStyles[variant].text} />
            ) : (
                <View style={styles.row}>
                    {!!icon && (
                        <AppIcon name={icon} size={small ? 14 : 16} color={variantStyles[variant].text} style={{ marginRight: 7 }} />
                    )}
                    <Text style={[styles.label, small && { fontSize: 13 }, { color: variantStyles[variant].text }]}>
                        {label}
                    </Text>
                </View>
            )}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    base: {
        height: 50,
        borderRadius: Radius.md,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: Spacing.lg,
    },
    small: { height: 38, borderRadius: Radius.sm, paddingHorizontal: Spacing.md },
    row: { flexDirection: "row", alignItems: "center" },
    label: { fontSize: 15, fontWeight: "700" },
});

const variantStyles: Record<Variant, { btn: ViewStyle; text: string }> = {
    gold: { btn: { backgroundColor: Colors.gold }, text: Colors.black },
    outline: {
        btn: { backgroundColor: "transparent", borderWidth: 1, borderColor: Colors.border },
        text: Colors.text,
    },
    ghost: { btn: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border }, text: Colors.mid },
    danger: { btn: { backgroundColor: "rgba(192,64,64,0.15)", borderWidth: 1, borderColor: Colors.error }, text: Colors.error },
};
