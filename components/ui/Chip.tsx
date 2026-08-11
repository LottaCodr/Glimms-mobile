import React from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import { Colors, Radius } from "@/theme";
import { AppIcon } from "./Icon";

type Props = {
    label: string;
    selected?: boolean;
    onPress?: () => void;
    icon?: string;
    small?: boolean;
};

/** Filter/selection pill used in wardrobe filters, preferences editor, saved tabs. */
export function Chip({ label, selected, onPress, icon, small }: Props) {
    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.75}
            disabled={!onPress}
            style={[styles.chip, small && styles.small, selected && styles.selected]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
        >
            {!!icon && (
                <AppIcon
                    name={icon}
                    size={small ? 12 : 13}
                    color={selected ? Colors.black : Colors.mid}
                    style={{ marginRight: 5 }}
                />
            )}
            <Text style={[styles.text, small && { fontSize: 11 }, selected && { color: Colors.black }]}>
                {label}
            </Text>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    chip: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 14,
        height: 34,
        borderRadius: Radius.full,
        backgroundColor: Colors.card,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    small: { height: 28, paddingHorizontal: 10 },
    selected: { backgroundColor: Colors.gold, borderColor: Colors.gold },
    text: { fontSize: 12, fontWeight: "600", color: Colors.mid },
});
