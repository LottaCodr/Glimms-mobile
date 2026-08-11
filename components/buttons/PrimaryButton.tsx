import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import { Colors, Radius, Spacing } from "@/theme";

type ButtonProps = {
    title?: string;
    children?: React.ReactNode;
    onPress?: () => void;
    loading?: boolean;
    disabled?: boolean;
    icon?: keyof typeof Ionicons.glyphMap;
    variant?: "primary" | "secondary";
};

/** Legacy brand button (title/children API) — dark-gold themed. */
export function PrimaryButton({
    title,
    children,
    onPress,
    loading,
    disabled,
    icon,
    variant = "primary",
}: ButtonProps) {
    const isSecondary = variant === "secondary";

    return (
        <Pressable
            onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onPress?.();
            }}
            disabled={disabled || loading}
            accessibilityRole="button"
            style={({ pressed }) => [
                styles.base,
                isSecondary ? styles.secondary : styles.primary,
                (disabled || loading) && { opacity: 0.55 },
                pressed && { opacity: 0.85 },
            ]}
        >
            {loading ? (
                <ActivityIndicator color={isSecondary ? Colors.gold : Colors.black} />
            ) : (
                <>
                    {icon && (
                        <Ionicons
                            name={icon}
                            size={18}
                            color={isSecondary ? Colors.gold : Colors.black}
                            style={{ marginRight: title || children ? Spacing.sm : 0 }}
                        />
                    )}
                    {!!title && <Text style={[styles.label, isSecondary && styles.labelSecondary]}>{title}</Text>}
                    {!!children && (
                        <Text style={[styles.label, isSecondary && styles.labelSecondary]}>{children}</Text>
                    )}
                </>
            )}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    base: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 14,
        paddingHorizontal: Spacing.lg,
        borderRadius: Radius.md,
    },
    primary: {
        backgroundColor: Colors.gold,
        shadowColor: Colors.gold,
        shadowOpacity: 0.35,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 5 },
        elevation: 6,
    },
    secondary: {
        backgroundColor: "transparent",
        borderColor: Colors.gold,
        borderWidth: 1.5,
    },
    label: {
        color: Colors.black,
        fontWeight: "700",
        fontSize: 15,
    },
    labelSecondary: {
        color: Colors.gold,
    },
});
