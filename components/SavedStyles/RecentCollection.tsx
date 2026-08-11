import { useTheme } from "@/provider/ThemeProvider";
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { FlatList, ImageBackground, Pressable, Text, View, StyleSheet } from "react-native";

// Mock data for demo purposes
const mockStyles = [
    {
        id: "1",
        title: "Classic Trench",
        image: "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=400&q=80",
        liked: false,
        category: "outerwear",
    },
    {
        id: "2",
        title: "Red Sundress",
        image: "https://images.unsplash.com/photo-1515378791036-0648a3ef77b2?auto=format&fit=crop&w=400&q=80",
        liked: true,
        category: "dresses",
    },
    {
        id: "3",
        title: "Wide Leg Jeans",
        image: "https://images.unsplash.com/photo-1469398715555-76331a4c1725?auto=format&fit=crop&w=400&q=80",
        liked: false,
        category: "pants",
    },
    {
        id: "4",
        title: "Striped Tee",
        image: "https://images.unsplash.com/photo-1484517186945-66c19bb2e4cf?auto=format&fit=crop&w=400&q=80",
        liked: true,
        category: "tops",
    },
];

export default function RecentCollection({
    data,
    mockFilter,
}: {
    data?: typeof mockStyles;
    mockFilter?: string;
} = {}) {
    const theme = useTheme();
    const [mockedStyles, setMockedStyles] = useState<typeof mockStyles>(data || mockStyles);
    const filter = mockFilter || "all";

    const toggleLike = (id: string) => {
        setMockedStyles((styles) =>
            styles.map((item) => (item.id === id ? { ...item, liked: !item.liked } : item))
        );
    };

    const filtered = filter === "all" ? mockedStyles : mockedStyles.filter((s) => s.category === filter);

    return (
        <FlatList
            data={filtered}
            numColumns={2}
            keyExtractor={(i) => i.id}
            columnWrapperStyle={{ gap: theme.spacing[4], marginBottom: theme.spacing[4] }}
            contentContainerStyle={{ paddingHorizontal: theme.spacing[4] }}
            scrollEnabled={false}
            renderItem={({ item }) => (
                <View style={[styles.card, { borderRadius: theme.radius.lg, backgroundColor: theme.colors.neutral[900] }]}>
                    <ImageBackground
                        source={{ uri: item.image }}
                        style={styles.image}
                        imageStyle={{ borderRadius: theme.radius.lg }}
                    >
                        <View style={styles.gradientOverlay} />
                        <Pressable
                            onPress={() => toggleLike(item.id)}
                            style={styles.likeButton}
                        >
                            <Ionicons
                                name={item.liked ? "heart" : "heart-outline"}
                                color="#fff"
                                size={22}
                            />
                        </Pressable>
                        <View style={styles.titleWrapper}>
                            <Text style={{ color: "#fff", fontWeight: "600" }}>{item.title}</Text>
                        </View>
                    </ImageBackground>
                </View>
            )}
        />
    );
}

const styles = StyleSheet.create({
    card: {
        flex: 1,
        overflow: "hidden",
        // subtle shadow
        shadowColor: "#000",
        shadowOpacity: 0.08,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 4,
    },
    image: {
        width: "100%",
        height: 220,
        justifyContent: "flex-end",
    },
    gradientOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(0,0,0,0.15)",
        borderRadius: 12,
    },
    likeButton: {
        position: "absolute",
        top: 10,
        right: 10,
        backgroundColor: "rgba(0,0,0,0.4)",
        padding: 6,
        borderRadius: 20,
        alignItems: "center",
        justifyContent: "center",
    },
    titleWrapper: {
        padding: 10,
        backgroundColor: "rgba(0,0,0,0.25)",
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 12,
    },
});
