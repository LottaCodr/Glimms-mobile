/**
 * Users & preferences — guide §7.
 * `PUT /preferences` is an upsert and merges — safe to call repeatedly.
 */
import { apiClient } from "./api.client";
import type { PreferencesInput, User, UserPreferences } from "@/types/api";

export const userService = {
    async me(): Promise<User> {
        const { data } = await apiClient.get<User>("/api/users/me");
        return data;
    },

    async update(patch: { name?: string; avatarUrl?: string }): Promise<User> {
        const { data } = await apiClient.patch<User>("/api/users/me", patch);
        return data;
    },

    /** Soft-deactivates the account (isActive=false). Caller should clear tokens. */
    async deactivate(): Promise<void> {
        await apiClient.delete("/api/users/me");
    },

    /** Returns `{}` when no preferences exist yet. */
    async getPreferences(): Promise<UserPreferences | Record<string, never>> {
        const { data } = await apiClient.get("/api/users/me/preferences");
        return data;
    },

    /** Upsert — merges with stored preferences. Omit `location` if permission denied. */
    async savePreferences(input: PreferencesInput): Promise<UserPreferences> {
        const { data } = await apiClient.put<UserPreferences>("/api/users/me/preferences", input);
        return data;
    },
};
