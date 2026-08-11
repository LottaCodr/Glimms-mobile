
import { useTheme } from "@/provider/ThemeProvider";
import { ClosetItem } from "@/types/closet.types";
import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
    item: ClosetItem;
    onPress?: () => void;
};

export const ClosetItemCard = memo(({ item, onPress }: Props) => {
    const theme = useTheme();

    return (
        <Pressable
            onPress={onPress}
            android_ripple={{ color: theme.colors.neutral[200] }}
            style={({ pressed }) => [
                styles.card,
                {
                    backgroundColor: theme.colors.neutral[0],
                    borderRadius: theme.radius.lg,
                    borderWidth: 1,
                    borderColor: theme.colors.neutral[200],
                    // Removed shadowColor and shadows
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                    opacity: pressed ? 0.95 : 1,
                },
            ]}
        >
            {/* Image Container */}
            <View
                style={[
                    styles.imageWrapper,
                    {
                        backgroundColor: theme.colors.neutral[100],
                        borderRadius: theme.radius.md,
                    },
                ]}
            >
                <Image
                    source={{ uri: item.image }}
                    style={styles.image}
                    resizeMode="cover"
                />

                {item.aiEnhanced && (
                    <View
                        style={[
                            styles.aiBadge,
                            {
                                backgroundColor: theme.colors.brand.primary,
                            },
                        ]}
                    >
                        <Ionicons name="sparkles" size={12} color="#fff" />
                    </View>
                )}
            </View>

            {/* Content */}
            <View style={{ marginTop: theme.spacing[3] }}>
                <Text
                    numberOfLines={1}
                    style={[
                        theme.typography.bodyMedium,
                        { color: theme.colors.neutral[900] },
                    ]}
                >
                    {item.name}
                </Text>

                <View
                    style={[
                        styles.tag,
                        {
                            backgroundColor: theme.colors.neutral[100],
                            borderRadius: theme.radius.sm,
                        },
                    ]}
                >
                    <Text
                        style={[
                            theme.typography.caption,
                            { color: theme.colors.neutral[600] },
                        ]}
                    >
                        {item.tag.toUpperCase()}
                    </Text>
                </View>
            </View>
        </Pressable>
    );
});

const styles = StyleSheet.create({
    card: {
        flex: 1,
        padding: 14,
        marginBottom: 16,
        // Removed shadow styles
        // border will be set inline for theming
    },

    imageWrapper: {
        height: 170,
        justifyContent: "center",
        alignItems: "center",
        overflow: "hidden",
        position: "relative",
    },

    image: {
        width: "100%",
        height: "100%",
        resizeMode: "contain",
    },

    aiBadge: {
        position: "absolute",
        top: 8,
        right: 8,
        borderRadius: 999,
        paddingHorizontal: 6,
        paddingVertical: 4,
    },

    tag: {
        alignSelf: "flex-start",
        marginTop: 6,
        paddingHorizontal: 8,
        paddingVertical: 3,
    },
});
