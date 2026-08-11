/**
 * Design-session progress + results — the landing screen after a scan (guide §8A step 4).
 * Realtime via Socket.IO (`subscribe:session`) with REST polling fallback.
 */
import React, { useMemo, useState } from "react";
import {
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppIcon, Icons } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { SESSION_STEP_LABELS, useDesignSession } from "@/hooks/useDesignSession";
import { useSaveDesign } from "@/hooks/useDesigns";
import { sessionService } from "@/services/sessions.service";
import { toast } from "@/store/toast.store";
import type { GeneratedDesign, StepStatus } from "@/types/api";
import { Colors, Radius, Spacing, Typography } from "@/theme";

const STEP_ORDER = [
    "quality",
    "detection",
    "attributes",
    "context",
    "permutations",
    "embeddings",
    "reasoning",
    "mockups",
] as const;

function stepMeta(status: StepStatus): { icon: string; color: string } {
    switch (status) {
        case "completed":
            return { icon: "checkmark", color: "#5DBB7D" };
        case "running":
            return { icon: "ellipse", color: Colors.gold };
        case "failed":
            return { icon: "close", color: Colors.error };
        case "skipped":
            return { icon: "remove", color: Colors.mid };
        default:
            return { icon: "ellipse-outline", color: Colors.dim };
    }
}

