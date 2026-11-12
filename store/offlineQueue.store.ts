import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import { uploadService } from "@/services/upload.service";

const STORAGE_KEY = "glimms:offline_queue";

export type QueuedScan = {
    id: string;
    uris: string[];
    vertical: "wardrobe" | "room" | "garden";
    options: {
        occasion?: string;
        culture?: string;
        climate?: { temperature_c: number; humidity?: number };
        preferences?: { styles?: string[]; excluded_labels?: string[]; coverage?: string };
    };
    /** Upload attempts that reached the server and failed. */
    attempts?: number;
};

/** After this many failed uploads a scan is dropped instead of retried forever. */
export const MAX_ATTEMPTS = 5;
/** Queued photos live in the app cache, which the OS may clear; cap the backlog. */
export const MAX_QUEUED = 20;

/**
 * Whether trying again later could work. Being offline or a server hiccup can;
 * a request the server understood and refused (bad file, over quota) cannot.
 */
function isRetryable(error: unknown): boolean {
    const status = (error as { status?: number } | null)?.status;
    if (typeof status !== "number" || status === 0) return true; // never reached the server
    return status === 401 || status === 408 || status === 429 || status >= 500;
}

interface QueueState {
    items: QueuedScan[];
    hydrated: boolean;
    hydrate: () => Promise<void>;
    enqueue: (item: Omit<QueuedScan, "id">) => Promise<void>;
    /** Re-upload everything once connectivity returns. */
    flush: () => Promise<void>;
    /** Start listening to NetInfo and auto-flush on reconnect. Call once at app start. */
    startAutoFlush: () => () => void;
}

let flushing = false;

export const useOfflineQueueStore = create<QueueState>((set, get) => ({
    items: [],
    hydrated: false,

    hydrate: async () => {
        if (get().hydrated) return;
        try {
            const raw = await AsyncStorage.getItem(STORAGE_KEY);
            const parsed: unknown = raw ? JSON.parse(raw) : [];
            // Tolerate anything a previous version (or a corrupted write) left behind.
            const items = Array.isArray(parsed)
                ? (parsed as QueuedScan[]).filter((i) => i && typeof i.id === "string" && Array.isArray(i.uris) && i.uris.length > 0)
                : [];
            set({ items, hydrated: true });
        } catch {
            set({ hydrated: true });
        }
    },

    enqueue: async (item) => {
        const entry: QueuedScan = { ...item, attempts: 0, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
        // Oldest scans make way when the backlog is full.
        const updated = [...get().items, entry].slice(-MAX_QUEUED);
        set({ items: updated });
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    },

    flush: async () => {
        if (flushing) return;
        flushing = true;
        const persist = async (items: QueuedScan[]) => {
            set({ items });
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items)).catch(() => {});
        };
        try {
            for (const item of [...get().items]) {
                try {
                    await uploadService.uploadQueued(item.uris, item.vertical, item.options);
                    await persist(get().items.filter((i) => i.id !== item.id));
                } catch (error) {
                    const reachedServer = !(error as { isNetworkError?: boolean } | null)?.isNetworkError
                        && typeof (error as { status?: number } | null)?.status === "number"
                        && (error as { status: number }).status !== 0;
                    if (!reachedServer) break; // offline again: keep everything, stop for now

                    const attempts = (item.attempts ?? 0) + 1;
                    const giveUp = !isRetryable(error) || attempts >= MAX_ATTEMPTS;
                    await persist(
                        giveUp
                            ? get().items.filter((i) => i.id !== item.id)
                            : get().items.map((i) => (i.id === item.id ? { ...i, attempts } : i)),
                    );
                }
            }
        } finally {
            flushing = false;
        }
    },

    startAutoFlush: () => {
        const sub = NetInfo.addEventListener((state: NetInfoState) => {
            if (state.isConnected && get().items.length > 0) {
                void get().flush();
            }
        });
        return () => sub();
    },
}));
