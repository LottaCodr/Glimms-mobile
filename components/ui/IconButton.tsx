import React from "react";
import { StyleSheet, TouchableOpacity, ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import { Colors } from "@/theme";
import { AppIcon, IconFamily } from "./Icon";

type Props = {
    icon: string;
    family?: IconFamily;
    onPress: () => void;
    size?: number;
    /** Total button box size */
    boxSize?: number;
    color?: string;
    variant?: "card" | "overlay" | "plain";
    style?: ViewStyle;
    accessibilityLabel: string;
    badgeDot?: boolean;
};

/** Square icon button with haptics — headers, cards, overlays. */
export function IconButton({
    icon,
    family,
    onPress,
    size = 18,
    boxSize = 38,
    color = Colors.text,
    variant = "card",
    style,
    accessibilityLabel,
    badgeDot,
}: Props) {
    return (
        <TouchableOpacity
            onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onPress();
            }}
            activeOpacity={0.75}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            style={[
                styles.base,
                { width: boxSize, height: boxSize, borderRadius: Math.round(boxSize / 2.6) },
                variantStyles[variant],
                style,
            ]}
        >
            <AppIcon name={icon} family={family} size={size} color={color} />
            {badgeDot && <BadgeDot />}
        </TouchableOpacity>
    );
}

function BadgeDot() {
    return <AppIcon name="ellipse" size={7} color={Colors.gold} style={styles.dot} />;
}

const styles = StyleSheet.create({
    base: { alignItems: "center", justifyContent: "center" },
    dot: { position: "absolute", top: 8, right: 9 },
});

const variantStyles: Record<string, ViewStyle> = {
    card: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border },
    overlay: { backgroundColor: "rgba(0,0,0,0.55)" },
    plain: { backgroundColor: "transparent" },
};
