import { useTheme } from "@/provider/ThemeProvider";
import {  View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";


type Props = {
    children: React.ReactNode;
    padded?: boolean;
};

export function Screen({ children, padded = true }: Props) {
    const theme = useTheme();

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.neutral[0] }}>
            <View
                style={{
                    flex: 1,
                    padding: padded ? theme.spacing[4] : 0,
                }}
            >
                {children}
            </View>
        </SafeAreaView>
    );
}
