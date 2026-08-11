import React, { createContext, useContext, useMemo } from "react";
import { Theme, lightTheme } from "../styles/theme";

type ThemeContextType = Theme;

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({
    children,
}: {
    children: React.ReactNode;
}) => {

    const theme = useMemo(() => lightTheme, []);

    return (
        <ThemeContext.Provider value={theme}>
            {children}
        </ThemeContext.Provider>
    )
};


export const useTheme = (): ThemeContextType => {
    const context = useContext(ThemeContext);;

    if (!context) {
        throw new Error("useTheme must be used within a ThemProvider")
    }

    return context
}