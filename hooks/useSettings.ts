import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface SettingsState {
    notifications: {
        pushEnabled: boolean;
        styleAlerts: boolean;
        marketingEmails: boolean;
    };
    privacy: {
        isPublicCloset: boolean;
        allowDataSharing: boolean;
    };
    setNotification: (key: keyof SettingsState['notifications'], value: boolean) => void;
    setPrivacy: (key: keyof SettingsState['privacy'], value: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
    persist(
        (set) => ({
            notifications: {
                pushEnabled: true,
                styleAlerts: true,
                marketingEmails: false,
            },
            privacy: {
                isPublicCloset: true,
                allowDataSharing: true,
            },
            setNotification: (key, value) =>
                set((state) => ({
                    notifications: { ...state.notifications, [key]: value }
                })),
            setPrivacy: (key, value) =>
                set((state) => ({
                    privacy: { ...state.privacy, [key]: value }
                })),
        }),
        {
            name: 'glimms-settings',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);

export const useSettings = () => {
    const settings = useSettingsStore();

    const togglePush = () => settings.setNotification('pushEnabled', !settings.notifications.pushEnabled);
    const toggleStyleAlerts = () => settings.setNotification('styleAlerts', !settings.notifications.styleAlerts);
    const togglePublicCloset = () => settings.setPrivacy('isPublicCloset', !settings.privacy.isPublicCloset);

    return {
        ...settings,
        togglePush,
        toggleStyleAlerts,
        togglePublicCloset,
    };
};
