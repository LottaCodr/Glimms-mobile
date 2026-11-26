import { catalogService } from "@/services/catalog.service";
import { apiClient } from "@/services/api.client";

jest.mock("@/services/api.client", () => ({ apiClient: { get: jest.fn() } }));
const get = apiClient.get as jest.Mock;

describe("catalogService.similar", () => {
    beforeEach(() => get.mockReset());

    it("asks for look-alikes by default", async () => {
        get.mockResolvedValue({ data: { available: true, items: [{ id: "b", similarity: 0.91 }] } });
        const result = await catalogService.similar("a");
        expect(get).toHaveBeenCalledWith("/api/catalog/a/similar", { params: { mode: "similar", limit: 6 } });
        expect(result.items[0].similarity).toBe(0.91);
    });

    it("passes the mode and limit through", async () => {
        get.mockResolvedValue({ data: { available: false, items: [] } });
        expect(await catalogService.similar("a", "pairs", 3)).toEqual({ available: false, items: [] });
        expect(get).toHaveBeenCalledWith("/api/catalog/a/similar", { params: { mode: "pairs", limit: 3 } });
    });
});
