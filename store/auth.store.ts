import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { apiClient } from '@/services/api.client';

interface User { sub: string; email: string; name?: string; tier: 'free' | 'premium' | 'pro'}

interface AuthState {
    user: User | null;
    isLoading: boolean;
    hydrateAuth: () => Promise<void>;
    setSession: (accessToken: string, refreshToken: string) => Promise<void>;
    logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set)=> ({
    user: null,
    isLoading: true,

    // hydrateAuth does the same as loadSession
    hydrateAuth: async () => {
        try{
            const token = await SecureStore.getItemAsync('glimms_access_token');
            if (token) {
                apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
                const { data } = await apiClient.get('/api/users/me');
                set({ user: data, isLoading: false });
            } else {
                set({ isLoading: false });
            }
        } catch {
            await SecureStore.deleteItemAsync('glimms_access_token');
            set({ isLoading: false });
        }
    },

    setSession: async (accessToken, refreshToken) => {
        await SecureStore.setItemAsync('glimms_access_token', accessToken);
        await SecureStore.setItemAsync('glimms_refresh_token', refreshToken);
        apiClient.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
        const { data } = await apiClient.get('/api/users/me');
        set({ user: data })
    },

    logout: async () => {
        const refresh = await SecureStore.getItemAsync('glimms_refresh_token');
        if (refresh) await apiClient.post('ap/auth/logout', { refreshToken: refresh}).catch(() => {});
        await SecureStore.deleteItemAsync('glimms_access_token');
        await SecureStore.deleteItemAsync('glimms_refresh_token');
        delete apiClient.defaults.headers.common['Authorization'];
        set({ user: null });
    }

}));