import { ClosetCategory, ClosetItem } from "@/types/closet.types";
import { create } from "zustand";

type ClosetState = {
    items: ClosetItem[];
    addItems: (items: ClosetItem[]) => void;
    activeCategory: ClosetCategory;
    setCategory: (c: ClosetCategory) => void
}

export const useClosetStore = create<ClosetState>((set) => ({
    items: [],
    addItems: (items) =>
        set((state) => ({ items: [...state.items], ...items })),
    activeCategory: "tops",
    setCategory: (activeCategory) => set({ activeCategory })
}))