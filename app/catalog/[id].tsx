/**
 * Catalog item detail (guide §16.6): hero image, colour palette, AI style tags,
 * inline label edit, user tags, attributes, and soft delete.
 */
import React, { useCallback, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Colors, Radius, Spacing, Typography } from "@/theme";
import { AppIcon, Icons } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { Chip } from "@/components/ui/Chip";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { catalogService } from "@/services/catalog.service";
import { useDeleteCatalogItem, useUpdateCatalogItem } from "@/hooks/useCatalog";
import { toast } from "@/store/toast.store";
import type { CatalogItem } from "@/types/api";

function PaletteSwatch({ hex, label }: { hex: string; label: string }) {
    return (
        <View style={{ alignItems: "center", gap: 4 }}>
            <View style={[styles.swatch, { backgroundColor: hex }]} />
            <Text style={styles.swatchLabel}>{hex}</Text>
        </View>
    );
}

export default function CatalogItemScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const qc = useQueryClient();

    const query = useQuery({
        queryKey: ["catalog", "item", id],
        queryFn: async (): Promise<CatalogItem> => {
            const item = await catalogService.get(id!);
            // Attach a fresh presigned URL for rendering.
            try {
                item.imageUrl = await catalogService.getImageUrl(id!);
            } catch {
                /* leave null → placeholder */
            }
            return item;
        },
        enabled: !!id,
    });
    const item = query.data;

    const [imageUri, setImageUri] = useState<string | null>(null);
    const onImageError = useCallback(async () => {
        if (!id) return;
        try {
            setImageUri(await catalogService.getImageUrl(id));
        } catch {
            /* keep */
        }
    }, [id]);

    const update = useUpdateCatalogItem();
    const del = useDeleteCatalogItem();

    const [editingLabel, setEditingLabel] = useState(false);
    const [labelDraft, setLabelDraft] = useState("");
    const [tagDraft, setTagDraft] = useState("");

    const saveLabel = async () => {
        const v = labelDraft.trim();
        if (!v || !item) return;
        try {
            await update.mutateAsync({ id: item.id, patch: { label: v } });
            setEditingLabel(false);
            toast.success("Label updated");
        } catch {
            toast.error("Couldn't update the label");
        }
    };

    const addTag = async () => {
        const v = tagDraft.trim().toLowerCase();
        if (!v || !item) return;
        if (item.tags.includes(v)) {
            setTagDraft("");
            return;
        }
        try {
            await update.mutateAsync({ id: item.id, patch: { tags: [...item.tags, v] } });
            setTagDraft("");
            toast.success(`Tagged “${v}”`);
        } catch {
            toast.error("Couldn't add the tag");
        }
    };

    const removeTag = async (tag: string) => {
        if (!item) return;
        try {
            await update.mutateAsync({ id: item.id, patch: { tags: item.tags.filter((t) => t !== tag) } });
        } catch {
            toast.error("Couldn't remove the tag");
        }
    };

    const onDelete = () =>
        Alert.alert("Remove this item?", "It will be removed from your catalog. This can’t be undone.", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Remove",
                style: "destructive",
                onPress: async () => {
                    if (!item) return;
                    try {
                        await del.mutateAsync(item.id);
                        toast.success("Item removed");
                        qc.invalidateQueries({ queryKey: ["catalog"] });
                        router.back();
                    } catch {
                        toast.error("Delete failed — please try again");
                    }
                },
            },
        ]);

    return (
        <SafeAreaView style={styles.container} edges={["top"]}>
            {/* Header */}
            <View style={styles.header}>
                <IconButton icon="chevron-back" accessibilityLabel="Back" onPress={() => router.back()} variant="card" />
                <Text style={styles.headerTitle} numberOfLines={1}>
                    {item?.label ?? "Catalog item"}
                </Text>
                <IconButton icon={Icons.trash} accessibilityLabel="Delete item" color={Colors.error} onPress={onDelete} variant="card" />
            </View>

            {query.isLoading ? (
                <View style={{ padding: Spacing.lg, gap: 12 }}>
                    <Skeleton height={340} borderRadius={Radius.lg} />
                    <Skeleton height={20} width="60%" />
                    <Skeleton height={14} width="40%" />
                </View>
            ) : query.isError || !item ? (
                <EmptyState
                    icon={Icons.error}
                    title="Item not found"
                    subtitle="It may have been removed from your catalog."
                    actionLabel="Back to wardrobe"
                    onAction={() => router.back()}
                />
            ) : (
                <KeyboardAvoidingView
                    style={{ flex: 1 }}
                    behavior={Platform.OS === "ios" ? "padding" : undefined}
                >
                    <ScrollView
                        contentContainerStyle={[styles.scroll, { paddingBottom: 60 + insets.bottom }]}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                    >
                        {/* Hero */}
                        <View style={[styles.hero, { backgroundColor: item.color?.dominant?.hex ?? Colors.card2 }]}>
                            {(imageUri ?? item.imageUrl) ? (
                                <Image
                                    source={{ uri: imageUri ?? item.imageUrl! }}
                                    style={StyleSheet.absoluteFill}
                                    contentFit="contain"
                                    onError={onImageError}
                                    transition={180}
                                />
                            ) : (
                                <AppIcon name={Icons.wardrobe} size={52} color={Colors.mid} />
                            )}
                        <View style={styles.verticalChip}>
                            <AppIcon name={Icons.wardrobe} size={11} color={Colors.black} style={{ marginRight: 4 }} />
                            <Text style={styles.verticalChipText}>{item.vertical}</Text>
                        </View>
                        {item.confidence > 0 && (
                            <View style={styles.confChip}>
                                <Text style={styles.confChipText}>{Math.round(item.confidence * 100)}% match</Text>
                            </View>
                        )}
                    </View>

                    {/* Label */}
                    <View style={styles.section}>
                        {editingLabel ? (
                            <View style={styles.editRow}>
                                <TextInput
                                    value={labelDraft}
                                    onChangeText={setLabelDraft}
                                    style={styles.editInput}
                                    autoFocus
                                    placeholder="Item name"
                                    placeholderTextColor={Colors.dim}
                                    onSubmitEditing={saveLabel}
                                    returnKeyType="done"
                                />
                                <PrimaryButton label="Save" onPress={saveLabel} small loading={update.isPending} />
                            </View>
                        ) : (
                            <TouchableOpacity
                                style={styles.labelRow}
                                onPress={() => {
                                    setLabelDraft(item.label);
                                    setEditingLabel(true);
                                }}
                                accessibilityRole="button"
                                accessibilityLabel="Edit item name"
                            >
                                <Text style={styles.label}>{item.label}</Text>
                                <AppIcon name={Icons.edit} size={15} color={Colors.mid} />
                            </TouchableOpacity>
                        )}
                        <Text style={styles.metaText}>
                            {[item.category, item.texture, item.pattern].filter(Boolean).join(" · ")}
                        </Text>
                    </View>

                    {/* Colour palette */}
                    {!!item.color && (
                        <View style={styles.section}>
                            <Text style={styles.sectionLabel}>COLOUR</Text>
                            <View style={styles.paletteRow}>
                                {item.color.dominant && (
                                    <PaletteSwatch hex={item.color.dominant.hex} label="dominant" />
                                )}
                                {(item.color.palette ?? []).slice(0, 4).map((c, i) => (
                                    <PaletteSwatch key={i} hex={c.hex} label="" />
                                ))}
                                {!!item.color.mood && (
                                    <View style={styles.moodPill}>
                                        <Text style={styles.moodPillText}>{item.color.mood}</Text>
                                    </View>
                                )}
                            </View>
                        </View>
                    )}

                    {/* AI style tags */}
                    {!!item.styleTags?.length && (
                        <View style={styles.section}>
                            <Text style={styles.sectionLabel}>AI STYLE TAGS</Text>
                            <View style={styles.chipWrap}>
                                {item.styleTags.map((t) => (
                                    <Chip key={t} label={t} small icon="sparkles-outline" />
                                ))}
                            </View>
                        </View>
                    )}

                    {/* User tags (editable) */}
                    <View style={styles.section}>
                        <Text style={styles.sectionLabel}>YOUR TAGS</Text>
                        <View style={styles.chipWrap}>
                            {item.tags.map((t) => (
                                <TouchableOpacity key={t} onPress={() => removeTag(t)} activeOpacity={0.7}>
                                    <View style={styles.removableChip}>
                                        <Text style={styles.chipLabel}>{t}</Text>
                                        <AppIcon name="close" size={11} color={Colors.mid} />
                                    </View>
                                </TouchableOpacity>
                            ))}
                            <View style={styles.tagInputRow}>
                                <TextInput
                                    value={tagDraft}
                                    onChangeText={setTagDraft}
                                    placeholder="Add tag…"
                                    placeholderTextColor={Colors.dim}
                                    style={styles.tagInput}
                                    autoCapitalize="none"
                                    onSubmitEditing={addTag}
                                    returnKeyType="done"
                                />
                                <TouchableOpacity onPress={addTag} style={styles.tagAddBtn} accessibilityLabel="Add tag">
                                    <AppIcon name="add" size={16} color={Colors.black} />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>

                    {/* Attributes */}
                    {!!item.attributes && Object.keys(item.attributes).length > 0 && (
                        <View style={styles.section}>
                            <Text style={styles.sectionLabel}>DETAILS</Text>
                            <View style={styles.attrsCard}>
                                {Object.entries(item.attributes).map(([k, v]) => (
                                    <View key={k} style={styles.attrRow}>
                                        <Text style={styles.attrKey}>{k}</Text>
                                        <Text style={styles.attrValue} numberOfLines={2}>
                                            {typeof v === "object" ? JSON.stringify(v) : String(v)}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        </View>
                    )}

                    <Text style={styles.addedMeta}>
                        Added {new Date(item.createdAt).toLocaleDateString()}
                    </Text>

                        {update.isPending || del.isPending ? (
                            <ActivityIndicator color={Colors.gold} style={{ marginTop: 8 }} />
                        ) : null}
                    </ScrollView>
                </KeyboardAvoidingView>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg },
    header: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm,
    },
    headerTitle: {
        flex: 1,
        fontSize: 15,
        fontWeight: "600",
        color: Colors.text,
        textAlign: "center",
    },
    scroll: { padding: Spacing.lg, paddingBottom: 60 },
    hero: {
        width: "100%",
        aspectRatio: 4 / 5,
        borderRadius: Radius.lg,
        borderWidth: 1,
        borderColor: Colors.border,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
    },
    verticalChip: {
        position: "absolute",
        top: 12,
        left: 12,
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: Colors.cream,
        borderRadius: Radius.full,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    verticalChipText: { color: Colors.black, fontSize: 10, fontWeight: "700", textTransform: "capitalize" },
    confChip: {
        position: "absolute",
        bottom: 12,
        right: 12,
        backgroundColor: "rgba(0,0,0,0.65)",
        borderRadius: Radius.full,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    confChipText: { color: "#fff", fontSize: 10, fontWeight: "600" },
    section: { marginTop: Spacing.lg },
    sectionLabel: {
        fontSize: 10,
        letterSpacing: 1.6,
        color: Colors.mid,
        fontWeight: "700",
        marginBottom: 10,
    },
    labelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    label: { fontSize: 22, fontFamily: Typography.serif, fontWeight: "600", color: Colors.text },
    metaText: { color: Colors.mid, fontSize: 13, marginTop: 4, textTransform: "capitalize" },
    editRow: { flexDirection: "row", gap: 10, alignItems: "center" },
    editInput: {
        flex: 1,
        height: 44,
        backgroundColor: Colors.card,
        borderWidth: 1,
        borderColor: Colors.gold,
        borderRadius: Radius.md,
        paddingHorizontal: Spacing.md,
        color: Colors.text,
        fontSize: 15,
    },
    paletteRow: { flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" },
    swatch: {
        width: 40,
        height: 40,
        borderRadius: Radius.sm,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.15)",
    },
    swatchLabel: { fontSize: 9, color: Colors.dim },
    moodPill: {
        backgroundColor: Colors.goldGlow,
        borderRadius: Radius.full,
        borderWidth: 1,
        borderColor: "rgba(191,146,69,0.3)",
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    moodPillText: { color: Colors.gold, fontSize: 11, fontWeight: "600", textTransform: "capitalize" },
    chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
    removableChip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        backgroundColor: Colors.card,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: Radius.full,
        paddingHorizontal: 12,
        height: 28,
    },
    chipLabel: { fontSize: 11, color: Colors.text, fontWeight: "500" },
    tagInputRow: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: Colors.card,
        borderWidth: 1,
        borderColor: Colors.border,
        borderStyle: "dashed",
        borderRadius: Radius.full,
        paddingLeft: 12,
        height: 28,
    },
    tagInput: { color: Colors.text, fontSize: 11, minWidth: 90, height: "100%" },
    tagAddBtn: {
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: Colors.gold,
        alignItems: "center",
        justifyContent: "center",
        marginHorizontal: 3,
    },
    attrsCard: {
        backgroundColor: Colors.card,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: Radius.md,
        overflow: "hidden",
    },
    attrRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        gap: 12,
        paddingHorizontal: Spacing.md,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: "rgba(255,255,255,0.04)",
    },
    attrKey: { color: Colors.mid, fontSize: 12, textTransform: "capitalize" },
    attrValue: { color: Colors.text, fontSize: 12, fontWeight: "500", flexShrink: 1, textAlign: "right" },
    addedMeta: { color: Colors.dim, fontSize: 11, textAlign: "center", marginTop: Spacing.xl },
});
