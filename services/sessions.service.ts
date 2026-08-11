/**
 * v1 design sessions — guide §8A (the recommended scan entry point).
 *
 * Flow: POST /v1/design-sessions → PUT each presigned URL straight to S3
 * (bypassing the API) → POST /:id/images/complete → poll GET /:id or subscribe
 * over Socket.IO (`subscribe:session`).
 *
 * NOTE: these routes live at the API root (`/v1/...`), NOT under `/api`.
 */
import { apiClient, extractScanQuota, ScanQuota } from "./api.client";
import { ENV } from "@/config/env";
import type {
    CompleteUploadsResponse,
    CreateSessionInput,
    CreateSessionResponse,
    DesignSession,
    PaginatedSessions,
    UploadUrl,
} from "@/types/api";

// ─── Local image descriptor (camera photo or gallery asset) ─────────────────
export type LocalImage = {
    uri: string;
    /** e.g. "image/jpeg" | "image/png" | "image/webp" — inferred from extension if omitted. */
    mimeType?: string | null;
    fileName?: string | null;
    fileSize?: number | null;
};

export function inferMimeType(img: LocalImage): string {
    if (img.mimeType && ENV.ALLOWED_IMAGE_MIME.includes(img.mimeType)) return img.mimeType;
    const ext = (img.fileName ?? img.uri).split("?")[0].split(".").pop()?.toLowerCase();
    if (ext === "png") return "image/png";
    if (ext === "webp") return "image/webp";
    return "image/jpeg";
}

export function validateLocalImages(images: LocalImage[]): void {
    if (!images.length) throw new Error("Add at least one photo.");
    if (images.length > ENV.SCAN_MAX_IMAGES) throw new Error(`Max ${ENV.SCAN_MAX_IMAGES} photos per session.`);
    for (const img of images) {
        const mime = inferMimeType(img);
        if (!ENV.ALLOWED_IMAGE_MIME.includes(mime)) {
            throw new Error("Only JPEG, PNG or WebP images are supported.");
        }
        if (img.fileSize && img.fileSize > ENV.SCAN_MAX_FILE_BYTES) {
            throw new Error("One of the photos is over 15 MB — try a smaller crop.");
        }
    }
}

// ─── REST ────────────────────────────────────────────────────────────────────
let lastScanQuota: ScanQuota = null;
/** Most recent X-Scan-* header snapshot (also emitted on 429 responses). */
export const getLastScanQuota = () => lastScanQuota;

export const sessionService = {
    /** Step 1 — create session + receive presigned PUT upload plan. */
    async create(input: CreateSessionInput): Promise<CreateSessionResponse> {
        const { data, headers } = await apiClient.post<CreateSessionResponse>(
            "/v1/design-sessions",
            {
                vertical: input.vertical,
                ...(input.occasion ? { occasion: input.occasion } : {}),
                ...(input.culture ? { culture: input.culture } : {}),
                ...(input.climate ? { climate: input.climate } : {}),
                ...(input.preferences ? { preferences: input.preferences } : {}),
                imageCount: input.imageCount,
            },
            { timeout: ENV.UPLOAD_TIMEOUT },
        );
        lastScanQuota = extractScanQuota(headers);
        return data;
    },

    /**
     * Step 3 — verify uploads + enqueue the AI pipeline.
     * Throws ApiError with codes: image not uploaded / invalid mime / already queued / SCAN_LIMIT_REACHED.
     */
    async completeUploads(sessionId: string, imageIds: string[]): Promise<CompleteUploadsResponse> {
        const { data, headers } = await apiClient.post<CompleteUploadsResponse>(
            `/v1/design-sessions/${sessionId}/images/complete`,
            { image_ids: imageIds },
            { timeout: ENV.UPLOAD_TIMEOUT },
        );
        lastScanQuota = extractScanQuota(headers) ?? lastScanQuota;
        return data;
    },

    /** Step 4 polling fallback — prefer WebSocket `subscribe:session` when connected. */
    async get(sessionId: string): Promise<DesignSession> {
        const { data } = await apiClient.get<DesignSession>(`/v1/design-sessions/${sessionId}`);
        return data;
    },

    async list(page = 1, limit = 20): Promise<PaginatedSessions> {
        const { data } = await apiClient.get<PaginatedSessions>("/v1/design-sessions", {
            params: { page, limit },
        });
        return data;
    },

    async cancel(sessionId: string): Promise<{ session_id: string; status: "cancelled" }> {
        const { data } = await apiClient.delete(`/v1/design-sessions/${sessionId}`);
        return data;
    },
};

/**
 * Step 2 — PUT one image directly to its presigned S3 URL.
 * Goes client → S3; never send Authorization or X-Request-Id headers here.
 */
export async function uploadImageToS3(
    upload: UploadUrl,
    image: LocalImage,
    onProgress?: (sentFraction: number) => void,
): Promise<void> {
    const mime = inferMimeType(image);
    const body = await (await fetch(image.uri)).blob();

    await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", upload.upload_url, true);
        xhr.setRequestHeader("Content-Type", mime); // must match the presigned ContentType
        if (onProgress) {
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable && e.total > 0) onProgress(Math.min(1, e.loaded / e.total));
            };
        }
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(`S3 upload failed (${xhr.status}) — the upload link may have expired.`));
        };
        xhr.onerror = () => reject(new Error("S3 upload failed — check your connection."));
        xhr.ontimeout = () => reject(new Error("S3 upload timed out."));
        xhr.timeout = ENV.UPLOAD_TIMEOUT;
        xhr.send(body);
    });
}
