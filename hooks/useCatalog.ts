/**
 * Catalog queries + mutations — guide §11/§17.
 * Infinite list keyed by filters; `includeUrls=true` so items carry imageUrl.
 */
import {
    useInfiniteQuery,
    useQuery,
    useMutation,
    useQueryClient,
} from "@tanstack/react-query";
import { catalogService } from "@/services/catalog.service";
import type { CatalogFilters, CatalogItem, SimilarityMode } from "@/types/api";

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

/** Visually similar items (`similar`) or matching pieces from other categories (`pairs`). */
export function useSimilarItems(id: string | undefined, mode: SimilarityMode) {
    return useQuery({
        queryKey: ["catalog", "similar", id, mode],
        queryFn: () => catalogService.similar(id!, mode),
        enabled: !!id,
        staleTime: 5 * 60_000, // image links last 15 minutes
        retry: false, // optional section: fail quietly rather than keep the screen busy
    });
}
