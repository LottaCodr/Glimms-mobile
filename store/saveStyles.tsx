import { SavedStyle } from "@/types/savedStyles";
import { create } from "zustand";

export type Filter = "all" | "work" | "evening"



type SavedStylesState = {
    styles: SavedStyle[],
    filter: Filter,
    setFilter: (f: Filter) => void;
    toggleLike: (id: string) => void;
};

export const useSavedStylesStore = create<SavedStylesState>((set) => ({
    filter: "all",
    styles: [],

    setFilter: (filter) => set({ filter }),

    toggleLike: (id) => set((s) => ({
        styles: s.styles.map((style) => style.id === id ? { ...style, liked: !style.liked } : style)

    }))
}))