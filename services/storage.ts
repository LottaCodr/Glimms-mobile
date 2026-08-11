/**
 * Cross-platform secure token storage.
 * Native: expo-secure-store (Keychain/Keystore). Web: localStorage fallback
 * (XSS trade-off documented in guide §3.3 — acceptable short-term for MVP).
 */
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const PREFIX = "glimms_store:";

const webFallback = {
    async getItemAsync(key: string): Promise<string | null> {
        try {
            return globalThis.localStorage?.getItem(PREFIX + key) ?? null;
        } catch {
            return null;
        }
    },
    async setItemAsync(key: string, value: string): Promise<void> {
        try {
            globalThis.localStorage?.setItem(PREFIX + key, value);
        } catch {
            /* private mode */
        }
    },
    async deleteItemAsync(key: string): Promise<void> {
        try {
            globalThis.localStorage?.removeItem(PREFIX + key);
        } catch {
            /* noop */
        }
    },
};

const impl = Platform.OS === "web" ? webFallback : SecureStore;

export const secureStorage = {
    getItemAsync: impl.getItemAsync,
    setItemAsync: impl.setItemAsync,
    deleteItemAsync: impl.deleteItemAsync,
};
