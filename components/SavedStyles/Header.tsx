import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/provider/ThemeProvider";

type Props = {
    title?: string;
    onSearch?: () => void;
    onMore?: () => void;
};

export default function Header({
    title = "Saved Styles",
    onSearch,
    onMore,
}: Props) {
    const theme = useTheme();
    const insets = useSafeAreaInsets();

    return (
        <View
            style={[
                styles.container,
                {
                    paddingTop: insets.top,
                    backgroundColor: theme.colors.neutral[0],
                    borderBottomColor: theme.colors.neutral[100],
                },
            ]}
        >
            <View style={styles.row}>
                {/* Title */}
                <Text
                    style={[
                        styles.title,
                        { color: theme.colors.neutral[900] },
                    ]}
                >
                    {title}
                </Text>

                {/* Right Actions */}
                <View style={styles.actions}>
                    <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={onSearch}
                        hitSlop={10}
                    >
                        <Ionicons
                            name="search-outline"
                            size={22}
                            color={theme.colors.neutral[700]}
                        />
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={onMore}
                        hitSlop={10}
                    >
                        <Ionicons
                            name="ellipsis-horizontal"
                            size={22}
                            color={theme.colors.neutral[700]}
                        />
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        elevation: 20,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },

    row: {
        height: 56,
        paddingHorizontal: 16,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },

    title: {
        fontSize: 22,
        fontWeight: "700",
        letterSpacing: 0.3,
    },

    actions: {
        flexDirection: "row",
        gap: 12,
    },

    iconBtn: {
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: "center",
        justifyContent: "center",
    },
});
