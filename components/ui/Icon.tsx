/**
 * Unified icon layer over @expo/vector-icons (the React Native equivalent of
 * react-icons — react-icons itself emits DOM <svg> and doesn't run natively).
 * Use `AppIcon` everywhere instead of emoji/Text glyphs so icons stay
 * consistent, themeable, and accessible.
 */
import React from "react";
import { Ionicons, Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Colors } from "@/theme";

export type IconFamily = "ionicons" | "feather" | "mci";

export type IoniconName = keyof typeof Ionicons.glyphMap;
export type FeatherName = keyof typeof Feather.glyphMap;
export type MciName = keyof typeof MaterialCommunityIcons.glyphMap;

type Props = {
    name: string;
    family?: IconFamily;
    size?: number;
    color?: string;
    style?: object;
};

export function AppIcon({ name, family = "ionicons", size = 20, color = Colors.text, style }: Props) {
    switch (family) {
        case "feather":
            return <Feather name={name as FeatherName} size={size} color={color} style={style} />;
        case "mci":
            return <MaterialCommunityIcons name={name as MciName} size={size} color={color} style={style} />;
        default:
            return <Ionicons name={name as IoniconName} size={size} color={color} style={style} />;
    }
}

/** Semantic aliases — keeps call-sites readable and easy to re-skin. */
export const Icons = {
    scan: "scan-outline",
    camera: "camera-outline",
    images: "images-outline",
    check: "checkmark",
    checkCircle: "checkmark-circle",
    close: "close",
    back: "chevron-back",
    forward: "chevron-forward",
    add: "add",
    trash: "trash-outline",
    heart: "heart",
    heartOutline: "heart-outline",
    share: "share-social-outline",
    edit: "create-outline",
    sparkle: "sparkles-outline",
    bulb: "bulb-outline",
    alert: "warning-outline",
    error: "alert-circle-outline",
    search: "search-outline",
    bell: "notifications-outline",
    location: "location-outline",
    calendar: "calendar-outline",
    palette: "color-palette-outline",
    person: "person-outline",
    signOut: "log-out-outline",
    crown: "diamond-outline",
    refresh: "refresh-outline",
    clock: "time-outline",
    wardrobe: "shirt-outline",
    hanger: "albums-outline",
    infoCircle: "information-circle-outline",
    wifiOff: "cloud-offline-outline",
    flame: "flash-outline",
    sunny: "sunny-outline",
    briefcase: "briefcase-outline",
    moon: "moon-outline",
    apps: "apps-outline",
    google: "logo-google",
    apple: "logo-apple",
    mail: "mail-outline",
    lock: "lock-closed-outline",
    eye: "eye-outline",
    eyeOff: "eye-off-outline",
    shield: "shield-checkmark-outline",
    help: "help-circle-outline",
    globe: "globe-outline",
} as const satisfies Record<string, string>;
