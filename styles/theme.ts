import { tokens } from "./tokens";

export const lightTheme = {
    ...tokens,
    mode: "light" as const,
};

export type Theme = typeof lightTheme