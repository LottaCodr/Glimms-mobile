/**
 * Design activity — v1 design sessions + legacy jobs in one feed
 * (guide §8A listing: GET /v1/design-sessions; §9: GET /api/designs/jobs).
 * Tap a live session to resume its realtime progress screen.
 */
import React from "react";
import {
    FlatList,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Colors, Radius, Spacing, Typography } from "@/theme";
import { AppIcon, Icons } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { sessionService } from "@/services/sessions.service";
import type { DesignSession, SessionStatus } from "@/types/api";

const STATUS_META: Record<string, { icon: string; color: string; label: string }> = {
    completed: { icon: Icons.checkCircle, color: "#5DBB7D", label: "Completed" },
    failed: { icon: Icons.alert, color: Colors.error, label: "Failed" },
    cancelled: { icon: "close-circle-outline", color: Colors.mid, label: "Cancelled" },
    created: { icon: Icons.clock, color: Colors.mid, label: "Created" },
    uploading: { icon: "cloud-upload-outline", color: Colors.gold, label: "Uploading" },
    queued: { icon: Icons.clock, color: Colors.gold, label: "Queued" },
};

function metaFor(status: SessionStatus) {
    return (
        STATUS_META[status] ?? {
            icon: Icons.refresh,
            color: Colors.gold,
            label: status.replace(/_/g, " "),
        }
    );
}

function SessionRow({ session }: { session: DesignSession }) {
    const router = useRouter();
    const meta = metaFor(session.status);
    const designCount = session.designs?.length ?? 0;

    return (
        <TouchableOpacity
            style={styles.row}
            activeOpacity={0.8}
            onPress={() => router.push(`/session/${session.session_id}` as any)}
            accessibilityRole="button"
            accessibilityLabel={`${session.vertical} design session, ${meta.label}`}
        >
            <View style={[styles.iconWrap, { backgroundColor: `${meta.color}1F` }]}>
                <AppIcon name={meta.icon} size={17} color={meta.color} />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>
                    {session.vertical.charAt(0).toUpperCase() + session.vertical.slice(1)} design
                </Text>
                <Text style={styles.rowSub}>
                    {meta.label}
                    {designCount > 0 ? ` · ${designCount} look${designCount === 1 ? "" : "s"}` : ""} ·{" "}
                    {new Date(session.createdAt).toLocaleDateString()}
                </Text>
            </View>
            {session.status !== "completed" && session.status !== "failed" && session.status !== "cancelled" && (
                <View style={styles.progressPill}>
                    <Text style={styles.progressPillText}>{session.progress ?? 0}%</Text>
                </View>
            )}
            <AppIcon name="chevron-forward" size={16} color={Colors.mid} />
        </TouchableOpacity>
    );
}

export default function ActivityScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const query = useInfiniteQuery({
        queryKey: ["sessions"],
        queryFn: ({ pageParam = 1 }) => sessionService.list(pageParam, 20),
        initialPageParam: 1,
        getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    });

    const sessions = query.data?.pages.flatMap((p) => p.sessions) ?? [];

    return (
        <SafeAreaView style={styles.container} edges={["top"]}>
            <View style={styles.header}>
                <IconButton icon="chevron-back" accessibilityLabel="Back" onPress={() => router.back()} />
                <Text style={styles.headerTitle}>Design Activity</Text>
                <View style={{ width: 38 }} />
            </View>

            <FlatList
                data={sessions}
                keyExtractor={(s) => s.session_id}
                contentContainerStyle={[styles.list, { paddingBottom: 60 + insets.bottom }]}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={query.isRefetching}
                        onRefresh={() => query.refetch()}
                        tintColor={Colors.gold}
                    />
                }
                onEndReached={() => {
                    if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
                }}
                onEndReachedThreshold={0.4}
                renderItem={({ item }) => <SessionRow session={item} />}
                ListEmptyComponent={
                    query.isLoading ? (
                        <View style={{ gap: 10 }}>
                            {[0, 1, 2, 3].map((i) => (
                                <Skeleton key={i} height={62} borderRadius={Radius.md} />
                            ))}
                        </View>
                    ) : (
                        <EmptyState
                            icon={Icons.clock}
                            title="No design sessions yet"
                            subtitle="Your scan history will appear here — tap the scan button on the home tab to start."
                            actionLabel="Start a scan"
                            onAction={() => router.push('/screens/scan' as any)}
                        />
                    )
                }
            />
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
    headerTitle: { fontSize: 16, fontFamily: Typography.serif, fontWeight: "600", color: Colors.text },
    list: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: 60 },
    row: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        backgroundColor: Colors.card,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: Radius.md,
        padding: 12,
        marginBottom: 10,
    },
    iconWrap: {
        width: 38,
        height: 38,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
    },
    rowTitle: { fontSize: 14, fontWeight: "600", color: Colors.text },
    rowSub: { fontSize: 11, color: Colors.mid, marginTop: 2, textTransform: "capitalize" },
    progressPill: {
        backgroundColor: Colors.goldGlow,
        borderRadius: Radius.full,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderWidth: 1,
        borderColor: "rgba(191,146,69,0.25)",
    },
    progressPillText: { fontSize: 10, fontWeight: "700", color: Colors.gold },
});
