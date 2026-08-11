/**
 * Push notifications — guide §13.
 *
 * The backend sends via firebase-admin, which expects **native FCM/APNs tokens**
 * (Notifications.getDevicePushTokenAsync), NOT Expo push tokens. Native tokens
 * require a dev build / production build — Expo Go (Android, SDK 53+) cannot
 * produce them, so registration no-ops gracefully there.
 */
import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { apiClient } from "./api.client";
import type { DevicePlatform } from "@/types/api";

/** Set once at app start: present foreground alerts instead of swallowing them. */
export function configureNotificationHandler(): void {
    Notifications.setNotificationHandler({
        handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: false,
            shouldSetBadge: false,
        }),
    });
}

function currentPlatform(): DevicePlatform {
    return (Platform.OS === "ios" ? "ios" : "android") as DevicePlatform;
}

export const notificationService = {
    configureNotificationHandler,

    /**
     * Request permission → fetch native FCM/APNs token → POST to the backend.
     * Returns the token, or null when unavailable (simulator / denied / Expo Go).
     */
    async registerDeviceToken(): Promise<string | null> {
        if (!Device.isDevice) return null;

        const perms = await Notifications.getPermissionsAsync();
        let status = perms.status;
        if (status !== "granted") {
            const req = await Notifications.requestPermissionsAsync();
            status = req.status;
        }
        if (status !== "granted") return null;

        let token: string;
        try {
            const native = await Notifications.getDevicePushTokenAsync();
            token = String(native.data);
        } catch {
            // Expo Go or missing google-services config — skip silently.
            return null;
        }
        if (!token) return null;

        await apiClient.post("/api/notifications/device-token", {
            token,
            platform: currentPlatform(),
        });
        return token;
    },

    /** Call on logout (§13) — takes the same token that was registered. */
    async removeDeviceToken(token: string | null): Promise<void> {
        if (!token) return;
        try {
            await apiClient.delete("/api/notifications/device-token", {
                data: { token, platform: currentPlatform() },
            });
        } catch {
            /* best-effort */
        }
    },

    /**
     * Subscribe to notification taps. Pipeline completion pushes carry
     * `data: { jobId, screen: "designs" }` — `onNavigate` should deep-link.
     */
    addResponseListener(onNavigate: (data: { jobId?: string; screen?: string }) => void) {
        const sub = Notifications.addNotificationResponseReceivedListener((response) => {
            const data = (response.notification.request.content.data ?? {}) as {
                jobId?: string;
                screen?: string;
            };
            onNavigate(data);
        });
        return () => sub.remove();
    },
};
