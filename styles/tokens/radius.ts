export const radius = {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 16,
    xl: 20,
    xxl: 28,
    full: 9999,
} as const;

export type Radius = typeof radius;
