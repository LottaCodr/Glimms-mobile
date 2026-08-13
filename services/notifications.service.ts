/**
 * Push notifications — guide §13.
 *
 * The backend sends via firebase-admin, which expects **native FCM/APNs tokens**
 * (Notifications.getDevicePushTokenAsync), NOT Expo push tokens. Native tokens
 * require a dev build / production build.
 *
 * IMPORTANT (SDK 53+): `expo-notifications` throws on load in **Expo Go on
 * Android** because remote-notification support was removed from that client.
 * A top-level `import * as Notifications from "expo-notifications"` therefore
 * blows up the whole module graph: every route that transitively imports this
 * file evaluates to `undefined`, which surfaces as
 *   "Route ./x.tsx is missing the required default export"
 * followed by
 *   "TypeError: Cannot read property 'ErrorBoundary' of undefined".
 *
 * So the native module is loaded **lazily and defensively** here. In Expo Go on
 * Android everything below degrades to a no-op and the app boots normally; in a
 * dev/production build the real implementation is used.
 */
import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Device from "expo-device";
import { apiClient } from "./api.client";
import type { DevicePlatform } from "@/types/api";

type NotificationsModule = typeof import("expo-notifications");

/**
 * Expo Go reports `storeClient`; dev builds and standalone apps report
 * `bare`/`standalone`. `appOwnership === "expo"` is the legacy fallback.
 */
export const isExpoGo =
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
    (Constants as any).appOwnership === "expo";

/** Remote push is unavailable in Expo Go on Android (SDK 53+). */
export const pushSupported = !(isExpoGo && Platform.OS === "android");

let cached: NotificationsModule | null | undefined;

/** Require `expo-notifications` at most once, swallowing the Expo Go throw. */
function loadNotifications(): NotificationsModule | null {
    if (cached !== undefined) return cached;
    if (!pushSupported) {
        cached = null;
        return cached;
    }
    try {
        // Deliberately `require` (not a static import) so module evaluation
        // failures stay contained inside this try/catch.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        cached = require("expo-notifications") as NotificationsModule;
    } catch (err) {
        if (__DEV__) {
            console.warn("[notifications] expo-notifications unavailable — push disabled.", err);
        }
        cached = null;
    }
    return cached;
}

/** Set once at app start: present foreground alerts instead of swallowing them. */
export function configureNotificationHandler(): void {
    const Notifications = loadNotifications();
    if (!Notifications) return;
    try {
        Notifications.setNotificationHandler({
            handleNotification: async () => ({
                shouldShowBanner: true,
                shouldShowList: true,
                shouldPlaySound: false,
                shouldSetBadge: false,
            }),
        });
    } catch (err) {
        if (__DEV__) console.warn("[notifications] setNotificationHandler failed.", err);
    }
}

function currentPlatform(): DevicePlatform {
    return (Platform.OS === "ios" ? "ios" : "android") as DevicePlatform;
}

export const notificationService = {
    isExpoGo,
    pushSupported,
    configureNotificationHandler,

    /**
     * Request permission → fetch native FCM/APNs token → POST to the backend.
     * Returns the token, or null when unavailable (simulator / denied / Expo Go).
     */
    async registerDeviceToken(): Promise<string | null> {
        const Notifications = loadNotifications();
        if (!Notifications) return null;
        if (!Device.isDevice) return null;

        try {
            const perms = await Notifications.getPermissionsAsync();
            let status = perms.status;
            if (status !== "granted") {
                const req = await Notifications.requestPermissionsAsync();
                status = req.status;
            }
            if (status !== "granted") return null;

            const native = await Notifications.getDevicePushTokenAsync();
            const token = String(native.data);
            if (!token) return null;

            await apiClient.post("/api/notifications/device-token", {
                token,
                platform: currentPlatform(),
            });
            return token;
        } catch {
            // Expo Go, missing google-services config, or a denied prompt — skip silently.
            return null;
        }
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
     * Returns an unsubscribe function (a no-op when push is unavailable).
     */
    addResponseListener(onNavigate: (data: { jobId?: string; screen?: string }) => void) {
        const Notifications = loadNotifications();
        if (!Notifications) return () => {};
        try {
            const sub = Notifications.addNotificationResponseReceivedListener((response) => {
                const data = (response.notification.request.content.data ?? {}) as {
                    jobId?: string;
                    screen?: string;
                };
                onNavigate(data);
            });
            return () => sub.remove();
        } catch (err) {
            if (__DEV__) console.warn("[notifications] addResponseListener failed.", err);
            return () => {};
        }
    },
};
