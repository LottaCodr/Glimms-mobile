import { AIResult } from "@/types/ai.types";
import { create } from "zustand";

type AIState = {
    loading: boolean;
    result: AIResult | null;
    setLoading: (loading: boolean) => void;
    setResult: (result: AIResult) => void
}

export const useAIStore = create<AIState>((set) => ({
    loading: false,
    result: null,
    setLoading: (loading: boolean) => set(() => ({ loading })),
    setResult: (result: AIResult) => set(() => ({ result }))
}))