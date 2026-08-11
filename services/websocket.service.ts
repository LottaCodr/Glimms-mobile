/**
 * Socket.IO service — guide §9.
 *
 * - Same host as the API; shared HTTP server.
 * - Auth via `handshake.auth.token` (fresh access token per connect attempt).
 * - On "Invalid or expired token" connect_error: refresh once, then reconnect.
 * - Rooms: legacy jobs (`job:<id>`, subscribe:job) and v1 sessions
 *   (`session:<id>` via subscribe:session / subscribe:design-session).
 */
import { io, Socket } from "socket.io-client";
import { tokenStore, refreshTokens, toApiError } from "./api.client";
import { ENV } from "@/config/env";

let socket: Socket | null = null;
let connecting: Promise<Socket> | null = null;
let refreshOnAuthErrorDone = false;

/**
 * Server-side rooms are connection-scoped: after a reconnect the client must
 * re-emit subscribe. Track active rooms here and re-join them on `connect`.
 */
const activeRooms = new Map<string, "job" | "session">();

async function buildSocket(): Promise<Socket> {
    const token = await tokenStore.getAccessToken();
    const s = io(ENV.WS_URL, {
        auth: { token },
        transports: ["websocket", "polling"],
        timeout: 10_000,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 10,
    });

    // Re-subscribe room memberships after every (re)connect.
    s.on("connect", () => {
        activeRooms.forEach((kind, id) => {
            s.emit(kind === "session" ? "subscribe:session" : "subscribe:job", id);
        });
    });

    return s;
}

export const wsService = {
    /** Singleton connection. Concurrent callers share one connect. */
    async connect(): Promise<Socket> {
        if (socket?.connected) return socket;
        if (connecting) return connecting;

        connecting = (async () => {
            if (!socket) {
                socket = await buildSocket();
            } else {
                // Reuse the instance so existing event listeners survive;
                // refresh the handshake token for this (re)connect.
                const token = await tokenStore.getAccessToken();
                socket.auth = { token: token ?? undefined } as any;
            }
            socket.connect();

            await new Promise<void>((resolve, reject) => {
                const s = socket!;
                const onConnect = () => {
                    cleanup();
                    resolve();
                };
                const onError = async (err: Error) => {
                    // Token expired between REST call and handshake → refresh once.
                    if (
                        /token|auth/i.test(err.message ?? "") &&
                        !refreshOnAuthErrorDone
                    ) {
                        refreshOnAuthErrorDone = true;
                        try {
                            await refreshTokens();
                            const fresh = await tokenStore.getAccessToken();
                            s.auth = { token: fresh ?? undefined } as any;
                            s.connect();
                            return; // keep listeners alive for the retry
                        } catch (e) {
                            cleanup();
                            reject(toApiError(e));
                            return;
                        }
                    }
                    cleanup();
                    reject(err);
                };
                const cleanup = () => {
                    s.off("connect", onConnect);
                    s.off("connect_error", onError as any);
                };
                s.once("connect", onConnect);
                s.on("connect_error", onError as any);
            });

            refreshOnAuthErrorDone = false;
            return socket!;
        })();

        try {
            return await connecting;
        } finally {
            connecting = null;
        }
    },

    getSocket: () => socket,
    isConnected: () => !!socket?.connected,

    disconnect() {
        activeRooms.clear();
        socket?.removeAllListeners();
        socket?.disconnect();
        socket = null;
    },
};

// ─── Subscription helper ─────────────────────────────────────────────────────
export type JobSocketHandlers = {
    /** Legacy job progress: { status, step, progress, itemCount? } */
    onUpdate?: (data: any) => void;
    /** Final result (also emitted with empty designs when nothing was detected). */
    onComplete?: (result: any) => void;
    onFailed?: (payload: { error: string }) => void;
    /** v1 session richer updates: { session_id, status, progress, steps, warnings } */
    onSessionUpdate?: (data: any) => void;
    onError?: (err: { message: string }) => void;
};

/**
 * Subscribe to a legacy design-job room (`subscribe:job`).
 * Returns an unsubscribe function.
 */
export async function subscribeToJob(jobId: string, handlers: JobSocketHandlers): Promise<() => void> {
    const s = await wsService.connect();
    const onSubscribed = (d: any) => d?.jobId === jobId && undefined;

    activeRooms.set(jobId, "job");
    s.emit("subscribe:job", jobId);
    s.on("subscribed", onSubscribed);
    if (handlers.onUpdate) s.on("job:update", handlers.onUpdate);
    if (handlers.onComplete) s.on("job:complete", handlers.onComplete);
    if (handlers.onFailed) s.on("job:failed", handlers.onFailed);
    if (handlers.onError) s.on("error", handlers.onError);

    return () => {
        activeRooms.delete(jobId);
        s.emit("unsubscribe:job", jobId);
        s.off("subscribed", onSubscribed);
        if (handlers.onUpdate) s.off("job:update", handlers.onUpdate);
        if (handlers.onComplete) s.off("job:complete", handlers.onComplete);
        if (handlers.onFailed) s.off("job:failed", handlers.onFailed);
        if (handlers.onError) s.off("error", handlers.onError);
    };
}

/**
 * Subscribe to a v1 design-session room (`subscribe:session`, falling back to
 * the `subscribe:design-session` alias). Returns an unsubscribe function.
 */
export async function subscribeToSession(
    sessionId: string,
    handlers: JobSocketHandlers,
): Promise<() => void> {
    const s = await wsService.connect();

    activeRooms.set(sessionId, "session");
    s.emit("subscribe:session", sessionId);
    if (handlers.onSessionUpdate) s.on("session:update", handlers.onSessionUpdate);
    if (handlers.onUpdate) s.on("job:update", handlers.onUpdate);
    if (handlers.onComplete) s.on("job:complete", handlers.onComplete);
    if (handlers.onFailed) s.on("job:failed", handlers.onFailed);
    if (handlers.onError) s.on("error", handlers.onError);

    return () => {
        activeRooms.delete(sessionId);
        s.emit("unsubscribe:session", sessionId);
        if (handlers.onSessionUpdate) s.off("session:update", handlers.onSessionUpdate);
        if (handlers.onUpdate) s.off("job:update", handlers.onUpdate);
        if (handlers.onComplete) s.off("job:complete", handlers.onComplete);
        if (handlers.onFailed) s.off("job:failed", handlers.onFailed);
        if (handlers.onError) s.off("error", handlers.onError);
    };
}
