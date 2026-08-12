import React, { useEffect, useState } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { AppIcon } from "@/components/ui/Icon";
import { useUploadStore } from "@/store/upload.store";
import { Colors, Radius, Spacing, Typography } from "@/theme";

export function UploadDropzone({ onPick }: { onPick: () => void }) {
    const images = useUploadStore((s) => s.images);

    // Subtle pulse to attract attention when empty
    const [scaleAnim] = useState(() => new Animated.Value(1));
    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(scaleAnim, { toValue: 1.07, duration: 800, useNativeDriver: true }),
                Animated.timing(scaleAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
            ]),
        );
        loop.start();
        return () => loop.stop();
    }, [scaleAnim]);

    const hasImages = images.length > 0;

    return (
        <Pressable
            onPress={onPick}
            style={{
                borderWidth: 2,
                borderStyle: "dashed",
                borderColor: hasImages ? Colors.gold : Colors.border,
                borderRadius: Radius.lg,
                padding: Spacing.xl,
                alignItems: "center",
                backgroundColor: hasImages ? "rgba(191,146,69,0.08)" : Colors.card,
                minHeight: 210,
                justifyContent: "center",
            }}
            accessibilityRole="button"
            accessibilityLabel="Upload items"
            accessibilityHint="Tap to select images of your clothes"
        >
            <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                <AppIcon
                    name={hasImages ? "shirt" : "shirt-outline"}
                    size={48}
                    color={hasImages ? Colors.gold : Colors.mid}
                    style={{ marginBottom: Spacing.sm }}
                />
            </Animated.View>

            <Text style={{ ...styles.title, color: hasImages ? Colors.gold : Colors.text }}>
                {hasImages ? "Items are ready" : "Add your first item"}
            </Text>

            <Text style={styles.sub}>
                {hasImages ? "You're ready to continue, or add more." : "Tap to select from your gallery, or use the buttons below."}
            </Text>

            {hasImages && (
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: Spacing.md, gap: 6 }}>
                    {images.slice(0, 3).map((img) => (
                        <Image
                            key={img.id}
                            source={{ uri: img.uri }}
                            style={{
                                width: 38,
                                height: 38,
                                borderRadius: Radius.sm,
                                borderWidth: 1,
                                borderColor: Colors.border,
                                backgroundColor: Colors.card2,
                            }}
                            contentFit="cover"
                        />
                    ))}
                    {images.length > 3 && (
                        <Text style={{ color: Colors.mid, fontSize: 11, marginLeft: 4 }}>
                            +{images.length - 3} more
                        </Text>
                    )}
                </View>
            )}
        </Pressable>
    );
}

const styles = {
    title: {
        fontSize: 16,
        fontFamily: Typography.serif,
        fontWeight: "600" as const,
    },
    sub: {
        fontSize: 12,
        textAlign: "center" as const,
        color: Colors.mid,
        marginTop: Spacing.sm,
        maxWidth: 260,
        lineHeight: 18,
    },
};