export default function SessionScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const session = useDesignSession(id ?? null);
    const saveDesign = useSaveDesign();
    const [savedKeys, setSavedKeys] = useState<Record<number, boolean>>({});

    const steps = useMemo(
        () => STEP_ORDER.map((key) => ({ key, status: (session.steps[key] ?? "pending") as StepStatus })),
        [session.steps],
    );

    const onSave = async (design: GeneratedDesign, index: number) => {
        if (!id || savedKeys[index]) return;
        setSavedKeys((s) => ({ ...s, [index]: true }));
        try {
            // Session results don't carry a jobId; the session_id identifies the source.
            await saveDesign.mutateAsync({ sourceId: id, design });
            toast.success("Look saved");
        } catch (e) {
            setSavedKeys((s) => ({ ...s, [index]: false }));
            toast.error(e instanceof Error ? e.message : "Couldn't save — please try again");
        }
    };

    const onCancel = () =>
        Alert.alert("Cancel session?", "The pipeline will stop processing these photos.", [
            { text: "Keep going", style: "cancel" },
            {
                text: "Cancel session",
                style: "destructive",
                onPress: async () => {
                    if (id) {
                        try {
                            await sessionService.cancel(id);
                        } catch {
                            /* already terminal — fine */
                        }
                    }
                    router.back();
                },
            },
        ]);

    // ── Completed: design carousel ───────────────────────────────────────────
    if (session.status === "completed") {
        if (!session.designs.length) {
            return (
                <SafeAreaView style={[styles.root, { backgroundColor: Colors.bg }]} edges={["top"]}>
                    <EmptyState
                        icon="search-outline"
                        title="Nothing detected"
                        subtitle="We couldn’t spot any items in those photos. Try brighter light and a clearer angle."
                        actionLabel="Retake photos"
                        onAction={() => router.replace("/(tabs)/upload" as any)}
                    />
                </SafeAreaView>
            );
        }

        return (
            <SafeAreaView style={[styles.root, { backgroundColor: Colors.bg }]} edges={["top"]}>
                <View style={styles.headerRow}>
                    <IconButton
                        icon="close"
                        accessibilityLabel="Close results"
                        onPress={() => router.replace("/(tabs)/home")}
                    />
                    <View style={{ flex: 1, alignItems: "center" }}>
                        <Text style={styles.doneTitle}>Your looks</Text>
                        <Text style={styles.doneSub}>
                            {session.designs.length} designs from your scans
                        </Text>
                    </View>
                    <View style={{ width: 38 }} />
                </View>

                {!!session.warnings.length && (
                    <View style={styles.warningBanner}>
                        <AppIcon name={Icons.alert} size={14} color="#F59E0B" style={{ marginRight: 6 }} />
                        <Text style={styles.warningText} numberOfLines={2}>
                            {session.warnings.join(" · ")}
                        </Text>
                    </View>
                )}

                <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
                    {session.designs.map((design, i) => {
                        const mockup = design.mockupUrl ?? design.mockup_url;
                        const isSaved = !!savedKeys[i];
                        return (
                            <View key={i} style={styles.designCard}>
                                {typeof mockup === "string" && !!mockup && (
                                    <Image source={{ uri: mockup }} style={styles.mockup} contentFit="cover" transition={180} />
                                )}
                                <View style={{ padding: Spacing.md }}>
                                    <View style={styles.designTitleRow}>
                                        <Text style={styles.designTitle} numberOfLines={1}>
                                            {design.title ?? `Look ${i + 1}`}
                                        </Text>
                                        {typeof design.score === "number" && design.score > 0 && (
                                            <View style={styles.scorePill}>
                                                <AppIcon name={Icons.sparkle} size={10} color={Colors.gold} style={{ marginRight: 3 }} />
                                                <Text style={styles.scoreText}>{Math.round(design.score * 100)}%</Text>
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
                                                    <Text style={styles.tip}>{String(tip)}</Text>
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
                </ScrollView>
            </SafeAreaView>
        );
    }

    // ── Failed / cancelled ───────────────────────────────────────────────────
    if (session.status === "failed" || session.status === "cancelled") {
        return (
            <SafeAreaView style={[styles.root, { backgroundColor: Colors.bg }]} edges={["top"]}>
                <EmptyState
                    icon={session.status === "cancelled" ? "close-circle-outline" : "cloud-outline"}
                    title={session.status === "cancelled" ? "Session cancelled" : "Something went wrong"}
                    subtitle={session.error ?? "Design generation failed. Please try again."}
                    actionLabel={session.status === "failed" ? "Try again" : "Back to home"}
                    onAction={() =>
                        session.status === "failed"
                            ? router.replace("/(tabs)/upload" as any)
                            : router.replace("/(tabs)/home")
                    }
                />
            </SafeAreaView>
        );
    }

    // ── In progress ──────────────────────────────────────────────────────────
    return (
        <SafeAreaView style={[styles.root, styles.center, { backgroundColor: Colors.bg }]} edges={["top", "bottom"]}>
            <View style={styles.pulseCircle}>
                <AppIcon name={Icons.sparkle} size={44} color={Colors.gold} />
            </View>
            <Text style={styles.statusLabel}>{session.label}</Text>
            <Text style={styles.statusSub}>
                {SESSION_STEP_LABELS[session.status ?? "created"] ?? "Working on it…"}
            </Text>

            <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.max(4, session.progress)}%` }]} />
            </View>
            <Text style={styles.progressPct}>{session.progress}%</Text>

            <View style={styles.stepsCard}>
                {steps.map(({ key, status }) => {
                    const meta = stepMeta(status);
                    return (
                        <View key={key} style={styles.stepRow}>
                            <View style={[styles.stepDot, { borderColor: meta.color }]}>
                                <AppIcon name={meta.icon} size={9} color={meta.color} />
                            </View>
                            <Text style={[styles.stepLabel, status === "running" && { color: Colors.gold }]}>
                                {key.charAt(0).toUpperCase() + key.slice(1)}
                            </Text>
                            {status === "running" && (
                                <Text style={styles.stepRunning}>in progress</Text>
                            )}
                        </View>
                    );
                })}
            </View>

            {!!session.warnings.length && (
                <View style={[styles.warningBanner, { marginHorizontal: Spacing.lg }]}>
                    <AppIcon name={Icons.alert} size={14} color="#F59E0B" style={{ marginRight: 6 }} />
                    <Text style={styles.warningText}>{session.warnings.join(" · ")}</Text>
                </View>
            )}

            <TouchableOpacity onPress={onCancel} style={styles.cancelBtn} hitSlop={8}>
                <Text style={{ color: Colors.mid, fontSize: 14 }}>Cancel</Text>
            </TouchableOpacity>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    center: { alignItems: "center", justifyContent: "center", padding: Spacing.lg },
    headerRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm,
    },
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
    statusLabel: {
        fontSize: 20,
        fontFamily: Typography.serif,
        fontWeight: "600",
        color: Colors.text,
        textAlign: "center",
    },
    statusSub: { fontSize: 13, color: Colors.mid, marginTop: 4, textAlign: "center" },
    progressTrack: {
        width: "80%",
        height: 6,
        borderRadius: 3,
        backgroundColor: Colors.card,
        marginTop: 24,
        overflow: "hidden",
    },
    progressFill: { height: "100%", backgroundColor: Colors.gold, borderRadius: 3 },
    progressPct: { color: Colors.mid, fontSize: 12, marginTop: 8, fontWeight: "600" },
    stepsCard: {
        marginTop: 26,
        backgroundColor: Colors.card,
        borderRadius: Radius.lg,
        borderWidth: 1,
        borderColor: Colors.border,
        padding: Spacing.md,
        width: "90%",
        gap: 12,
    },
    stepRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    stepDot: {
        width: 18,
        height: 18,
        borderRadius: 9,
        borderWidth: 1.5,
        alignItems: "center",
        justifyContent: "center",
    },
    stepLabel: { color: Colors.mid, fontSize: 13, flex: 1 },
    stepRunning: { color: Colors.gold, fontSize: 10, fontWeight: "600" },
    cancelBtn: { marginTop: 26, padding: 10 },
    warningBanner: {
        flexDirection: "row",
        alignItems: "center",
        marginHorizontal: Spacing.lg,
        marginTop: 10,
        backgroundColor: "rgba(245,158,11,0.12)",
        borderRadius: Radius.sm,
        padding: 10,
        borderWidth: 1,
        borderColor: "rgba(245,158,11,0.25)",
    },
    warningText: { color: "#F59E0B", fontSize: 12, flex: 1 },
    doneTitle: {
        fontSize: 19,
        fontFamily: Typography.serif,
        fontWeight: "600",
        color: Colors.text,
        textAlign: "center",
    },
    doneSub: { fontSize: 12, color: Colors.mid, marginTop: 2, textAlign: "center" },
    designCard: {
        backgroundColor: Colors.card,
        borderRadius: Radius.lg,
        borderWidth: 1,
        borderColor: Colors.border,
        overflow: "hidden",
        marginBottom: 16,
    },
    mockup: { width: "100%", aspectRatio: 4 / 5, backgroundColor: Colors.card2 },
    designTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    designTitle: {
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
    scoreText: { color: Colors.gold, fontWeight: "700", fontSize: 12 },
    explanation: { color: Colors.mid, fontSize: 13, lineHeight: 19, marginTop: 6 },
    tipRow: { flexDirection: "row", gap: 7 },
    tip: { color: Colors.mid, fontSize: 12, lineHeight: 17, flex: 1 },
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
