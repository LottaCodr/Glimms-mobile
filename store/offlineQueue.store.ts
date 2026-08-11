import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { uploadService} from '@/services/upload.service';

interface QueueItem { id: string; uris: string[]; vertical: string; options: any}

interface QueueState {
    items: QueueItem[];
    enqueue: (item: Omit<QueueItem, 'id'>) => Promise<void>;
    flush: () => Promise<void>;
}

export const useOfflineQueueStore = create<QueueState>(( set, get) => ({
    items: [],

    enqueue: async (item) => {
        const entry = { ...item, id: `${Date.now()}` };
        const updated = [...get().items, entry];
        await AsyncStorage.setItem('glimms:offline_queue', JSON.stringify(updated));
        set({ items: updated });
    },

    flush: async() => {
    for (const item of get().items) {
        try {
            await uploadService.uploadAndScan(item.uris, item.vertical, item.options);
            const remaining = get().items.filter(i => i.id !== item.id);
            await AsyncStorage.setItem('glimms:offline_queue', JSON.stringify(remaining));
            set({ items: remaining });
        } catch { }
        }
    }
}));