import { View } from "react-native";
import { useTheme } from "@/provider/ThemeProvider";

export const HeroSkeleton = () => {
    const theme = useTheme();

    return (
        <View
            style={{
                height: 360,
                borderRadius: theme.radius.lg,
                backgroundColor: theme.colors.neutral[200],
            }}
        />
    );
};
