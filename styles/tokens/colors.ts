export const colors = {
    brand: {
        primary: '#BF9245', // Gold
        secondary: "#22C55E", // Green
        accent: "#F59E0B", // Amber
        background: '#09090B',

        surface: '#111113',
        card: '#18181C',
        card2: '#202025',
        border: '#252528',
        gold: '#BF9245',
        goldL: '#D4AA60',
        goldGlow: 'rgba(191,146,69,0.14)',
        cream: '#EEE5D3',
        text: '#EAE2D5',
        mid: '#6B6560',
        dim: '#2E2C2A',
        error: '#C04040',
        white: '#FFFFFF',
        black: '#000000',
    },

    // Flat access matching the provided Colors spec
    bg: '#09090B',
    surface: '#111113',
    card: '#18181C',
    card2: '#202025',
    border: '#252528',
    gold: '#BF9245',
    goldL: '#D4AA60',
    goldGlow: 'rgba(191,146,69,0.14)',
    cream: '#EEE5D3',
    text: '#EAE2D5',
    mid: '#6B6560',
    dim: '#2E2C2A',
    error: '#C04040',
    white: '#FFFFFF',
    black: '#000000',

    neutral: {
        0: "#FFFFFF",
        50: "#FAFAFA",
        100: "#F5F5F5",
        200: "#E5E5E5",
        300: "#D4D4D4",
        400: "#A3A3A3",
        500: "#737373",
        600: "#525252",
        700: "#404040",
        800: "#262626",
        900: "#171717",
    },

    semantic: {
        success: "#22C55E",
        warning: "#F59E0B",
        error: "#EF4444",
        info: "#3B82F6",
    },

    overlay: "rgba(0,0,0,0.4)",
} as const;

export type Colors = typeof colors;
