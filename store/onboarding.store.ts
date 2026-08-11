import { create } from "zustand";

type OnboardingState = {
    completed: boolean;
    completeOnboarding: () => void;
};

export const useOnboardingStore = create<OnboardingState>((set) => ({
    completed: false,
    completeOnboarding: () => set({ completed: false })
}))