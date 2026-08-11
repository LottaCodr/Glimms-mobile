/**
 * Catalog queries + mutations — guide §11/§17.
 * Infinite list keyed by filters; `includeUrls=true` so items carry imageUrl.
 */
import {
    useInfiniteQuery,
    useMutation,
    useQueryClient,
} from "@tanstack/react-query";
import { catalogService } from "@/services/catalog.service";
import type { CatalogFilters, CatalogItem } from "@/types/api";

export function useCatalog(filters: CatalogFilters) {
    return useInfiniteQuery({
        queryKey: ["catalog", filters],
        queryFn: ({ pageParam = 1 }) => catalogService.list(filters, pageParam),
        initialPageParam: 1,
        getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    });
}

export function flattenCatalog(data: ReturnType<typeof useCatalog>["data"]): CatalogItem[] {
    return data?.pages.flatMap((p) => p.items) ?? [];
}

export function useUpdateCatalogItem() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({
            id,
            patch,
        }: {
            id: string;
            patch: Partial<Pick<CatalogItem, "label" | "tags" | "styleTags" | "attributes">>;
        }) => catalogService.update(id, patch),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
    });
}

export function useDeleteCatalogItem() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => catalogService.remove(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["catalog"] });
            qc.invalidateQueries({ queryKey: ["analytics", "me"] });
        },
    });
}
