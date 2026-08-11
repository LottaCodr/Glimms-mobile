import { useTheme } from "@/provider/ThemeProvider";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect } from "react";
import {
    ImageBackground,
    StyleSheet,
    Text,
    View,
} from "react-native";
import Animated, {
    Extrapolate,
    FadeIn,
    interpolate,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";
import { PrimaryButton } from "../buttons/PrimaryButton";

type Props = {
    loading?: boolean;
    scrollY?: any;
    data?: {
        image: string;
        title: string;
        description: string;
        weather: string;
    };
};

export const HeroRecommendationCard = ({
    loading = false,
    scrollY,
    data = {
        image:
            "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80",
        title: "Board Meeting Ready",
        description:
            "Tailored navy blazer layered over a crisp white Oxford. Confident, sharp, effortless.",
        weather: "☀ 68°F • Clear",
    },
}: Props) => {
    const theme = useTheme();
    const scale = useSharedValue(1.08);

    const safeScrollY =
        scrollY && typeof scrollY === "object" && "value" in scrollY
            ? scrollY
            : { value: 0 };

    useEffect(() => {
        scale.value = withTiming(1, { duration: 900 });
    }, []);

    const animatedImageStyle = useAnimatedStyle(() => {
        const translateY = interpolate(
            safeScrollY.value,
            [-300, 0, 300],
            [-60, 0, 80],
            Extrapolate.CLAMP,
        );

        return {
            transform: [{ translateY }, { scale: scale.value }],
        };
    });

    return (
        <Animated.View
            entering={FadeIn.duration(800)}
            style={{ marginTop: theme.spacing[4] }}
        >
            <View
                style={[
                    styles.container,
                    // { borderRadius: theme.radius.lg },
                ]}
            >
                <Animated.View style={[styles.imageWrapper, animatedImageStyle]}>
                    <ImageBackground
                        source={{ uri: data.image }}
                        style={styles.image}
                        // imageStyle={{ borderRadius: theme.radius.lg }}
                    >
                        {/* Layer 1: Soft top fade */}
                        <LinearGradient
                            colors={["rgba(0,0,0,0.15)", "transparent"]}
                            style={[StyleSheet.absoluteFillObject]}
                        />

                        {/* Layer 2: Strong bottom fade */}
                        <LinearGradient
                            colors={["transparent", "rgba(0,0,0,0.75)"]}
                            style={[StyleSheet.absoluteFillObject]}
                        />

                        {/* Content */}
                        <View
                            style={[
                                styles.content,
                                { padding: theme.spacing[4] },
                            ]}
                        >
                            {/* Top Row */}
                            <View style={styles.topRow}>
                                <View
                                    style={[
                                        styles.aiBadge,
                                        {
                                            backgroundColor:
                                                theme.colors.brand.primary + "CC",
                                        },
                                    ]}
                                >
                                    <Text style={styles.aiText}>AI PICK</Text>
                                </View>

                                <View style={styles.weatherPill}>
                                    <Text style={styles.weatherText}>
                                        {data.weather}
                                    </Text>
                                </View>
                            </View>

                            {/* Bottom Section */}
                            <View>
                                <Text style={styles.title}>
                                    {data.title}
                                </Text>

                                <Text style={styles.description}>
                                    {data.description}
                                </Text>

                                <View style={{ marginTop: theme.spacing[3] }}>
                                    <PrimaryButton
                                        title="View Full Outfit"
                                        onPress={() => { }}
                                    />
                                </View>
                            </View>
                        </View>
                    </ImageBackground>
                </Animated.View>
            </View>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        overflow: "hidden",
        shadowColor: "#000",
        shadowOpacity: 0.15,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 12 },
        elevation: 10,
    },

    imageWrapper: {
        height: 400,
    },

    image: {
        flex: 1,
        justifyContent: "space-between",
    },

    content: {
        flex: 1,
        justifyContent: "space-between",
    },

    topRow: {
        flexDirection: "row",
        justifyContent: "space-between",
    },

    aiBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },

    aiText: {
        color: "#fff",
        fontSize: 11,
        fontWeight: "700",
        letterSpacing: 1.2,
    },

    weatherPill: {
        backgroundColor: "rgba(255,255,255,0.18)",
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
    },

    weatherText: {
        color: "#fff",
        fontSize: 13,
        fontWeight: "500",
    },

    title: {
        color: "#fff",
        fontSize: 28,
        fontWeight: "700",
        letterSpacing: -0.5,
    },

    description: {
        color: "rgba(255,255,255,0.92)",
        marginTop: 8,
        fontSize: 15,
        lineHeight: 22,
    },
});
