import { create } from "zustand";

type OutfitState = {
    open: boolean;
    context: "work" | "casual" | "event";
    outfits: any[];
    openModal: () => void;
    closeModal: () => void;
};

export const useOutfitStore = create<OutfitState>((set) => ({
    open: false,
    context: "work",
    outfits: [],
    openModal: () => set({ open: true }),
    closeModal: () => set({ open: false }),
}));
