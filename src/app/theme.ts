import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

// index.html reads the same key before first paint to avoid a flash of the wrong theme.
export const THEME_KEY = "mc-mod-manager:theme";

const themeColors: Record<Theme, string> = {
  light: "#f8faf8",
  dark: "#0b0f0e",
};

/** Light is the default; only an explicit saved "dark" switches it. */
export function readTheme(): Theme {
  try {
    return window.localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", themeColors[theme]);
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      // The choice still applies for this visit when storage is blocked.
    }
  }, [theme]);
  return [
    theme,
    () => setTheme((value) => (value === "dark" ? "light" : "dark")),
  ];
}
