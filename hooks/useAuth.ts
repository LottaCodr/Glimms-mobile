/**
 * Convenience selectors over the auth store.
 */
import { useAuthStore } from "@/store/auth.store";

export function useAuth() {
    const user = useAuthStore((s) => s.user);
    const isLoading = useAuthStore((s) => s.isLoading);
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
    const login = useAuthStore((s) => s.login);
    const register = useAuthStore((s) => s.register);
    const logout = useAuthStore((s) => s.logout);
    const refreshUser = useAuthStore((s) => s.refreshUser);

    return { user, isLoading, isAuthenticated, login, register, logout, refreshUser };
}
