import { create } from "zustand";

type Occasion = "work" | "casual" | "event";
type ColorPref = "neutral" | "cool" | "earthy" | " bright" | " mono";

type StyleSetupState = {
    occasion: Occasion;
    color: ColorPref;
    vibe: string[];
    setOccasion: (o: Occasion) => void;
    setColor: (c: ColorPref) => void;
    toggleVibe: (v: string) => void;
    reset: () => void;
}

export const useStyleSetupStore = create<StyleSetupState>((set) => ({
    occasion: "work",
    color: "neutral",
    vibe: ["minimal"],

    setOccasion: (occasion) => set({ occasion }),
    setColor: (color) => set({ color }),

    toggleVibe: (vibe) =>
        set((s) => ({
            vibe: s.vibe.includes(vibe)
                ? s.vibe.filter((v) => v !== vibe)
                : [...s.vibe, vibe]
        })),

    reset: () => set({
        occasion: "work",
        color: "neutral",
        vibe: ["minimal"]
    })

}))