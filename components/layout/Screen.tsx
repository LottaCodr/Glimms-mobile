import React from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors, Spacing } from "@/theme";

type Props = {
    children: React.ReactNode;
    padded?: boolean;
};

/** Shared safe-area screen shell on the brand background. */
export function Screen({ children, padded = true }: Props) {
    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={["top", "bottom"]}>
            <View style={{ flex: 1, padding: padded ? Spacing.md : 0 }}>{children}</View>
        </SafeAreaView>
    );
}
