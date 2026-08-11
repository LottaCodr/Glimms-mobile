/**
 * Catalog — the user's detected/added wardrobe/room/garden items (guide §11).
 *
 * Rendering tip: list with `includeUrls: true` so each item carries a presigned
 * `imageUrl` (900s TTL). If an image 403s (expired URL), refetch via getImageUrl.
 */
import { apiClient } from "./api.client";
import type { CatalogFilters, CatalogItem, CatalogItemInput, Paginated, Vertical } from "@/types/api";

const PAGE_SIZE = 20;

export type CatalogPage = Paginated<CatalogItem>;

export const catalogService = {
    async list(
        filters: CatalogFilters = {},
        page = 1,
        limit = PAGE_SIZE,
    ): Promise<CatalogPage> {
        const { data } = await apiClient.get<CatalogPage>("/api/catalog", {
            params: {
                ...(filters.vertical ? { vertical: filters.vertical } : {}),
                ...(filters.category ? { category: filters.category } : {}),
                ...(filters.tag ? { tag: filters.tag } : {}),
                includeUrls: filters.includeUrls ?? true,
                page,
                limit,
            },
        });
        return data;
    },

    async get(id: string): Promise<CatalogItem> {
        const { data } = await apiClient.get<CatalogItem>(`/api/catalog/${id}`);
        return data;
    },

    /** Fresh presigned GET URL for one item — call when a cached imageUrl 403s. */
    async getImageUrl(id: string): Promise<string> {
        const { data } = await apiClient.get<{ url: string }>(`/api/catalog/${id}/url`);
        return data.url;
    },

    /** NOTE: `imageKey` must already exist in S3 — prefer "scan to add" (guide §11). */
    async create(input: CatalogItemInput): Promise<CatalogItem> {
        const { data } = await apiClient.post<CatalogItem>("/api/catalog", input);
        return data;
    },

    async update(
        id: string,
        patch: Partial<Pick<CatalogItem, "label" | "tags" | "styleTags" | "attributes">>,
    ): Promise<CatalogItem> {
        const { data } = await apiClient.patch<CatalogItem>(`/api/catalog/${id}`, patch);
        return data;
    },

    /** Soft delete (isActive=false) — GET endpoints will hide the item. */
    async remove(id: string): Promise<void> {
        await apiClient.delete(`/api/catalog/${id}`);
    },
};

export type { CatalogFilters, Vertical };
