import React, { useEffect, useState } from "react";
import { Animated, StyleSheet, View, ViewStyle } from "react-native";
import { Colors, Radius } from "@/theme";

type Props = {
    width?: number | string;
    height?: number;
    borderRadius?: number;
    style?: ViewStyle;
};

/** Pulsing placeholder used while queries load (guide §17 caching UX). */
export function Skeleton({ width = "100%", height = 16, borderRadius = Radius.sm, style }: Props) {
    const [opacity] = useState(() => new Animated.Value(0.35));

    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(opacity, { toValue: 0.8, duration: 650, useNativeDriver: true }),
                Animated.timing(opacity, { toValue: 0.35, duration: 650, useNativeDriver: true }),
            ]),
        );
        loop.start();
        return () => loop.stop();
    }, [opacity]);

    return (
        <Animated.View
            style={[
                styles.base,
                { width: width as any, height, borderRadius, opacity },
                style,
            ]}
        />
    );
}

/** Grid of tiles — wardrobe placeholder. */
export function TileGridSkeleton({ count = 6, columns = 3 }: { count?: number; columns?: number }) {
    return (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {Array.from({ length: count }).map((_, i) => (
                <Skeleton
                    key={i}
                    width={`${100 / columns - 3}%`}
                    height={140}
                    borderRadius={Radius.md}
                />
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    base: { backgroundColor: Colors.card2 },
});
