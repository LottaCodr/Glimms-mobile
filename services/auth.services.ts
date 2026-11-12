/**
 * Auth service — guide §3.
 * Stateless JWT (15m) + rotating opaque refresh token (7d).
 */
import { apiClient, tokenStore } from "./api.client";
import type { AuthTokens, User } from "@/types/api";

export async function register(input: { email: string; password: string; name?: string }): Promise<AuthTokens> {
    const { data } = await apiClient.post<AuthTokens>("/api/auth/register", {
        email: input.email.trim().toLowerCase(),
        password: input.password,
        ...(input.name ? { name: input.name.trim() } : {}),
    });
    return data;
}

export async function login(input: { email: string; password: string }): Promise<AuthTokens> {
    const { data } = await apiClient.post<AuthTokens>("/api/auth/login", {
        email: input.email.trim().toLowerCase(),
        password: input.password,
    });
    return data;
}

/** Best-effort server-side invalidation; always clear local tokens afterward. */
export async function logout(): Promise<void> {
    try {
        const refreshToken = await tokenStore.getRefreshToken();
        if (refreshToken) {
            await apiClient.post("/api/auth/logout", { refreshToken });
        }
    } catch {
        // logout must never throw — a dead backend shouldn't trap the user
    }
}

/** Fetch the authenticated profile (guide §3.5 shape). */
export async function fetchMe(): Promise<User> {
    const { data } = await apiClient.get<User>("/api/users/me");
    return data;
}

/** Sign in or up with a Google ID token (verified by the API). */
export async function signInWithGoogle(idToken: string): Promise<AuthTokens> {
    const { data } = await apiClient.post<AuthTokens>("/api/auth/google", { idToken });
    return data;
}

/** Sign in or up with an Apple identity token. Apple shares the name only on the first sign-in. */
export async function signInWithApple(identityToken: string, name?: string): Promise<AuthTokens> {
    const { data } = await apiClient.post<AuthTokens>("/api/auth/apple", {
        identityToken,
        ...(name?.trim() ? { name: name.trim() } : {}),
    });
    return data;
}

/** Emails a reset link if the address has an account. The reply is the same either way. */
export async function requestPasswordReset(email: string): Promise<void> {
    await apiClient.post("/api/auth/forgot-password", { email: email.trim().toLowerCase() });
}

/** Sends the "confirm your email" message again. */
export async function resendVerification(): Promise<{ alreadyVerified: boolean }> {
    const { data } = await apiClient.post<{ alreadyVerified?: boolean }>("/api/auth/resend-verification");
    return { alreadyVerified: !!data?.alreadyVerified };
}

/** Permanently deletes the account and everything stored for it. */
export async function deleteAccount(): Promise<void> {
    await apiClient.delete("/api/users/me");
}
