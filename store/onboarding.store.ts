/**
 * Onboarding quiz state — answers collected across the quiz screens and sent
 * once as `PUT /api/users/me/preferences` after registration (guide §16.2).
 */
import { create } from "zustand";
import type { UserLocation } from "@/types/api";

type OnboardingAnswers = {
    styleGoal: string | null; // quiz-style (e.g. "minimal")
    occasions: string[]; // quiz-occasion
    occupation: string | null;
    city: string | null; // quiz-location
    location: UserLocation | null; // resolved coords (permission-gated)
};

type OnboardingState = {
    answers: OnboardingAnswers;
    setStyleGoal: (v: string) => void;
    setOccasions: (v: string[]) => void;
    setOccupation: (v: string | null) => void;
    setCity: (v: string | null) => void;
    setLocation: (loc: UserLocation | null) => void;
    reset: () => void;
};

const initialAnswers: OnboardingAnswers = {
    styleGoal: null,
    occasions: [],
    occupation: null,
    city: null,
    location: null,
};

export const useOnboardingStore = create<OnboardingState>((set) => ({
    answers: initialAnswers,

    setStyleGoal: (v) => set((s) => ({ answers: { ...s.answers, styleGoal: v } })),
    setOccasions: (v) => set((s) => ({ answers: { ...s.answers, occasions: v } })),
    setOccupation: (v) => set((s) => ({ answers: { ...s.answers, occupation: v } })),
    setCity: (v) => set((s) => ({ answers: { ...s.answers, city: v } })),
    setLocation: (loc) => set((s) => ({ answers: { ...s.answers, location: loc } })),
    reset: () => set({ answers: initialAnswers }),
}));
