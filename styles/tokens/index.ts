import { colors } from "@/styles/tokens/colors";
import { radius } from "@/styles/tokens/radius";
import { shadows } from "@/styles/tokens/shadow";
import { spacing } from "@/styles/tokens/spacing";
import { typography, fontFamilies } from "@/styles/tokens/typography";
import { zIndex } from "./zindex";

export const tokens = {
    colors,
    spacing,
    typography,
    fontFamilies,
    radius,
    shadows,
    zIndex
};

export type Theme = typeof tokens;
