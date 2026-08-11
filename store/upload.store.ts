import { create } from "zustand";

export type UploadStep = 1 | 2 | 3 | 4 | 5;

export type UploadImage = {
    id: string;
    uri: string;
    localPath: string;
    status: "pending" | "uploading" | "uploaded" | "failed";
};

type UploadState = {
    step: UploadStep;
    images: UploadImage[];
    addImages: (imgs: UploadImage[]) => void;
    reset: () => void;
    removeImage: (id: string) => void;
    setStatus: (id: string, status: UploadImage['status']) => void;
    nextStep: () => void;
    clearImages: () => void;
};

export const useUploadStore = create<UploadState>((set) => ({
    step: 1,
    images: [],
    addImages: (imgs) =>
        set((s) => ({ images: [...s.images, ...imgs] })),

    reset: () => set({ step: 1, images: [] }),
    removeImage: (id) => set((s) => ({
        images: s.images.filter((img) => img.id !== id)
    })),

    setStatus: (id, status) => set((s) => ({
        images: s.images.map((img) => img.id === id ? { ...img, status } : img)
    })),

    nextStep: () => {
        set((s) => ({ step: Math.min((s.step + 1)) as UploadStep }))
    },

    clearImages: () => set((s) => ({ ...s, images: [] })),
}))