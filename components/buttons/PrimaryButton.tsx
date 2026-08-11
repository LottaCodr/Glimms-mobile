import { useTheme } from "@/provider/ThemeProvider";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import React from "react";

type ButtonProps = {
    title?: string;
    children?: React.ReactNode;
    onPress?: () => void;
    loading?: boolean;
    disabled?: boolean;
    icon?: keyof typeof Ionicons.glyphMap;
    variant?: "primary" | "secondary";
};

export function PrimaryButton({
    title,
    children,
    onPress,
    loading,
    disabled,
    icon,
    variant = "primary",
}: ButtonProps) {
    const theme = useTheme();

    const isSecondary = variant === "secondary";

    const backgroundColor = disabled
        ? theme.colors.neutral[300]
        : isSecondary
            ? "#fff"
            : theme.colors.brand.primary;
    const textColor = isSecondary
        ? theme.colors.brand.primary
        : "#fff";
    const borderColor = isSecondary
        ? theme.colors.brand.primary
        : "transparent";
    const borderWidth = isSecondary ? 2 : 0;

    return (
        <Pressable
            onPress={onPress}
            disabled={disabled || loading}
            style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor,
                paddingVertical: theme.spacing[3],
                borderRadius: theme.radius.md,
                borderColor,
                borderWidth,
                opacity: disabled ? 0.6 : 1,
            }}
        >
            {loading ? (
                <ActivityIndicator color={textColor} style={{ marginRight: icon || children || title ? theme.spacing[2] : 0 }} />
            ) : icon ? (
                <Ionicons
                    name={icon}
                    size={20}
                    color={textColor}
                    style={{
                        marginRight: (title || children) ? theme.spacing[2] : 0,
                    }}
                />
            ) : null}
            {title && !loading && (
                <Text style={[theme.typography.button, { color: textColor }]}>
                    {title}
                </Text>
            )}
            {children && !loading && (
                <Text style={[theme.typography.button, { color: textColor }]}>
                    {children}
                </Text>
            )}
        </Pressable>
    );
}
