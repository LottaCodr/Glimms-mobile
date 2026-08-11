import { View, Text, Pressable, Animated, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/provider/ThemeProvider";
import { useUploadStore } from "@/store/upload.store";
import React, { useRef } from "react";

export function UploadDropzone({ onPick }: { onPick: () => void }) {
    const theme = useTheme();
    const images = useUploadStore((s) => s.images);

    // Animation for a subtle pulsing icon to attract user's attention
    const scaleAnim = useRef(new Animated.Value(1)).current;

    React.useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(scaleAnim, {
                    toValue: 1.07,
                    duration: 800,
                    useNativeDriver: true,
                }),
                Animated.timing(scaleAnim, {
                    toValue: 1,
                    duration: 700,
                    useNativeDriver: true,
                }),
            ])
        ).start();
    }, [scaleAnim]);

    // Use brand.secondary to substitute the missing 'success' color
    // Use a neutral green fallback for background/icon/text highlight when images exist
    const highlightColor = images.length > 0 ? (theme.colors.brand?.secondary || "#34c759") : theme.colors.brand.primary;
    const highlightColorBg = images.length > 0
        ? (theme.colors.brand?.secondary || "#34c759") + "15"
        : theme.colors.brand.primary + "08";

    return (
        <Pressable
            onPress={onPick}
            style={{
                borderWidth: 2,
                borderStyle: "dashed",
                borderColor: highlightColor,
                borderRadius: theme.radius.lg,
                padding: theme.spacing[6],
                alignItems: "center",
                backgroundColor: highlightColorBg,
                minHeight: 210,
                justifyContent: 'center',
                // 'transition' is not supported by React Native Style, so removed
            }}
            accessibilityRole="button"
            accessibilityLabel="Upload items"
            accessibilityHint="Tap to select images of your clothes"
        >
            <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                <Ionicons
                    name={images.length > 0 ? "shirt" : "shirt-outline"}
                    size={52}
                    color={highlightColor}
                    style={{
                        marginBottom: theme.spacing[2],
                    }}
                />
            </Animated.View>

            <Text style={{
                ...theme.typography.h4,
                color: highlightColor,
            }}>
                {images.length > 0 ? "Items are ready!" : "Add your first item"}
            </Text>

            <Text
                style={{
                    ...theme.typography.body,
                    textAlign: "center",
                    color: theme.colors.neutral[500],
                    marginTop: theme.spacing[2],
                    marginBottom: theme.spacing[2],
                }}
            >
                {images.length === 0
                    ? "Tap to select or use the buttons below"
                    : "You're ready to continue, or add more!"}
            </Text>

            {images.length > 0 ? (
                <View style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    // 'gap' is not supported in React Native Style, so handled by marginRight below
                    marginTop: theme.spacing[3],
                }}>
                    {images.slice(0, 3).map((img, i) => (
                        <Image
                            key={img.id}
                            source={{ uri: img.uri }}
                            style={{
                                width: 36,
                                height: 36,
                                borderRadius: theme.radius.md,
                                marginRight: i < 2 && images.length > 1 ? theme.spacing[1] : 0,
                                borderWidth: 1,
                                borderColor: theme.colors.neutral[200],
                                backgroundColor: "#ccc"
                            }}
                        />
                    ))}
                    {images.length > 3 &&
                        <Text style={{
                            ...theme.typography.caption,
                            marginLeft: theme.spacing[1]
                        }}>
                            +{images.length - 3} more
                        </Text>
                    }
                </View>
            ) : null}

            <Text
                style={{
                    marginTop: theme.spacing[4],
                    color: highlightColor,
                    fontWeight: "600",
                    ...theme.typography.bodyMedium,
                }}
            >
                {images.length === 0
                    ? "No images selected"
                    : `${images.length} ${images.length === 1 ? "image" : "images"} selected`}
            </Text>
        </Pressable>
    );
}
