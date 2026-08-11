import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * App-level React Query provider. Must wrap the whole tree at the root layout —
 * a provider mounted in a leaf route does NOT cover sibling routes.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
    const [client] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        retry: (failureCount, error: any) => {
                            // Don't hammer the API on auth/validation failures.
                            const status = error?.status;
                            if (status && status >= 400 && status < 500) return false;
                            return failureCount < 2;
                        },
                        staleTime: 30 * 1000,
                        refetchOnWindowFocus: false,
                        refetchOnMount: true,
                    },
                    mutations: { retry: 0 },
                },
            }),
    );
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
