/**
 * Analytics — guide §14.
 * `track` is fire-and-forget (optionalAuth, anonymous allowed) so it must never
 * block or break a flow. `me` powers the dashboard pills.
 */
import { apiClient } from "./api.client";
import type { AnalyticsSummary } from "@/types/api";

export const analyticsService = {
    /** Buffers into Redis server-side; swallow failures — analytics is best-effort. */
    track(event: string, properties?: Record<string, unknown>): void {
        apiClient
            .post("/api/analytics/track", { event, ...(properties ? { properties } : {}) })
            .catch(() => {});
    },

    async me(): Promise<AnalyticsSummary> {
        const { data } = await apiClient.get<AnalyticsSummary>("/api/analytics/me");
        return data;
    },
};
