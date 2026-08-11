import { useTheme } from "@/provider/ThemeProvider";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ProgressBar } from "react-native-paper";

export default function ProcessingScreen() {
    const theme = useTheme();
    const [progress, setProgress] = useState(0.0);

    // Simulate progress
    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (progress < 1) {
            interval = setInterval(() => setProgress((p) => Math.min(1, p + 0.01)), 60);
        }
        return () => clearInterval(interval);
    }, [progress]);

    // Colors: align with actual @/styles/tokens/colors.ts
    const primaryColor = theme?.colors?.brand?.primary || "#4996FF";
    const accentColor = theme?.colors?.brand?.accent || "#F59E0B";
    const headerTextColor = theme?.colors?.neutral?.[800] || "#222B45";
    const backgroundColor = theme?.colors?.neutral?.[50] || "#f9fbff";
    const progressBg = theme?.colors?.neutral?.[100] || "#e2eaf9";
    const iconCircleBg = theme?.colors?.neutral?.[0] || "#e9f0fb";
    const tipCardBg = theme?.colors?.brand?.accent + "1A" || "#eaf7fc"; // 10% alpha, fallback for accent BG.
    const cancelBtnBg = theme?.colors?.neutral?.[0] || "#fff";
    const cancelBtnBorder = theme?.colors?.neutral?.[200] || "#d8e2f7";
    const cancelTextCol = theme?.colors?.neutral?.[700] || "#1b2d4d";
    const labelColor = theme?.colors?.brand?.primary || "#4366d2";

    return (
        <View style={[styles.root, { backgroundColor }]}>
            {/* <StatusBar  barStyle="dark-content" backgroundColor={backgroundColor}  /> */}
            {/* Header */}
            {/* <View style={styles.header}> */}
            {/* <TouchableOpacity>
                    <Ionicons name="chevron-back" size={22} color={theme?.colors?.neutral?.[900] || "#222"} />
                </TouchableOpacity>
                <Text style={[styles.headerText, { color: headerTextColor }]}>Processing Style</Text>
                <View style={{ width: 22 }} />  */}
            {/* </View> */}

            {/* Main Icon */}
            <View style={[styles.iconCircle, { backgroundColor: iconCircleBg }]}>
                <LinearGradient
                    colors={[
                        iconCircleBg,
                        backgroundColor
                    ]}
                    style={StyleSheet.absoluteFill}
                    start={{ x: 0.2, y: 0 }}
                    end={{ x: 1, y: 1 }}
                />
                <Ionicons name="sparkles-outline" size={44} color={primaryColor} />
            </View>

            {/* Main Texts */}
            <Text style={[styles.analyzing, { color: theme?.colors?.neutral?.[900] || "#34426B" }]}>
                Analyzing your items...
            </Text>
            <Text style={[styles.supportText, { color: theme?.colors?.neutral?.[500] || "#5d6c91" }]}>
                Creating outfit combinations based on
                {"\n"}your professional style and urban environment.
            </Text>

            {/* Progress Card */}
            <View style={[styles.progressCard, { backgroundColor: progressBg }]}>
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                    <Ionicons name="shirt-outline" size={18} color={primaryColor} style={{ marginRight: 5 }} />
                    <Text style={[styles.progressLabel, { color: labelColor }]}>Curating your personal look</Text>
                    <Text style={[styles.progressPercent, { color: primaryColor }]}>{Math.round(progress * 100)}%</Text>
                </View>
                <ProgressBar
                    progress={progress}
                    color={primaryColor}
                    style={[styles.progressBar, { backgroundColor: progressBg }]}
                    indeterminate={false}
                />
            </View>

            {/* Style Tip */}
            <View style={[styles.tipCard, { backgroundColor: tipCardBg }]}>
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                    <Ionicons name="bulb-outline" size={17} color={accentColor} style={{ marginRight: 7 }} />
                    <Text style={[styles.tipTitle, { color: accentColor }]}>STYLE TIP</Text>
                </View>
                <Text style={[styles.tipText, { color: theme?.colors?.neutral?.[800] || "#374355" }]}>
                    Monochrome outfits with varied textures create a sophisticated look for rainy city days.
                </Text>
            </View>

            {/* Cancel Button */}
            <TouchableOpacity
                style={[
                    styles.cancel,
                    {
                        backgroundColor: cancelBtnBg,
                        borderColor: cancelBtnBorder
                    }
                ]}
                activeOpacity={0.6}
            >
                <Text style={[styles.cancelText, { color: cancelTextCol }]}>Cancel Processing</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        alignItems: "center",
        paddingHorizontal: 24,
        paddingTop: 0,
    },
    header: {
        width: "100%",
        paddingTop: 44, // simulated statusbar/nav spacing
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 26,
    },
    headerText: {
        fontSize: 17,
        fontWeight: "600",
        letterSpacing: 0.1,
    },
    iconCircle: {
        width: 98,
        height: 98,
        borderRadius: 49,
        justifyContent: "center",
        alignItems: "center",
        alignSelf: "center",
        marginBottom: 28,
        marginTop: 18,
        overflow: "hidden",
    },
    analyzing: {
        fontSize: 19,
        fontWeight: "600",
        marginBottom: 6,
        textAlign: "center",
    },
    supportText: {
        fontSize: 14,
        textAlign: "center",
        marginBottom: 22,
        lineHeight: 20,
    },
    progressCard: {
        width: "100%",
        borderRadius: 14,
        paddingVertical: 16,
        paddingHorizontal: 16,
        marginBottom: 20,
        shadowColor: "#2B3671",
        shadowOpacity: 0.07,
        shadowOffset: { width: 0, height: 1 },
        shadowRadius: 7,
        elevation: 2,
    },
    progressLabel: {
        fontWeight: "600",
        fontSize: 14,
        marginRight: 6,
        letterSpacing: 0.1,
    },
    progressPercent: {
        flex: 1,
        textAlign: "right",
        fontWeight: "700",
        fontSize: 13,
    },
    progressBar: {
        height: 6,
        borderRadius: 3,
    },
    tipCard: {
        width: "100%",
        borderRadius: 10,
        padding: 16,
        marginBottom: 30,
        shadowColor: "#123960",
        shadowOpacity: 0.05,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 4,
        elevation: 1,
    },
    tipTitle: {
        fontWeight: "700",
        fontSize: 13,
        letterSpacing: 0.4,
    },
    tipText: {
        fontSize: 14,
        lineHeight: 20,
        textAlign: "left",
    },
    cancel: {
        marginTop: "auto",
        marginBottom: 28,
        alignSelf: "center",
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
        borderWidth: 1,
    },
    cancelText: {
        fontSize: 15,
        fontWeight: "500",
        textAlign: "center",
    },
});