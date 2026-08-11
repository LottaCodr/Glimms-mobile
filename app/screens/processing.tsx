/**
 * Generic processing view (legacy route — realtime progress now lives on
 * app/session/[id].tsx). Restyled to the dark-gold brand; shows an indeterminate
 * pulse + tips while a simulated or redirected flow is in flight.
 */
import { AppIcon, Icons } from "@/components/ui/Icon";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { Colors, Radius, Spacing, Typography } from "@/theme";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ProcessingScreen() {
    const router = useRouter();
    const pulse = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, { toValue: 1.08, duration: 700, useNativeDriver: true }),
                Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
            ]),
        );
        loop.start();
        return () => loop.stop();
    }, [pulse]);

    return (
        <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
            <Animated.View style={[styles.iconCircle, { transform: [{ scale: pulse }] }]}>
                <LinearGradient
                    colors={[Colors.card, Colors.bg]}
                    style={StyleSheet.absoluteFill}
                    start={{ x: 0.2, y: 0 }}
                    end={{ x: 1, y: 1 }}
                />
                <AppIcon name={Icons.sparkle} size={44} color={Colors.gold} />
            </Animated.View>

            <Text style={styles.title}>Analysing your items…</Text>
            <Text style={styles.sub}>
                Creating outfit combinations based on your style, occasion and climate.
            </Text>

            <View style={styles.tipCard}>
                <View style={styles.tipHeader}>
                    <AppIcon name={Icons.bulb} size={16} color="#F59E0B" />
                    <Text style={styles.tipTitle}>STYLE TIP</Text>
                </View>
                <Text style={styles.tipText}>
                    Monochrome outfits with varied textures create a sophisticated look for rainy city days.
                </Text>
            </View>

            <View style={{ marginTop: "auto", alignSelf: "stretch", paddingHorizontal: Spacing.lg }}>
                <PrimaryButton label="Cancel" variant="ghost" onPress={() => router.back()} />
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: Colors.bg,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: Spacing.lg,
        paddingBottom: Spacing.lg,
    },
    iconCircle: {
        width: 100,
        height: 100,
        borderRadius: 50,
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 26,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: Colors.border,
    },
    title: {
        fontSize: 20,
        fontFamily: Typography.serif,
        fontWeight: "600",
        color: Colors.text,
        marginBottom: 8,
        textAlign: "center",
    },
    sub: {
        fontSize: 13,
        color: Colors.mid,
        textAlign: "center",
        lineHeight: 19,
        marginBottom: Spacing.xl,
        maxWidth: 300,
    },
    tipCard: {
        alignSelf: "stretch",
        borderRadius: Radius.md,
        padding: Spacing.md,
        backgroundColor: "rgba(245,158,11,0.08)",
        borderWidth: 1,
        borderColor: "rgba(245,158,11,0.2)",
    },
    tipHeader: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 6 },
    tipTitle: { fontWeight: "700", fontSize: 11, letterSpacing: 1, color: "#F59E0B" },
    tipText: { fontSize: 13, lineHeight: 19, color: Colors.mid },
});
