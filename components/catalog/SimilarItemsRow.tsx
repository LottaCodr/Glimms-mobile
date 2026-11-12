/**
 * A horizontal row of the user's own items related to one catalog item:
 * look-alikes ("similar") or matching pieces from other categories ("pairs").
 * Renders nothing while loading, on error, or when there is nothing to show —
 * it is an optional extra on the item screen.
 */
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Touchable } from "@/components/motion";
import { AppIcon, Icons } from "@/components/ui/Icon";
import { Colors, Radius, Spacing } from "@/theme";
import { useSimilarItems } from "@/hooks/useCatalog";
import type { SimilarityMode } from "@/types/api";

type Props = {
    itemId: string;
    mode: SimilarityMode;
    title: string;
    onOpen: (id: string) => void;
};

export function SimilarItemsRow({ itemId, mode, title, onOpen }: Props) {
    const { data } = useSimilarItems(itemId, mode);
    if (!data?.available || data.items.length === 0) return null;

    return (
        <View style={styles.section}>
            <Text style={styles.title}>{title}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
                {data.items.map((item, index) => (
                    <Touchable
                        key={item.id}
                        enterIndex={index}
                        onPress={() => onOpen(item.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`${item.label}, ${Math.round(item.similarity * 100)} percent similar`}
                        style={styles.card}
                    >
                        <View style={[styles.thumb, { backgroundColor: item.color?.dominant?.hex ?? Colors.card2 }]}>
                            {item.imageUrl ? (
                                <Image
                                    source={{ uri: item.imageUrl }}
                                    style={StyleSheet.absoluteFill}
                                    contentFit="cover"
                                    transition={150}
                                />
                            ) : (
                                <AppIcon name={Icons.wardrobe} size={24} color={Colors.mid} />
                            )}
                            <View style={styles.badge}>
                                <Text style={styles.badgeText}>{Math.round(item.similarity * 100)}%</Text>
                            </View>
                        </View>
                        <Text style={styles.label} numberOfLines={1}>
                            {item.label}
                        </Text>
                    </Touchable>
                ))}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    section: { marginTop: Spacing.lg },
    title: {
        fontSize: 10,
        letterSpacing: 1.6,
        color: Colors.mid,
        fontWeight: "700",
        marginBottom: 10,
    },
    row: { gap: Spacing.sm, paddingRight: Spacing.lg },
    card: { width: 104 },
    thumb: {
        width: 104,
        height: 132,
        borderRadius: Radius.md,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
    },
    badge: {
        position: "absolute",
        right: 6,
        bottom: 6,
        backgroundColor: "rgba(0,0,0,0.6)",
        borderRadius: Radius.sm,
        paddingHorizontal: 6,
        paddingVertical: 2,
    },
    badgeText: { color: Colors.white, fontSize: 10, fontWeight: "600" },
    label: { fontSize: 12, color: Colors.text, marginTop: 6 },
});
