import React, { useEffect, useRef } from "react";
import { Dimensions, StyleSheet, View } from "react-native";
import Animated, {
    Extrapolate,
    interpolate,
    runOnJS,
    scrollTo,
    useAnimatedRef,
    useAnimatedScrollHandler,
    useAnimatedStyle,
    useDerivedValue,
    useSharedValue,
} from "react-native-reanimated";
import { HeroRecommendationCard } from "./HeroRecommendationCard";

const { width } = Dimensions.get("window");

type CarouselProps = {
    items: {
        image: string;
        title: string;
        description: string;
        weather: string;
    }[];
    scrollY?: any;
};

export const HeroRecommendationCarousel = ({
    items,
    scrollY,
}: CarouselProps) => {
    const scrollX = useSharedValue(0);
    const carouselRef = useAnimatedRef<Animated.ScrollView>();

    const activeIndex = useSharedValue(0);
    const autoplayIndex = useRef(0);

    const [dotIndex, setDotIndex] = React.useState(0);

    /* ---------------------------
       AUTOPLAY
    --------------------------- */

    useEffect(() => {
        if (!items?.length) return;

        const interval = setInterval(() => {
            autoplayIndex.current =
                (autoplayIndex.current + 1) % items.length;

            scrollTo(
                carouselRef,
                autoplayIndex.current * width,
                0,
                true
            );
        }, 4000);

        return () => clearInterval(interval);
    }, [items.length]);

    /* ---------------------------
       SCROLL HANDLER
    --------------------------- */

    const scrollHandler = useAnimatedScrollHandler({
        onScroll: (event) => {
            scrollX.value = event.contentOffset.x;
        },

        onMomentumEnd: (event) => {
            const index = Math.round(event.contentOffset.x / width);

            activeIndex.value = index;

            runOnJS(setDotIndex)(index);
            autoplayIndex.current = index;
        },
    });

    /* ---------------------------
       DERIVED INDEX
    --------------------------- */

    const derivedIndex = useDerivedValue(() => {
        return scrollX.value / width;
    });

    /* ---------------------------
       UI
    --------------------------- */

    return (
        <View>
            <Animated.ScrollView
                ref={carouselRef}
                horizontal
                pagingEnabled
                snapToInterval={width}
                decelerationRate="fast"
                showsHorizontalScrollIndicator={false}
                scrollEventThrottle={16}
                bounces={false}
                onScroll={scrollHandler}
            >
                {items.map((item, i) => (
                    <View key={i} style={{ width }}>
                        <HeroRecommendationCard
                            scrollY={scrollY}
                            data={item}
                        />
                    </View>
                ))}
            </Animated.ScrollView>

            {/* Pagination Dots */}

            <View style={styles.dotsContainer}>
                {items.map((_, i) => (
                    <AnimatedDot
                        key={i}
                        index={i}
                        derivedIndex={derivedIndex}
                    />
                ))}
            </View>
        </View>
    );
};

/* ---------------------------
   DOT COMPONENT
--------------------------- */

const AnimatedDot = ({
    index,
    derivedIndex,
}: {
    index: number;
    derivedIndex: { value: number };
}) => {
    const animatedStyle = useAnimatedStyle(() => {
        const inputRange = [index - 1, index, index + 1];

        const scale = interpolate(
            derivedIndex.value,
            inputRange,
            [1, 1.4, 1],
            Extrapolate.CLAMP
        );

        const opacity = interpolate(
            derivedIndex.value,
            inputRange,
            [0.35, 1, 0.35],
            Extrapolate.CLAMP
        );

        return {
            transform: [{ scale }],
            opacity,
        };
    });

    return (
        <Animated.View style={[styles.dot, animatedStyle]} />
    );
};

/* ---------------------------
   STYLES
--------------------------- */

const styles = StyleSheet.create({
    dotsContainer: {
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        marginTop: 12,
    },

    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginHorizontal: 4,
        backgroundColor: "#333",
    },
});
