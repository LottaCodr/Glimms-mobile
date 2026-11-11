import { ApiError, tokenStore } from "@/services/api.client";
import * as authApi from "@/services/auth.services";
import { notificationService } from "@/services/notifications.service";
import { wsService } from "@/services/websocket.service";
import { useAuthStore } from "@/store/auth.store";

jest.mock("@/services/auth.services");
jest.mock("@/services/notifications.service", () => ({
    notificationService: {
        registerDeviceToken: jest.fn(async () => "push-token"),
        removeDeviceToken: jest.fn(async () => undefined),
    },
}));
jest.mock("@/services/analytics.service", () => ({ analyticsService: { track: jest.fn() } }));
jest.mock("@/services/websocket.service", () => ({ wsService: { disconnect: jest.fn() } }));

const api = authApi as jest.Mocked<typeof authApi>;
const user = { id: "u1", email: "ada@glimms.ai", name: "Ada", tier: "free" } as any;
const tokens = { accessToken: "access-1", refreshToken: "refresh-1", expiresIn: 900 };
const state = () => useAuthStore.getState();
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
    await tokenStore.clear();
    useAuthStore.setState({ user: null, isLoading: true, isAuthenticated: false, pushToken: null });
    api.fetchMe.mockResolvedValue(user);
    api.login.mockResolvedValue(tokens);
    api.register.mockResolvedValue(tokens);
    api.logout.mockResolvedValue(undefined);
});

describe("hydrateAuth", () => {
    it("finishes loading as signed out when there is no stored session", async () => {
        await state().hydrateAuth();

        expect(state()).toMatchObject({ isLoading: false, isAuthenticated: false, user: null });
        expect(api.fetchMe).not.toHaveBeenCalled();
    });

    it("restores the session and registers for push", async () => {
        await tokenStore.save(tokens);

        await state().hydrateAuth();
        await settle();

        expect(state()).toMatchObject({ isLoading: false, isAuthenticated: true, user, pushToken: "push-token" });
    });

    it("forgets a session the server rejects", async () => {
        await tokenStore.save(tokens);
        api.fetchMe.mockRejectedValue(new ApiError(401, { error: "Unauthorized", code: "UNAUTHORIZED" }));

        await state().hydrateAuth();

        expect(state()).toMatchObject({ isLoading: false, isAuthenticated: false });
        expect(await tokenStore.getRefreshToken()).toBeNull();
    });

    it("keeps the stored session when the app starts offline", async () => {
        await tokenStore.save(tokens);
        api.fetchMe.mockRejectedValue(new ApiError(0, undefined, true));

        await state().hydrateAuth();

        expect(state()).toMatchObject({ isLoading: false, isAuthenticated: false });
        expect(await tokenStore.getRefreshToken()).toBe("refresh-1");
    });
});

describe("login / register", () => {
    it("stores the tokens and loads the profile", async () => {
        await state().login("ada@glimms.ai", "password123");

        expect(api.login).toHaveBeenCalledWith({ email: "ada@glimms.ai", password: "password123" });
        expect(await tokenStore.getAccessToken()).toBe("access-1");
        expect(state()).toMatchObject({ isAuthenticated: true, user });
    });

    it("stays signed out when the credentials are wrong", async () => {
        api.login.mockRejectedValue(new ApiError(401, { error: "Invalid credentials", code: "UNAUTHORIZED" }));

        await expect(state().login("ada@glimms.ai", "nope")).rejects.toThrow("Invalid credentials");

        expect(state().isAuthenticated).toBe(false);
        expect(await tokenStore.getAccessToken()).toBeNull();
    });

    it("registers and signs in", async () => {
        await state().register("ada@glimms.ai", "password123", "Ada");

        expect(api.register).toHaveBeenCalledWith({ email: "ada@glimms.ai", password: "password123", name: "Ada" });
        expect(state()).toMatchObject({ isAuthenticated: true, user });
    });
});

describe("logout", () => {
    it("revokes the session, removes the push token and clears local state", async () => {
        await state().login("ada@glimms.ai", "password123");
        await settle();

        await state().logout();

        expect(api.logout).toHaveBeenCalled();
        expect(notificationService.removeDeviceToken).toHaveBeenCalledWith("push-token");
        expect(wsService.disconnect).toHaveBeenCalled();
        expect(await tokenStore.getAccessToken()).toBeNull();
        expect(state()).toMatchObject({ isAuthenticated: false, user: null, pushToken: null });
    });
});
