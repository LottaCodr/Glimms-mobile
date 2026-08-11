/**
 * Auth state — guide §3/§16.1.
 *
 * Tokens live in expo-secure-store (never AsyncStorage). The axios client
 * refreshes/rotates them; this store owns the user profile and session
 * lifecycle. `onAuthFailure` (fired by the API client when a refresh fails)
 * signs the user out so the root layout guard can redirect to onboarding.
 */
import { create } from "zustand";
import {
    onAuthFailure,
    refreshTokens,
    tokenStore,
} from "@/services/api.client";
import * as authApi from "@/services/auth.services";
import { notificationService } from "@/services/notifications.service";
import { analyticsService } from "@/services/analytics.service";
import { wsService } from "@/services/websocket.service";
import type { User } from "@/types/api";

interface AuthState {
    user: User | null;
    /** True while the initial session is being restored. */
    isLoading: boolean;
    isAuthenticated: boolean;
    /** FCM/APNs token registered for this device (for logout cleanup). */
    pushToken: string | null;

    hydrateAuth: () => Promise<void>;
    login: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string, name?: string) => Promise<void>;
    setUser: (user: User | null) => void;
    refreshUser: () => Promise<void>;
    logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => {
    // Sign out locally whenever the API client gives up on refresh.
    onAuthFailure(() => {
        wsService.disconnect();
        set({ user: null, isAuthenticated: false });
    });

    async function afterTokens(clearPush = true) {
        const user = await authApi.fetchMe();
        set({ user, isAuthenticated: true, isLoading: false });
        if (clearPush) {
            // Register for design-ready pushes once authenticated (§13).
            notificationService
                .registerDeviceToken()
                .then((token) => set({ pushToken: token }))
                .catch(() => {});
        }
    }

    return {
        user: null,
        isLoading: true,
        isAuthenticated: false,
        pushToken: null,

        /** Splash/boot: restore session, refresh fallback, then route (guide §16.1). */
        hydrateAuth: async () => {
            try {
                const access = await tokenStore.getAccessToken();
                if (!access) {
                    set({ isLoading: false });
                    return;
                }
                // Proactive refresh when the access token is past its expiry window.
                if (await tokenStore.isAccessTokenStale()) {
                    await refreshTokens().catch(() => null);
                }
                const user = await authApi.fetchMe();
                set({ user, isAuthenticated: true, isLoading: false });
                // Sessions restored on app restart still need a push registration (§13).
                notificationService
                    .registerDeviceToken()
                    .then((token) => set({ pushToken: token }))
                    .catch(() => {});
            } catch {
                await tokenStore.clear();
                set({ user: null, isAuthenticated: false, isLoading: false });
            }
        },

        login: async (email, password) => {
            const tokens = await authApi.login({ email, password });
            await tokenStore.save(tokens);
            await afterTokens();
            analyticsService.track("login", { method: "email" });
        },

        register: async (email, password, name) => {
            const tokens = await authApi.register({ email, password, name });
            await tokenStore.save(tokens);
            await afterTokens();
            analyticsService.track("register", { method: "email" });
        },

        setUser: (user) => set({ user, isAuthenticated: !!user }),

        refreshUser: async () => {
            const user = await authApi.fetchMe();
            set({ user });
        },

        logout: async () => {
            const { pushToken } = get();
            await Promise.all([
                authApi.logout(),
                notificationService.removeDeviceToken(pushToken),
            ]);
            wsService.disconnect();
            await tokenStore.clear();
            set({ user: null, isAuthenticated: false, pushToken: null });
        },
    };
});
