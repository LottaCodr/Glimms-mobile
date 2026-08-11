import { useTheme } from "@/provider/ThemeProvider";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export const HomeHeader = () => {
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
            <StatusBar
                barStyle="dark-content"
                backgroundColor={theme.colors.neutral[0]}
                translucent
            />

            <View
                style={[
                    styles.headerRow,
                    { paddingHorizontal: theme.spacing[4] },
                ]}
            >
                {/* Camera */}
                <TouchableOpacity style={styles.iconBtn} hitSlop={10}>
                    <Ionicons
                        name="camera-outline"
                        size={24}
                        color={theme.colors.brand.primary}
                    />
                </TouchableOpacity>

                {/* Title */}
                <Text
                    style={[
                        styles.title,
                        // { color: theme.colors.brand.primary },
                    ]}
                >
                    GLIMMS
                </Text>

                {/* Notification */}
                <TouchableOpacity style={styles.iconBtn} hitSlop={10}>
                    <Ionicons
                        name="notifications-outline"
                        size={24}
                        color={theme.colors.brand.primary}
                    />

                    <View
                        style={[
                            styles.badge,
                            { backgroundColor: theme.colors.brand.accent },
                        ]}
                    />
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,

        zIndex: 100,
        elevation: 10,

        borderBottomWidth: StyleSheet.hairlineWidth,
    },

    headerRow: {
        height: 56,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },

    title: {
        fontSize: 18,
        fontWeight: "700",
        letterSpacing: 1.2,
    },

    iconBtn: {
        width: 36,
        height: 36,
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
    },

    badge: {
        position: "absolute",
        top: 5,
        right: 6,
        width: 9,
        height: 9,
        borderRadius: 5,
        borderWidth: 2,
        borderColor: "#fff",
    },
});
