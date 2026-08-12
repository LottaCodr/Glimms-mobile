import { useTheme } from "@/provider/ThemeProvider";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Dimensions,
    Image,
    Platform,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useAuthStore } from "@/store/auth.store"; // <-- import the store

function getThemeColor(theme: any, key: string, fallback: string) {
    if (!theme?.colors) return fallback;

    return (
        key
            .split(".")
            .reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), theme.colors) ||
        fallback
    );
}

const themeKeys = {
    background: "neutral.0",
    primary: "brand.primary",
    text: "neutral.900",
    subdued: "neutral.600",
};

const slides = [
    {
        image: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80",
        title: "Welcome to Glimms",
        subtitle: "Organize your wardrobe and discover new styles seamlessly.",
    },
    {
        image: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80",
        title: "Digitize Your Closet",
        subtitle: "Scan and add your clothes with just a few taps.",
    },
    {
        image: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80",
        title: "Personalized For You",
        subtitle: "Get outfit suggestions tailored to your lifestyle.",
    },
];

export default function OnboardingIntro() {
    const router = useRouter();
    const theme = useTheme();
    const [currentSlide, setCurrentSlide] = useState(0);
    const scrollRef = useRef<ScrollView>(null);

    // Zustand auth store
    const isAuthenticated = useAuthStore(state => state.isAuthenticated);
    const hydrate = useAuthStore(state => state.hydrateAuth);

    // Only for initial hydration/loading state
    const [checkingAuth, setCheckingAuth] = useState(true);

    // Check authentication on mount
    useEffect(() => {
        let alive = true;
        const check = async () => {
            await hydrate();
            if (alive) setCheckingAuth(false);
        };
        check();
        return () => { alive = false; }
    }, [hydrate]);

    // If authenticated, route to home
    useEffect(() => {
        if (!checkingAuth && isAuthenticated) {
            router.replace("/(tabs)/home");
        }
    }, [checkingAuth, isAuthenticated, router]);

    // Track image load/error for each slide
    const [imageLoadedArr, setImageLoadedArr] = useState<boolean[]>(Array(slides.length).fill(false));
    const [imageErrorArr, setImageErrorArr] = useState<boolean[]>(Array(slides.length).fill(false));
    const [manualScroll, setManualScroll] = useState(false);

    const {
        backgroundColor,
        primaryColor,
        textColor,
        subduedColor,
    } = useMemo(() => {
        return {
            backgroundColor: getThemeColor(theme, themeKeys.background, "#FFFFFF"),
            primaryColor: getThemeColor(theme, themeKeys.primary, "#2A7BF6"),
            textColor: getThemeColor(theme, themeKeys.text, "#111111"),
            subduedColor: getThemeColor(theme, themeKeys.subdued, "#6B7280"),
        };
    }, [theme]);

    const handleGetStarted = useCallback(() => {
        router.push("/(auth)/register");
    }, [router]);
    const handleSignIn = useCallback(() => {
        router.push("/(auth)/login");
    }, [router]);

    const SCREEN_WIDTH = Dimensions.get("window").width;
    const heroWidth = Math.min(SCREEN_WIDTH * 0.86, 360);
    const heroHeight = heroWidth * 1.08;

    // Auto-swiping effect only when user hasn't scrolled manually in a while
    useEffect(() => {
        if (manualScroll) return;
        const interval = setInterval(() => {
            setCurrentSlide((old) => {
                const next = (old + 1) % slides.length;
                scrollRef.current?.scrollTo({ x: next * heroWidth, animated: true });
                return next;
            });
        }, 3800);
        return () => clearInterval(interval);
    }, [manualScroll, heroWidth]);

    // After manual scroll enable auto-scroll after a pause
    useEffect(() => {
        if (!manualScroll) return;
        const timeout = setTimeout(() => setManualScroll(false), 6500);
        return () => clearTimeout(timeout);
    }, [manualScroll]);

    const onScroll = (event: any) => {
        const offsetX = event.nativeEvent.contentOffset?.x ?? 0;
        const slide = Math.round(offsetX / heroWidth);
        setCurrentSlide(slide);
        setManualScroll(true);
    };

    // Tappable dot indicator for manual slide selection
    const handleIndicatorPress = (idx: number) => {
        scrollRef.current?.scrollTo({ x: idx * heroWidth, animated: true });
        setCurrentSlide(idx);
        setManualScroll(true);
    };

    // While checking auth, just show splash or spinner
    if (checkingAuth) {
        return (
            <SafeAreaView style={[styles.safeArea, { backgroundColor, justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color={primaryColor} />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[styles.safeArea, { backgroundColor }]}>
            <View style={styles.container}>
                {/* Logo */}
                <View style={styles.logoRow}>
                    <View style={[styles.logoCircle, { backgroundColor: primaryColor + "26" }]}>
                        <Ionicons name="sparkles" size={26} color={primaryColor} />
                    </View>
                    <Text style={[styles.logoText, { color: textColor }]}>GLIMMS</Text>
                </View>

                {/* Slideshow */}
                <View
                    style={[
                        styles.heroWrapper,
                        {
                            width: heroWidth,
                            height: heroHeight,
                        },
                    ]}
                >
                    <ScrollView
                        ref={scrollRef}
                        horizontal
                        pagingEnabled
                        showsHorizontalScrollIndicator={false}
                        style={{ flex: 1 }}
                        contentContainerStyle={{ flexGrow: 1 }}
                        onScroll={onScroll}
                        scrollEventThrottle={16}
                        decelerationRate={0.96}
                        overScrollMode="never"
                    >
                        {slides.map((slide, idx) => (
                            <View
                                key={idx}
                                style={{
                                    width: heroWidth,
                                    height: heroHeight,
                                    justifyContent: "center",
                                    alignItems: "center",
                                    backgroundColor: "#f6f7fa",
                                }}
                            >
                                {!imageLoadedArr[idx] && !imageErrorArr[idx] && (
                                    <View style={styles.heroLoadingOverlay}>
                                        <ActivityIndicator size="large" color={primaryColor} />
                                    </View>
                                )}
                                <Image
                                    source={{ uri: slide.image }}
                                    style={[
                                        styles.heroImage,
                                        {
                                            width: heroWidth,
                                            height: heroHeight,
                                            opacity: imageLoadedArr[idx] ? 1 : 0,
                                        },
                                    ]}
                                    resizeMode="cover"
                                    onLoad={() =>
                                        setImageLoadedArr((arr) => {
                                            const next = [...arr];
                                            next[idx] = true;
                                            return next;
                                        })
                                    }
                                    onError={() => {
                                        setImageErrorArr((arr) => {
                                            const next = [...arr];
                                            next[idx] = true;
                                            return next;
                                        });
                                        setImageLoadedArr((arr) => {
                                            const next = [...arr];
                                            next[idx] = true;
                                            return next;
                                        });
                                    }}
                                    blurRadius={imageLoadedArr[idx] ? 0 : 2}
                                />
                                {imageErrorArr[idx] && (
                                    <View style={styles.heroErrorOverlay}>
                                        <Text style={{ color: "#bbb", fontSize: 16 }}>Image unavailable</Text>
                                    </View>
                                )}
                            </View>
                        ))}
                    </ScrollView>
                </View>

                {/* Slide indicators */}
                <View style={styles.indicatorsRow}>
                    {slides.map((_, idx) => {
                        const isActive = idx === currentSlide;
                        return (
                            <Pressable
                                key={idx}
                                style={[
                                    styles.dot,
                                    {
                                        width: isActive ? 22 : 8,
                                        backgroundColor: isActive
                                            ? primaryColor
                                            : "#E4EDF6",
                                        opacity: isActive ? 1 : 0.5,
                                    },
                                ]}
                                accessibilityRole="button"
                                accessibilityLabel={`Go to slide ${idx + 1}`}
                                hitSlop={{ left: 8, right: 8, top: 8, bottom: 8 }}
                                onPress={() => handleIndicatorPress(idx)}
                            >
                                {isActive && <View style={styles.dotInnerHighlight} />}
                            </Pressable>
                        );
                    })}
                </View>

                {/* Text Section */}
                <View style={styles.textBlock}>
                    <Text style={[
                        styles.title,
                        {
                            color: textColor,
                            textAlign: "center",
                            marginBottom: 10,
                        }
                    ]}>
                        {slides[currentSlide]?.title}
                    </Text>
                    <Text style={[
                        styles.subtitle,
                        {
                            color: subduedColor,
                            textAlign: "center",
                            maxWidth: 360,
                            marginHorizontal: "auto",
                        }
                    ]}>
                        {slides[currentSlide]?.subtitle}
                    </Text>
                </View>

                {/* Action */}
                <TouchableOpacity
                    style={[
                        styles.primaryButton,
                        {
                            backgroundColor: primaryColor,
                            ...(Platform.OS === "android" ? { elevation: 4 } : {}),
                        },
                    ]}
                    onPress={handleGetStarted}
                    activeOpacity={0.88}
                >
                    <Text style={styles.primaryButtonText}>Get Started</Text>
                </TouchableOpacity>

                <View style={styles.bottomLinks}>
                    <Text style={styles.bottomText}>
                        Already have an account?
                    </Text>
                    <Pressable onPress={handleSignIn} android_ripple={{ color: "#eee" }}>
                        <Text
                            style={[
                                styles.signInText,
                                { color: primaryColor, textDecorationLine: "underline", marginLeft: 3 }
                            ]}
                        >
                            Sign In
                        </Text>
                    </Pressable>
                </View>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
    },

    container: {
        flex: 1,
        paddingHorizontal: 22,
        paddingTop: 22,
        paddingBottom: 26,
        alignItems: "center",
        backgroundColor: "transparent",
    },

    logoRow: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 26,
        marginTop: 4,
    },

    logoCircle: {
        width: 43,
        height: 43,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 12,
    },



    logoText: {
        fontSize: 19,
        fontWeight: "bold",
        letterSpacing: 3,
        textTransform: "uppercase",
        opacity: 0.95,
    },

    heroWrapper: {
        borderRadius: 24,
        overflow: "hidden",
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 36,
        shadowColor: "#000",
        shadowOpacity: 0.13,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 7 },
        backgroundColor: "#f6f7fa",
    },
    heroImage: {
        borderRadius: 24,
    },
    heroLoadingOverlay: {
        ...StyleSheet.absoluteFill,
        justifyContent: "center",
        alignItems: "center",
        zIndex: 2,
        backgroundColor: "#f6f7fa",
    },
    heroErrorOverlay: {
        ...StyleSheet.absoluteFill,
        zIndex: 3,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#f6f7fa",
    },

    indicatorsRow: {
        flexDirection: "row",
        marginTop: 10,
        marginBottom: 6,
        justifyContent: "center",
        alignItems: "center",
        minHeight: 26,
    },
    dot: {
        height: 8,
        borderRadius: 8,
        marginHorizontal: 3,
        justifyContent: "center",
        alignItems: "center",
        overflow: "hidden",
    },
    dotInnerHighlight: {
        width: 12,
        height: 2,
        borderRadius: 1,
        backgroundColor: "#ffffff90",
        marginTop: 5,
        opacity: 0.75,
    },

    textBlock: {
        alignItems: "center",
        marginBottom: 34,
        paddingHorizontal: 16,
        marginTop: 1,
    },

    title: {
        fontSize: 27,
        fontWeight: "900",
        textAlign: "center",
        lineHeight: 34,
        //marginBottom: 10,
        letterSpacing: 0.1,
    },

    subtitle: {
        fontSize: 16.5,
        textAlign: "center",
        lineHeight: 25,
        opacity: 0.99,
        marginTop: 2,
        fontWeight: "500",
    },

    primaryButton: {
        width: "100%",
        paddingVertical: 16,
        borderRadius: 18,
        alignItems: "center",
        marginBottom: 13,
        shadowColor: "#000",
        shadowOpacity: 0.15,
        shadowRadius: 7,
        shadowOffset: { width: 0, height: 4 },
        backgroundColor: "#2A7BF6",
    },

    primaryButtonText: {
        color: "#fff",
        fontSize: 17,
        fontWeight: "bold",
        letterSpacing: 0.35,
    },

    bottomLinks: {
        flexDirection: "row",
        marginTop: 2,
        alignItems: "center",
    },

    bottomText: {
        fontSize: 15,
        color: "#888",
        opacity: 0.95,
        fontWeight: "400",
    },

    signInText: {
        fontSize: 15,
        fontWeight: "bold",
        paddingHorizontal: 0,
        opacity: 1,
    },
});
