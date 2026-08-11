import { useOfflineQueueStore } from '@/store/offlineQueue.store';
import NetInfo from '@react-native-community/netinfo';
import { apiClient } from './api.client';

export const uploadService = {
    async uploadAndScan(
        uris: string[],
        vertical: string,
        options: { occasion?: string; occupation?: string; lat?: number; lon?: number } = {},
    ) { 
        const { isConnected } = await NetInfo.fetch();
        if (!isConnected) { 
            await useOfflineQueueStore.getState().enqueue({ uris, vertical, options });
            return { jobId: null, status: 'QUEUED_OFFLINE'};   
        }

const form = new FormData();
form.append('vertical', vertical);
        if (options.occasion) form.append('occasion', options.occasion);
        if (options.occupation) form.append('occupation', options.occupation);
        if (options.lat) form.append('lat', String(options.lat));
        if (options.lon) form.append('lon', String(options.lon));

        for (const uri of uris) { 
            const name = uri.split('/').pop() ?? 'image.jpg';
            form.append('images', { uri, name, type: 'image/jpeg' } as any);
        }

        const { data } = await apiClient.post('/api/scans/upload', form, {
            headers: { 'Content-Type': 'multipart/form-data'},
        });
        return data;

    }
}