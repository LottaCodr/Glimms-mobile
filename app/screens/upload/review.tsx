import React, { useState } from "react";
import { Alert, FlatList, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { IconButton } from "@/components/ui/IconButton";
import { PreviewCard } from "@/components/closet/upload/PreviewCard";
import { StepIndicator } from "@/components/closet/upload/StepIndicator";
import { EmptyState } from "@/components/ui/EmptyState";
import { Screen } from "@/components/layout/Screen";
import { Colors, Spacing, Typography } from "@/theme";
import { ApiError } from "@/services/api.client";
import { uploadService } from "@/services/upload.service";
import { analyticsService } from "@/services/analytics.service";
import { useUploadStore } from "@/store/upload.store";

export default function ReviewUploads() {
    const router = useRouter();
    const { images, removeImage, step, reset } = useUploadStore();
    const [starting, setStarting] = useState(false);

    const startSession = async () => {
        if (!images.length || starting) return;
        setStarting(true);
        try {
            const result = await uploadService.startDesignSession(
                "wardrobe",
                images.map((i) => ({ uri: i.uri })),
            );
            if (result.kind === "queued_offline") {
                Alert.alert("Saved offline", "We’ll process these when you’re back online.");
                reset();
                router.back();
                return;
            }
            analyticsService.track("scan_uploaded", { vertical: "wardrobe", imageCount: images.length });
            reset();
            router.push(`/session/${result.sessionId}` as any);
        } catch (e) {
            if (e instanceof ApiError && e.code === "SCAN_LIMIT_REACHED") {
                Alert.alert("Daily limit reached", "Upgrade for more scans per day.", [
                    { text: "Not now", style: "cancel" },
                    { text: "See plans", onPress: () => router.push("/paywall" as any) },
                ]);
            } else {
                Alert.alert("Upload failed", e instanceof Error ? e.message : "Please try again.");
            }
        } finally {
            setStarting(false);
        }
    };

    return (
        <Screen padded>
            {/* Header */}
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: Spacing.md }}>
                <IconButton icon="chevron-back" accessibilityLabel="Back" onPress={() => router.back()} />
                <Text style={styles.title}>Confirm your items</Text>
                <View style={{ width: 38 }} />
            </View>

            <StepIndicator step={step} />
            <Text style={styles.sub}>
                Make sure your clothes are clearly visible before we start styling.
            </Text>

            <FlatList
                data={images}
                numColumns={3}
                keyExtractor={(i) => i.id}
                columnWrapperStyle={{ gap: Spacing.sm }}
                contentContainerStyle={{ gap: Spacing.sm, paddingBottom: Spacing.xl, flexGrow: 1 }}
                ListEmptyComponent={
                    <EmptyState
                        icon="images-outline"
                        title="No photos selected"
                        subtitle="Go back and add some photos of your items."
                        actionLabel="Add photos"
                        onAction={() => router.back()}
                    />
                }
                renderItem={({ item }) => (
                    <PreviewCard uri={item.uri} onRemove={() => removeImage(item.id)} />
                )}
            />

            <PrimaryButton
                onPress={startSession}
                loading={starting}
                disabled={!images.length}
                icon="sparkles-outline"
                label={starting ? "Starting your design session…" : `Style ${images.length} item${images.length === 1 ? "" : "s"}`}
            />
        </Screen>
    );
}

const styles = {
    title: {
        flex: 1,
        fontSize: 19,
        fontFamily: Typography.serif,
        fontWeight: "600" as const,
        color: Colors.text,
        textAlign: "center" as const,
    },
    sub: {
        fontSize: 13,
        color: Colors.mid,
        marginBottom: Spacing.md,
        lineHeight: 19,
    },
};
