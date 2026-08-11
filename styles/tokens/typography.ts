import { TextStyle } from "react-native";
import { colors } from "./colors";

export const fontFamilies = {
    serif: 'Georgia', // swap for a loaded custom font (e.g. Cormorant Garamond via expo-font)
    sans: 'System',
} as const;

export const typography: Record<string, TextStyle> = {
    h1: {
        fontSize: 32,
        fontWeight: "700",
        fontFamily: fontFamilies.serif,
        color: colors.text,
    },
    h2: {
        fontSize: 24,
        fontWeight: "600",
        fontFamily: fontFamilies.serif,
        color: colors.text,
    },
    h3: {
        fontSize: 20,
        fontWeight: "600",
        fontFamily: fontFamilies.sans,
        color: colors.text,
    },
    body: {
        fontSize: 16,
        fontWeight: "400",
        fontFamily: fontFamilies.sans,
        color: colors.text,
    },
    caption: {
        fontSize: 12,
        fontWeight: "400",
        fontFamily: fontFamilies.sans,
        color: colors.mid,
    },
    button: {
        fontSize: 16,
        fontWeight: "600",
        fontFamily: fontFamilies.sans,
        color: colors.white,
    },
};

export type Typography = typeof typography;
export type FontFamilies = typeof fontFamilies;
