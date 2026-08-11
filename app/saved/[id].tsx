/**
 * Saved design detail: mockup hero, score, explanation, tips, items, actions.
 * The API only lists saved designs (no GET /saved/:id), so we hydrate from the
 * React Query cache the list screens already populated.
 */
import React from "react";
import { Alert, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { Colors, Radius, Spacing, Typography } from "@/theme";
import { AppIcon, Icons } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { useDeleteSavedDesign, useToggleFavorite } from "@/hooks/useDesigns";
import { toast } from "@/store/toast.store";
import type { PaginatedDesigns, SavedDesign } from "@/types/api";

function findInCaches(qc: ReturnType<typeof useQueryClient>, id: string): SavedDesign | undefined {
    const matches = qc.getQueriesData<{ pages: PaginatedDesigns[] }>({ queryKey: ["saved"] });
    for (const [, data] of matches) {
        const hit = data?.pages.flatMap((p) => p.designs).find((d) => d.id === id);
        if (hit) return hit;
    }
    return undefined;
}

export default function SavedDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const qc = useQueryClient();

    // Re-derive on every render so optimistic favorite toggles reflect instantly.
    const all = qc.getQueriesData<{ pages: PaginatedDesigns[] }>({ queryKey: ["saved"] });
    void all; // reactivity anchor
    const design = id ? findInCaches(qc, id) : undefined;

    const favorite = useToggleFavorite();
    const del = useDeleteSavedDesign();

    const onShare = () => {
        if (!design) return;
        const parts = [design.title, design.explanation, ...(design.tips ?? [])].filter(Boolean).map(String);
        Share.share({ message: parts.join("\n\n") || "Check out this Glimms look" }).catch(() => {});
    };

    const onDelete = () =>
        Alert.alert("Delete this look?", "This can’t be undone.", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete",
                style: "destructive",
                onPress: async () => {
                    if (!design) return;
                    try {
                        await del.mutateAsync(design.id);
                        toast.success("Look deleted");
                        router.back();
                    } catch {
                        toast.error("Delete failed — please try again");
                    }
                },
            },
        ]);

    if (!design) {
        return (
            <SafeAreaView style={styles.container} edges={["top"]}>
                <View style={styles.header}>
                    <IconButton icon="chevron-back" accessibilityLabel="Back" onPress={() => router.back()} />
                    <View style={{ width: 38 }} />
                </View>
                <EmptyState
                    icon={Icons.heartOutline}
                    title="Look not found"
                    subtitle="It may have been deleted, or the list is still loading."
                    actionLabel="Back to saved"
                    onAction={() => router.back()}
                />
            </SafeAreaView>
        );
    }

    const itemLabels = (design.items ?? [])
        .map((it: any) => it?.label ?? it?.name)
        .filter(Boolean)
        .map(String);

    return (
        <SafeAreaView style={styles.container} edges={["top"]}>
            {/* Header */}
            <View style={styles.header}>
                <IconButton icon="chevron-back" accessibilityLabel="Back" onPress={() => router.back()} />
                <View style={{ flexDirection: "row", gap: 8 }}>
                    <IconButton
                        icon={design.isFavorite ? Icons.heart : Icons.heartOutline}
                        color={design.isFavorite ? Colors.gold : Colors.text}
                        accessibilityLabel={design.isFavorite ? "Remove from favorites" : "Add to favorites"}
                        onPress={() => favorite.mutate(design.id)}
                    />
                    <IconButton icon={Icons.share} accessibilityLabel="Share look" onPress={onShare} />
                    <IconButton
                        icon={Icons.trash}
                        color={Colors.error}
                        accessibilityLabel="Delete look"
                        onPress={onDelete}
                    />
                </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
                {/* Hero */}
                <View style={styles.heroWrap}>
                    {design.mockupUrl ? (
                        <Image source={{ uri: design.mockupUrl }} style={styles.hero} contentFit="cover" transition={180} />
                    ) : (
                        <View style={[styles.hero, styles.heroFallback]}>
                            <AppIcon name={Icons.sparkle} size={40} color={Colors.gold} />
                        </View>
                    )}
                    {design.score > 0 && (
                        <View style={styles.scoreBadge}>
                            <AppIcon name={Icons.sparkle} size={11} color={Colors.black} style={{ marginRight: 4 }} />
                            <Text style={styles.scoreBadgeText}>{Math.round(design.score * 100)}% match</Text>
                        </View>
                    )}
                </View>

                {/* Title + date */}
                <Text style={styles.title}>{design.title ?? "Saved look"}</Text>
                <Text style={styles.meta}>Saved {new Date(design.createdAt).toLocaleDateString()}</Text>

                {/* Explanation */}
                {!!design.explanation && (
                    <View style={styles.card}>
                        <View style={styles.cardHeader}>
                            <AppIcon name={Icons.sparkle} size={14} color={Colors.gold} />
                            <Text style={styles.cardLabel}>WHY IT WORKS</Text>
                        </View>
                        <Text style={styles.cardText}>{design.explanation}</Text>
                    </View>
                )}

                {/* Tips */}
                {!!design.tips?.length && (
                    <View style={styles.card}>
                        <View style={styles.cardHeader}>
                            <AppIcon name={Icons.bulb} size={14} color="#F59E0B" />
                            <Text style={styles.cardLabel}>STYLING TIPS</Text>
                        </View>
                        {design.tips.map((tip, i) => (
                            <View key={i} style={styles.tipRow}>
                                <AppIcon name="ellipse" size={5} color={Colors.gold} style={{ marginTop: 7 }} />
                                <Text style={styles.cardText}>{String(tip)}</Text>
                            </View>
                        ))}
                    </View>
                )}

                {/* Items */}
                {!!itemLabels.length && (
                    <View style={styles.card}>
                        <View style={styles.cardHeader}>
                            <AppIcon name={Icons.wardrobe} size={14} color={Colors.text} />
                            <Text style={styles.cardLabel}>IN THIS LOOK</Text>
                        </View>
                        <View style={styles.chipWrap}>
                            {itemLabels.map((l, i) => (
                                <Chip key={i} label={l} small />
                            ))}
                        </View>
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm,
    },
    scroll: { paddingHorizontal: Spacing.lg, paddingBottom: 60 },
    heroWrap: { marginTop: Spacing.sm },
    hero: {
        width: "100%",
        aspectRatio: 4 / 5,
        borderRadius: Radius.lg,
        backgroundColor: Colors.card2,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    heroFallback: { alignItems: "center", justifyContent: "center" },
    scoreBadge: {
        position: "absolute",
        top: 12,
        right: 12,
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: Colors.gold,
        borderRadius: Radius.full,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    scoreBadgeText: { color: Colors.black, fontWeight: "800", fontSize: 11 },
    title: {
        fontSize: 26,
        fontFamily: Typography.serif,
        fontWeight: "600",
        color: Colors.text,
        marginTop: Spacing.md,
    },
    meta: { color: Colors.mid, fontSize: 12, marginTop: 4, marginBottom: Spacing.md },
    card: {
        backgroundColor: Colors.card,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: Radius.lg,
        padding: Spacing.md,
        marginBottom: Spacing.sm,
    },
    cardHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
    cardLabel: { fontSize: 10, letterSpacing: 1.6, color: Colors.mid, fontWeight: "700" },
    cardText: { color: Colors.text, fontSize: 13.5, lineHeight: 20, flex: 1 },
    tipRow: { flexDirection: "row", gap: 10, marginBottom: 6 },
    chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
