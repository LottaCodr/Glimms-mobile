import { useTheme } from "@/provider/ThemeProvider";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text } from "react-native";

export function FloatingAIButton() {
    const theme = useTheme();

    return (
        <Pressable
            style={{
                position: "absolute",
                right: theme.spacing[5],
                bottom: theme.spacing[12],
                backgroundColor: theme.colors.brand.primary,
                paddingHorizontal: theme.spacing[4] + 2,
                paddingVertical: theme.spacing[3] + 2,
                borderRadius: 999,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                elevation: 6,
            }}
        >
            <Ionicons name="sparkles" size={18} color={theme.colors.neutral[0]} />
            <Text
                style={{
                    color: theme.colors.neutral[0],
                    ...theme.typography.bodyMedium,
                    fontWeight: "600",
                }}
            >
                AI Stylist
            </Text>
        </Pressable>
    );
}
