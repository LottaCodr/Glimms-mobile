/**
 * Legacy design-job progress screen (deep-link target from push notifications,
 * guide §9/§13). Sessions use app/session/[id].tsx; this handles the legacy
 * pipeline's `job:*` events with the same visual language.
 */
import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { AppIcon, Icons } from "@/components/ui/Icon";
import { EmptyState } from "@/components/ui/EmptyState";
import { STEP_LABELS, useDesignJob } from "@/hooks/useDesignJob";
import { useSaveDesign } from "@/hooks/useDesigns";
import { toast } from "@/store/toast.store";
import type { GeneratedDesign } from "@/types/api";
import { Colors, Radius, Spacing, Typography } from "@/theme";

export default function JobScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const job = useDesignJob(id ?? null);
    const saveDesign = useSaveDesign();
    const [savedKeys, setSavedKeys] = React.useState<Record<number, boolean>>({});

    const onSave = async (design: GeneratedDesign, index: number) => {
        if (!id || savedKeys[index]) return;
        setSavedKeys((s) => ({ ...s, [index]: true }));
        try {
            await saveDesign.mutateAsync({ sourceId: id, design });
            toast.success("Look saved");
        } catch (e) {
            setSavedKeys((s) => ({ ...s, [index]: false }));
            toast.error(e instanceof Error ? e.message : "Couldn't save — please try again");
        }
    };

    if (job.status === "failed") {
        return (
            <SafeAreaView style={styles.root} edges={["top"]}>
                <EmptyState
                    icon="cloud-outline"
                    title="Design generation failed"
                    subtitle={job.error ?? "Please try again."}
                    actionLabel="Try again"
                    onAction={() => router.replace("/(tabs)/upload" as any)}
                />
            </SafeAreaView>
        );
    }

    if (job.status === "completed" && job.result) {
        const designs = job.result.designs ?? [];
        if (!designs.length) {
            return (
                <SafeAreaView style={styles.root} edges={["top"]}>
                    <EmptyState
                        icon="search-outline"
                        title="No items detected"
                        subtitle={job.result.message ?? "Try again with brighter light and a clearer angle."}
                        actionLabel="Retake photos"
                        onAction={() => router.replace("/(tabs)/upload" as any)}
                    />
                </SafeAreaView>
            );
        }
        return (
            <SafeAreaView style={styles.root} edges={["top"]}>
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ padding: Spacing.lg, paddingTop: Spacing.md, paddingBottom: 60 + insets.bottom }}
                >
                    <Text style={styles.title}>Your looks</Text>
                    <Text style={styles.sub}>
                        {designs.length} designs · {job.result.itemCount} items detected
                    </Text>
                    {designs.map((design, i) => {
                        const mockup = design.mockupUrl ?? design.mockup_url;
                        const isSaved = !!savedKeys[i];
                        return (
                            <View key={i} style={styles.card}>
                                {typeof mockup === "string" && !!mockup && (
                                    <Image source={{ uri: mockup }} style={styles.mockup} contentFit="cover" transition={180} />
                                )}
                                <View style={{ padding: Spacing.md }}>
                                    <View style={styles.cardTitleRow}>
                                        <Text style={styles.cardTitle}>{design.title ?? `Look ${i + 1}`}</Text>
                                        {typeof design.score === "number" && design.score > 0 && (
                                            <View style={styles.scorePill}>
                                                <AppIcon name={Icons.sparkle} size={10} color={Colors.gold} style={{ marginRight: 3 }} />
                                                <Text style={styles.scorePillText}>{Math.round(design.score * 100)}%</Text>
                                            </View>
                                        )}
                                    </View>
                                    {!!design.explanation && (
                                        <Text style={styles.explanation} numberOfLines={4}>
                                            {String(design.explanation)}
                                        </Text>
                                    )}
                                    {!!design.tips?.length && (
                                        <View style={{ marginTop: 8, gap: 6 }}>
                                            {design.tips.slice(0, 3).map((tip, ti) => (
                                                <View key={ti} style={styles.tipRow}>
                                                    <AppIcon name={Icons.bulb} size={12} color="#F59E0B" style={{ marginTop: 2 }} />
                                                    <Text style={styles.explanation}>{String(tip)}</Text>
                                                </View>
                                            ))}
                                        </View>
                                    )}
                                    <TouchableOpacity
                                        style={[styles.saveBtn, isSaved && styles.saveBtnDone]}
                                        onPress={() => void onSave(design, i)}
                                        disabled={isSaved || saveDesign.isPending}
                                        accessibilityRole="button"
                                    >
                                        <AppIcon
                                            name={isSaved ? "heart" : "heart-outline"}
                                            size={14}
                                            color={isSaved ? Colors.gold : Colors.black}
                                            style={{ marginRight: 6 }}
                                        />
                                        <Text style={[styles.saveBtnText, isSaved && { color: Colors.gold }]}>
                                            {isSaved ? "Saved" : "Save look"}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        );
                    })}
                    <TouchableOpacity
                        onPress={() => router.replace("/(tabs)/home")}
                        style={{ alignSelf: "center", marginTop: 8 }}
                        hitSlop={8}
                    >
                        <Text style={{ color: Colors.mid }}>Back to home</Text>
                    </TouchableOpacity>
                </ScrollView>
            </SafeAreaView>
        );
    }

    // In progress
    const stepLabel = job.step ? (STEP_LABELS[job.step] ?? job.step) : "Getting started…";
    return (
        <SafeAreaView style={[styles.root, styles.center]} edges={["top", "bottom"]}>
            <View style={styles.pulseCircle}>
                <AppIcon name={Icons.wardrobe} size={44} color={Colors.gold} />
            </View>
            <Text style={styles.title}>{stepLabel}</Text>
            {!!job.itemCount && <Text style={styles.sub}>{job.itemCount} items detected</Text>}
            <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.max(4, job.progress)}%` }]} />
            </View>
            <Text style={styles.pct}>{job.progress}%</Text>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: Colors.bg },
    center: { alignItems: "center", justifyContent: "center", padding: Spacing.lg },
    title: {
        fontSize: 20,
        fontFamily: Typography.serif,
        fontWeight: "600",
        color: Colors.text,
        textAlign: "center",
    },
    sub: { fontSize: 13, color: Colors.mid, marginTop: 6, textAlign: "center", lineHeight: 19 },
    pulseCircle: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: Colors.card,
        borderWidth: 1,
        borderColor: Colors.border,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 22,
    },
    track: {
        width: "80%",
        height: 6,
        borderRadius: 3,
        backgroundColor: Colors.card,
        marginTop: 24,
        overflow: "hidden",
    },
    fill: { height: "100%", backgroundColor: Colors.gold },
    pct: { color: Colors.mid, fontSize: 12, marginTop: 8, fontWeight: "600" },
    card: {
        backgroundColor: Colors.card,
        borderRadius: Radius.lg,
        borderWidth: 1,
        borderColor: Colors.border,
        overflow: "hidden",
        marginTop: 16,
    },
    mockup: { width: "100%", aspectRatio: 4 / 5, backgroundColor: Colors.card2 },
    cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    cardTitle: {
        flex: 1,
        fontSize: 17,
        fontFamily: Typography.serif,
        fontWeight: "600",
        color: Colors.text,
    },
    scorePill: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: Colors.goldGlow,
        borderWidth: 1,
        borderColor: "rgba(191,146,69,0.25)",
        borderRadius: Radius.full,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    scorePillText: { color: Colors.gold, fontWeight: "700", fontSize: 11 },
    explanation: { color: Colors.mid, fontSize: 13, lineHeight: 19, marginTop: 6, flex: 1 },
    tipRow: { flexDirection: "row", gap: 7 },
    saveBtn: {
        marginTop: 12,
        backgroundColor: Colors.gold,
        borderRadius: Radius.sm,
        paddingVertical: 11,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
    },
    saveBtnDone: { backgroundColor: Colors.card2, borderWidth: 1, borderColor: Colors.border },
    saveBtnText: { color: Colors.black, fontWeight: "700", fontSize: 13 },
});
