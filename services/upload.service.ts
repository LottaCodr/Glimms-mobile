/**
 * Upload orchestration — v1 design-sessions (guide §8A).
 *
 * `startDesignSession` runs the full client-side pipeline:
 *   validate → create session → PUT each image to S3 → complete → enqueue.
 * Returns the session_id so callers can navigate to the realtime progress screen.
 *
 * When offline, the request is queued (AsyncStorage) and flushed on reconnect.
 */
import NetInfo from "@react-native-community/netinfo";
import { useOfflineQueueStore } from "@/store/offlineQueue.store";
import {
    LocalImage,
    sessionService,
    uploadImageToS3,
    validateLocalImages,
} from "./sessions.service";
import type { CreateSessionInput } from "@/types/api";

export type SessionStartResult =
    | { kind: "session"; sessionId: string }
    | { kind: "queued_offline" };

export type SessionStartOptions = Omit<CreateSessionInput, "vertical" | "imageCount"> & {
    /** Per-image S3 progress, 0..1. Called with (index, fraction). */
    onImageProgress?: (index: number, fraction: number) => void;
};

export const uploadService = {
    async startDesignSession(
        vertical: CreateSessionInput["vertical"],
        images: LocalImage[],
        options: SessionStartOptions = {},
    ): Promise<SessionStartResult> {
        validateLocalImages(images);

        const { isConnected } = await NetInfo.fetch();
        if (isConnected === false) {
            await useOfflineQueueStore.getState().enqueue({
                vertical,
                uris: images.map((i) => i.uri),
                options: {
                    occasion: options.occasion,
                    culture: options.culture ?? undefined,
                    climate: options.climate,
                    preferences: options.preferences,
                },
            });
            return { kind: "queued_offline" };
        }

        // 1) Create session + upload plan
        const session = await sessionService.create({
            vertical,
            occasion: options.occasion,
            culture: options.culture ?? undefined,
            climate: options.climate,
            preferences: options.preferences,
            imageCount: images.length,
        });

        // 2) Upload bytes directly to S3 (presigned PUT, no auth header)
        await Promise.all(
            session.upload_urls.map((upload, i) =>
                uploadImageToS3(upload, images[i], (f) => options.onImageProgress?.(i, f)),
            ),
        );

        // 3) Verify + enqueue the design pipeline
        await sessionService.completeUploads(
            session.session_id,
            session.upload_urls.map((u) => u.image_id),
        );

        return { kind: "session", sessionId: session.session_id };
    },

    /**
     * Back-compat for the offline queue — re-runs a queued entry once online.
     * Queued entries only persisted URIs, so mime is inferred from the path.
     */
    async uploadQueued(
        uris: string[],
        vertical: CreateSessionInput["vertical"],
        options: Omit<SessionStartOptions, "onImageProgress"> = {},
    ): Promise<SessionStartResult> {
        return this.startDesignSession(vertical, uris.map((uri) => ({ uri })), options);
    },
};
