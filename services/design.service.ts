/**
 * Designs — legacy pipeline jobs + saved designs (guide §9/§10/§12 listing).
 */
import { apiClient } from "./api.client";
import {
    ApiErrorPayload,
    DesignJob,
    GeneratedDesign,
    PaginatedDesigns,
    PaginatedJobs,
    SavedDesign,
    SaveDesignInput,
} from "@/types/api";

export const designService = {
    // ─── Jobs (legacy scan pipeline) ──────────────────────────────────────────
    async listJobs(page = 1, limit = 20): Promise<PaginatedJobs> {
        const { data } = await apiClient.get<PaginatedJobs>("/api/designs/jobs", {
            params: { page, limit },
        });
        return data;
    },

    /** Polling fallback for when the socket is unavailable (every ~3s until final). */
    async getJob(jobId: string): Promise<DesignJob> {
        const { data } = await apiClient.get<DesignJob>(`/api/designs/jobs/${jobId}`);
        return data;
    },

    // ─── Saved designs ────────────────────────────────────────────────────────
    async listSaved(page = 1, limit = 20, favorite?: boolean): Promise<PaginatedDesigns> {
        const { data } = await apiClient.get<PaginatedDesigns>("/api/designs/saved", {
            params: { page, limit, ...(favorite !== undefined ? { favorite } : {}) },
        });
        return data;
    },

    async save(input: SaveDesignInput): Promise<SavedDesign> {
        const { data } = await apiClient.post<SavedDesign>("/api/designs/saved", input);
        return data;
    },

    /** Save a generated design card straight from a job/session result. */
    async saveGenerated(jobOrSessionId: string, design: GeneratedDesign): Promise<SavedDesign> {
        return this.save({
            jobId: jobOrSessionId,
            title: design.title ?? null,
            items: design.items ?? [],
            mockupUrl: design.mockupUrl ?? design.mockup_url ?? null,
            explanation: design.explanation ?? null,
            tips: design.tips ?? [],
            score: design.score ?? 0,
        });
    },

    /** Toggles isFavorite — pair with an optimistic update in the UI. */
    async toggleFavorite(savedDesignId: string): Promise<SavedDesign> {
        const { data } = await apiClient.patch<SavedDesign>(
            `/api/designs/saved/${savedDesignId}/favorite`,
        );
        return data;
    },

    async remove(savedDesignId: string): Promise<void> {
        await apiClient.delete(`/api/designs/saved/${savedDesignId}`);
    },
};

export type { ApiErrorPayload };
