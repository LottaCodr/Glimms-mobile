/**
 * Realtime v1 design-session tracking — the recommended path (guide §8A/§3.4).
 * Subscribes via Socket.IO (`subscribe:session`, listens to `session:update`
 * plus `job:*` compatibility events) and falls back to polling
 * GET /v1/design-sessions/:id every 2s while the socket is down.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { sessionService } from "@/services/sessions.service";
import { subscribeToSession, wsService } from "@/services/websocket.service";
import type { DesignSession, GeneratedDesign, SessionStatus } from "@/types/api";

export const SESSION_STEP_LABELS: Record<string, string> = {
    created: "Preparing your session…",
    uploading: "Uploading photos…",
    queued: "Queued for the stylist…",
    quality_review: "Checking photo quality…",
    detecting: "Detecting items…",
    extracting: "Extracting colours & textures…",
    permuting: "Exploring combinations…",
    embedding: "Building your style profile…",
    reasoning: "AI stylist is thinking…",
    composing: "Creating your looks…",
    completed: "Done",
};

const TERMINAL: SessionStatus[] = ["completed", "failed", "cancelled"];

export type DesignSessionState = {
    status: SessionStatus | null;
    progress: number; // 0..100
    steps: DesignSession["steps"];
    designs: GeneratedDesign[];
    warnings: string[];
    error: string | null;
    label: string;
    isDone: boolean;
};

export function useDesignSession(sessionId: string | null) {
    const [state, setState] = useState<DesignSessionState>({
        status: null,
        progress: 0,
        steps: {},
        designs: [],
        warnings: [],
        error: null,
        label: "Starting…",
        isDone: false,
    });
    const doneRef = useRef(false);

    const applySession = useCallback((s: DesignSession) => {
        setState({
            status: s.status,
            progress: s.status === "completed" ? 100 : (s.progress ?? 0),
            steps: s.steps ?? {},
            designs: s.designs ?? [],
            warnings: s.warnings ?? [],
            error: s.error?.message ?? null,
            label: SESSION_STEP_LABELS[s.status] ?? s.status,
            isDone: TERMINAL.includes(s.status),
        });
        if (TERMINAL.includes(s.status)) doneRef.current = true;
    }, []);

    const poll = useCallback(
        async (force = false) => {
            if (!sessionId || (!force && doneRef.current)) return;
            try {
                applySession(await sessionService.get(sessionId));
            } catch {
                /* transient */
            }
        },
        [sessionId, applySession],
    );

    useEffect(() => {
        if (!sessionId) return;
        let unsubscribe: (() => void) | null = null;
        let pollTimer: ReturnType<typeof setInterval> | null = null;
        let cancelled = false;

        const startPolling = () => {
            if (pollTimer || doneRef.current) return;
            pollTimer = setInterval(() => void poll(), 2000);
            void poll();
        };
        const stopPolling = () => {
            if (pollTimer) clearInterval(pollTimer);
            pollTimer = null;
        };
        const terminalGuard = (status?: string) => {
            if (status && TERMINAL.includes(status as SessionStatus)) {
                doneRef.current = true;
                stopPolling();
                // session:update carries status/progress but not designs — pull the
                // final payload once so results render even without job:complete.
                void poll(true);
            }
        };

        (async () => {
            try {
                unsubscribe = await subscribeToSession(sessionId, {
                    onSessionUpdate: (d) => {
                        setState((s) => ({
                            ...s,
                            status: (d.status as SessionStatus) ?? s.status,
                            progress: d.status === "completed" ? 100 : (d.progress ?? s.progress),
                            steps: d.steps ?? s.steps,
                            warnings: d.warnings ?? s.warnings,
                            label: SESSION_STEP_LABELS[d.status] ?? s.label,
                        }));
                        terminalGuard(d.status);
                    },
                    // job:complete is emitted for both legacy jobs and v1 sessions (§9).
                    onComplete: (result) => {
                        doneRef.current = true;
                        stopPolling();
                        setState((s) => ({
                            ...s,
                            status: "completed",
                            progress: 100,
                            designs: result?.designs ?? s.designs,
                            label: SESSION_STEP_LABELS.completed,
                            isDone: true,
                        }));
                    },
                    onFailed: ({ error }) => {
                        doneRef.current = true;
                        stopPolling();
                        setState((s) => ({ ...s, status: "failed", error, isDone: true }));
                    },
                });
                if (cancelled) return;
                void poll(); // catch up on anything emitted before we joined
            } catch {
                if (!cancelled) startPolling();
            }
        })();

        const appSub = AppState.addEventListener("change", (s) => {
            if (s === "active" && !doneRef.current && !wsService.isConnected()) void poll();
        });

        return () => {
            cancelled = true;
            stopPolling();
            appSub.remove();
            unsubscribe?.();
        };
    }, [sessionId, poll]);

    return state;
}
