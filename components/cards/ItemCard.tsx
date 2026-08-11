import { useTheme } from "@/provider/ThemeProvider";
import { View } from "react-native";

export function ItemCard({ children }: { children: React.ReactNode }) {
    const theme = useTheme();

    return (
        <View
            style={{
                backgroundColor: theme.colors.neutral[0],
                borderRadius: theme.radius.md,
                padding: theme.spacing[4],
                ...theme.shadows.sm,
            }}
        >
            {children}
        </View>
    );
}
