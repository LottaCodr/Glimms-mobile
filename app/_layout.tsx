import { ThemeProvider } from "@/provider/ThemeProvider";
import { QueryProvider } from "@/provider/QueryProvider";
import { Toaster } from "@/components/feedback/Toast";
import { OfflineBanner } from "@/components/feedback/OfflineBanner";
import { notificationService } from "@/services/notifications.service";
import { useAuthStore } from "@/store/auth.store";
import { useOfflineQueueStore } from "@/store/offlineQueue.store";
import { router, Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";

SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Expo Router renders this instead of a white screen when a route throws while
 * rendering, so failures surface as a readable message rather than a crash.
 */
export { ErrorBoundary } from "expo-router";

const PUBLIC_GROUPS = ["(auth)", "(onboarding)", "legal"];

function AuthGate() {
    const nav = useRouter();
    const segments = useSegments();
    const { isLoading, isAuthenticated } = useAuthStore();

    useEffect(() => {
        if (isLoading) return;
        const group = segments[0];
        const inPublicGroup = PUBLIC_GROUPS.includes(group as string);
        // group is undefined at the splash (index) — it routes itself.
        if (!group) return;

        if (!isAuthenticated && !inPublicGroup) {
            nav.replace("/(onboarding)/welcome");
        } else if (isAuthenticated && inPublicGroup) {
            nav.replace("/(tabs)/home");
        }
    }, [isLoading, isAuthenticated, segments, nav]);

    return null;
}

export default function RootLayout() {
    useEffect(() => {
        // Push notifications: foreground display + deep-link taps (guide §13).
        // No-ops in Expo Go on Android, where remote push was removed in SDK 53.
        let removePushListener = () => {};
        try {
            notificationService.configureNotificationHandler();
            removePushListener = notificationService.addResponseListener(({ jobId, screen }) => {
                if (screen === "designs" && jobId) {
                    router.push(`/jobs/${jobId}` as any);
                }
            });
        } catch (err) {
            console.warn("[app] notification setup skipped:", err);
        }

        // Offline scan queue: hydrate + auto-flush on reconnect.
        let stopAutoFlush = () => {};
        try {
            const queue = useOfflineQueueStore.getState();
            void queue.hydrate();
            stopAutoFlush = queue.startAutoFlush();
        } catch (err) {
            console.warn("[app] offline queue setup skipped:", err);
        }

        SplashScreen.hideAsync().catch(() => {});
        return () => {
            removePushListener();
            stopAutoFlush();
        };
    }, []);

    return (
        <QueryProvider>
            <ThemeProvider>
                <AuthGate />
                <Stack>
                    <Stack.Screen name="index" options={{ headerShown: false }} />
                    <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
                    <Stack.Screen name="(auth)" options={{ headerShown: false }} />
                    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                    <Stack.Screen name="screens" options={{ headerShown: false }} />
                    <Stack.Screen name="session/[id]" options={{ headerShown: false }} />
                    <Stack.Screen name="jobs/[id]" options={{ headerShown: false }} />
                    <Stack.Screen name="catalog/[id]" options={{ headerShown: false }} />
                    <Stack.Screen name="saved/[id]" options={{ headerShown: false }} />
                    <Stack.Screen name="activity" options={{ headerShown: false }} />
                    <Stack.Screen name="preferences" options={{ headerShown: false, presentation: "modal" }} />
                    <Stack.Screen name="paywall" options={{ headerShown: false, presentation: "modal" }} />
                    <Stack.Screen name="legal/terms" options={{ headerShown: false, presentation: "modal" }} />
                    <Stack.Screen name="legal/privacy" options={{ headerShown: false, presentation: "modal" }} />
                </Stack>
                <OfflineBanner />
                <Toaster />
            </ThemeProvider>
        </QueryProvider>
    );
}
