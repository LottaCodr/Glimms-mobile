import { create } from 'zustand';
import * as Location from 'expo-location';

interface ContextState {
    context: {
        occasion: string;
        occupation: string;
        styles: string[]; // vibe/style goals to steer sessions (`preferences.styles`)
        lat?: number;
        lon?: number;
    };
    fetchLocation: () => Promise<void>;
    setOccasion: (v: string) => void;
    setOccupation: (v: string) => void;
    setStyles: (v: string[]) => void;
}


export const useContextStore = create<ContextState>((set, get) => ({
    context: { occasion: 'casual', occupation: 'general', styles: [] },

    fetchLocation: async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        set(s => ({ context: { ...s.context, lat: loc.coords.latitude, lon: loc.coords.longitude } }));
    },

    setOccasion: (v) => set(s => ({ context: { ...s.context, occasion: v } })),
    setOccupation: (v) => set(s => ({ context: { ...s.context, occupation: v } })),
    setStyles: (v) => set(s => ({ context: { ...s.context, styles: v } })),
}));