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
};

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
            set({ items: raw ? (JSON.parse(raw) as QueuedScan[]) : [], hydrated: true });
        } catch {
            set({ hydrated: true });
        }
    },

    enqueue: async (item) => {
        const entry: QueuedScan = { ...item, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
        const updated = [...get().items, entry];
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        set({ items: updated });
    },

    flush: async () => {
        if (flushing) return;
        flushing = true;
        try {
            for (const item of get().items) {
                try {
                    await uploadService.uploadQueued(item.uris, item.vertical, item.options);
                    const remaining = get().items.filter((i) => i.id !== item.id);
                    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
                    set({ items: remaining });
                } catch {
                    // leave failed items in the queue for the next reconnect
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
