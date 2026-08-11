import { useTheme } from "@/provider/ThemeProvider";
import React from "react";
import { ScrollView, Text, View, Image, Pressable } from "react-native";

const mockData = [
    {
        id: 1,
        title: "Neutral Minimalist Textures",
        category: "SPACE PLANNER",
        image:
            "https://images.unsplash.com/photo-1501045661006-fcebe0257c3f?auto=format&fit=crop&w=800&q=80",
    },
    {
        id: 2,
        title: "Modern Workspace Setup",
        category: "INTERIOR",
        image:
            "https://images.unsplash.com/photo-1505691723518-36a5ac3be353?auto=format&fit=crop&w=800&q=80",
    },
    {
        id: 3,
        title: "Warm Scandinavian Living",
        category: "HOME DESIGN",
        image:
            "https://images.unsplash.com/photo-1493666438817-866a91353ca9?auto=format&fit=crop&w=800&q=80",
    },
];

export default function TrendingCard() {
    const theme = useTheme();

    return (
        <View style={{ marginTop: theme.spacing[6] }}>
            {/* Header */}
            <View
                style={{
                    paddingHorizontal: theme.spacing[4],
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                }}
            >
                <Text style={theme.typography.h3}>Recently Added</Text>

                <Pressable>
                    <Text
                        style={{
                            color: theme.colors.brand.primary,
                            fontWeight: "600",
                        }}
                    >
                        View All
                    </Text>
                </Pressable>
            </View>

            {/* Horizontal Cards */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{
                    paddingHorizontal: theme.spacing[4],
                    gap: theme.spacing[4],
                    marginTop: theme.spacing[3],
                }}
            >
                {mockData.map((item) => (
                    <Pressable
                        key={item.id}
                        style={{
                            width: 180,
                            borderRadius: theme.radius.lg,
                            overflow: "hidden",
                            backgroundColor: theme.colors.neutral[0],

                            // Removed shadow, added subtle border
                            borderWidth: 1,
                            borderColor: theme.colors.neutral[200],
                        }}
                    >
                        {/* Image */}
                        <Image
                            source={{ uri: item.image }}
                            style={{
                                width: "100%",
                                height: 200,
                            }}
                            resizeMode="cover"
                        />

                        {/* Content */}
                        <View
                            style={{
                                padding: theme.spacing[3],
                                gap: 4,
                            }}
                        >
                            {/* Category Badge */}
                            <View
                                style={{
                                    alignSelf: "flex-start",
                                    backgroundColor: theme.colors.brand.primary + "15",
                                    paddingHorizontal: 8,
                                    paddingVertical: 3,
                                    borderRadius: theme.radius.full,
                                }}
                            >
                                <Text
                                    style={{
                                        fontSize: 10,
                                        fontWeight: "600",
                                        color: theme.colors.brand.primary,
                                        letterSpacing: 0.5,
                                    }}
                                >
                                    {item.category}
                                </Text>
                            </View>

                            {/* Title */}
                            <Text
                                numberOfLines={2}
                                style={{
                                    fontWeight: "600",
                                    fontSize: 14,
                                    lineHeight: 18,
                                    color: theme.colors.neutral[900],
                                }}
                            >
                                {item.title}
                            </Text>
                        </View>
                    </Pressable>
                ))}
            </ScrollView>
        </View>
    );
}
