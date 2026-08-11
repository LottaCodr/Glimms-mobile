/**
 * Realtime legacy design-job tracking — guide §9.
 * Prefers Socket.IO (`subscribe:job`); falls back to polling GET /api/designs/jobs/:id
 * every 3s when the socket can't connect. Reconnects on app foreground.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { designService } from "@/services/design.service";
import { subscribeToJob, wsService } from "@/services/websocket.service";
import type { JobProgress, JobStatus, JobComplete } from "@/types/api";

export const STEP_LABELS: Record<string, string> = {
    detecting: "Detecting items…",
    extracting: "Analysing colours & textures…",
    embedding: "Building your style profile…",
    permutating: "Exploring combinations…",
    reasoning: "AI stylist is thinking…",
    compositing: "Creating mockups…",
};

export type DesignJobState = {
    status: JobStatus | null;
    step: string | null;
    progress: number; // 0..100
    itemCount: number | null;
    result: JobComplete | null;
    error: string | null;
};

export function useDesignJob(jobId: string | null) {
    const [state, setState] = useState<DesignJobState>({
        status: null,
        step: null,
        progress: 0,
        itemCount: null,
        result: null,
        error: null,
    });
    const doneRef = useRef(false);

    const applyPoll = useCallback(async () => {
        if (!jobId || doneRef.current) return;
        try {
            const job = await designService.getJob(jobId);
            setState((s) => ({
                ...s,
                status: job.status,
                result: job.result as JobComplete | null,
                error: job.errorMsg,
                progress: job.status === "completed" ? 100 : s.progress,
            }));
            if (job.status === "completed" || job.status === "failed") doneRef.current = true;
        } catch {
            /* transient poll failures are fine */
        }
    }, [jobId]);

    useEffect(() => {
        if (!jobId) return;
        let unsubscribe: (() => void) | null = null;
        let poll: ReturnType<typeof setInterval> | null = null;
        let cancelled = false;

        const startPolling = () => {
            if (poll || doneRef.current) return;
            poll = setInterval(() => void applyPoll(), 3000);
            void applyPoll();
        };
        const stopPolling = () => {
            if (poll) clearInterval(poll);
            poll = null;
        };

        (async () => {
            try {
                unsubscribe = await subscribeToJob(jobId, {
                    onUpdate: (d) => {
                        const p = d as JobProgress;
                        setState((s) => ({
                            ...s,
                            status: "processing",
                            step: p.step,
                            progress: p.progress ?? s.progress,
                            itemCount: p.itemCount ?? s.itemCount,
                        }));
                    },
                    onComplete: (result) => {
                        doneRef.current = true;
                        stopPolling();
                        setState((s) => ({ ...s, status: "completed", progress: 100, result }));
                    },
                    onFailed: ({ error }) => {
                        doneRef.current = true;
                        stopPolling();
                        setState((s) => ({ ...s, status: "failed", error }));
                    },
                    onError: (e) => setState((s) => ({ ...s, error: e?.message ?? s.error })),
                });
                if (cancelled) return;
                // Still no initial status? Fetch once so late subscribers catch up.
                void applyPoll();
            } catch {
                if (!cancelled) startPolling(); // WS unavailable → polling fallback
            }
        })();

        const appSub = AppState.addEventListener("change", (s) => {
            if (s === "active" && !doneRef.current && !wsService.isConnected()) {
                void applyPoll();
            }
        });

        return () => {
            cancelled = true;
            stopPolling();
            appSub.remove();
            unsubscribe?.();
        };
    }, [jobId, applyPoll]);

    return state;
}
