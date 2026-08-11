import { create } from "zustand";

export type ToastType = "success" | "error" | "info" | "warning";

export type ToastItem = {
    id: string;
    type: ToastType;
    message: string;
};

type ToastState = {
    toasts: ToastItem[];
    show: (message: string, type?: ToastType, ttlMs?: number) => void;
    dismiss: (id: string) => void;
};

let counter = 0;

export const useToastStore = create<ToastState>((set) => ({
    toasts: [],
    show: (message, type = "info", ttlMs = 3500) => {
        const id = `t-${++counter}-${Date.now()}`;
        set((s) => ({ toasts: [...s.toasts.slice(-2), { id, type, message }] })); // keep max 3
        setTimeout(() => {
            set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
        }, ttlMs);
    },
    dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Imperative helper for non-React code paths (services, stores). */
export const toast = {
    success: (m: string) => useToastStore.getState().show(m, "success"),
    error: (m: string) => useToastStore.getState().show(m, "error", 4500),
    info: (m: string) => useToastStore.getState().show(m, "info"),
    warning: (m: string) => useToastStore.getState().show(m, "warning"),
};
