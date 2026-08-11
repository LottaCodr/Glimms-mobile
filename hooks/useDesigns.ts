/**
 * Saved designs + jobs queries/mutations — guide §9/§10.
 */
import {
    useInfiniteQuery,
    useMutation,
    useQuery,
    useQueryClient,
} from "@tanstack/react-query";
import { designService } from "@/services/design.service";
import { analyticsService } from "@/services/analytics.service";
import type { GeneratedDesign } from "@/types/api";

export function useJobs(limit = 20) {
    return useInfiniteQuery({
        queryKey: ["jobs"],
        queryFn: ({ pageParam = 1 }) => designService.listJobs(pageParam, limit),
        initialPageParam: 1,
        getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    });
}

export function useSavedDesigns(favoriteOnly = false) {
    return useInfiniteQuery({
        queryKey: ["saved", { favorite: favoriteOnly }],
        queryFn: ({ pageParam = 1 }) => designService.listSaved(pageParam, 20, favoriteOnly),
        initialPageParam: 1,
        getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    });
}

export const flattenSaved = (data: ReturnType<typeof useSavedDesigns>["data"]) =>
    data?.pages.flatMap((p) => p.designs) ?? [];

export function useSaveDesign() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ sourceId, design }: { sourceId: string; design: GeneratedDesign }) =>
            designService.saveGenerated(sourceId, design),
        onSuccess: (_d, vars) => {
            qc.invalidateQueries({ queryKey: ["saved"] });
            qc.invalidateQueries({ queryKey: ["analytics", "me"] });
            analyticsService.track("design_saved", {
                sourceId: vars.sourceId,
                score: vars.design.score ?? null,
            });
        },
    });
}

/** Optimistic favorite toggle (guide §10). */
export function useToggleFavorite() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => designService.toggleFavorite(id),
        onMutate: async (id) => {
            await qc.cancelQueries({ queryKey: ["saved"] });
            const snapshots = qc.getQueriesData<{ pages: any[] }>({ queryKey: ["saved"] });
            qc.setQueriesData<{ pages: any[] }>({ queryKey: ["saved"] }, (old) => {
                if (!old) return old;
                return {
                    ...old,
                    pages: old.pages.map((p) => ({
                        ...p,
                        designs: p.designs.map((d: any) =>
                            d.id === id ? { ...d, isFavorite: !d.isFavorite } : d,
                        ),
                    })),
                };
            });
            return { snapshots };
        },
        onError: (_e, _id, ctx) => {
            ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data));
        },
        onSettled: () => qc.invalidateQueries({ queryKey: ["saved"] }),
    });
}

export function useDeleteSavedDesign() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => designService.remove(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["saved"] });
            qc.invalidateQueries({ queryKey: ["analytics", "me"] });
        },
    });
}

/** Dashboard pills: scansToday / catalogCount / savedCount (guide §14). */
export function useAnalyticsSummary() {
    return useQuery({
        queryKey: ["analytics", "me"],
        queryFn: () => analyticsService.me(),
        staleTime: 30_000,
    });
}
