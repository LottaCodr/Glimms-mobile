import { useTheme } from "@/provider/ThemeProvider";
import { View } from "react-native";

export function StepIndicator({ step }: { step: number }) {
    const theme = useTheme();

    return (
        <View style={{ flexDirection: "row", gap: theme.spacing[2] }}>
            {[1, 2, 3, 4, 5].map((i) => (
                <View
                    key={i}
                    style={{
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        backgroundColor:
                            i === step
                                ? theme.colors.brand.primary
                                : theme.colors.neutral[300],
                    }}
                />
            ))}
        </View>
    );
}
