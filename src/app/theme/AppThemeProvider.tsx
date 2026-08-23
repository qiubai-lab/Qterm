/* eslint-disable react-refresh/only-export-components -- provider and hook form one app boundary. */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { getSettings, type AppTheme } from "../../lib/tauri/settings";
import { setNativeWindowTheme } from "../../lib/tauri/window";
import { refreshTerminalThemes } from "../../terminal/terminalTheme";

interface AppThemeContextValue {
  theme: AppTheme;
  persistedTheme: AppTheme;
  previewTheme: (theme: AppTheme) => void;
  commitTheme: (theme: AppTheme) => void;
  restoreTheme: () => void;
}

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

export function currentDocumentTheme(): AppTheme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function applyAppTheme(theme: AppTheme): void {
  document.documentElement.dataset.theme = theme;
  refreshTerminalThemes();
  void setNativeWindowTheme(theme)?.catch(() => undefined);
}

export async function bootstrapAppTheme(): Promise<AppTheme> {
  let theme: AppTheme = "dark";
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    try {
      theme = (await getSettings()).appearance.theme;
    } catch {
      theme = "dark";
    }
  }
  applyAppTheme(theme);
  return theme;
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const initialTheme = currentDocumentTheme();
  const [theme, setTheme] = useState<AppTheme>(initialTheme);
  const [persistedTheme, setPersistedTheme] = useState<AppTheme>(initialTheme);

  const previewTheme = useCallback((next: AppTheme) => {
    setTheme(next);
    applyAppTheme(next);
  }, []);

  const commitTheme = useCallback((next: AppTheme) => {
    setPersistedTheme(next);
    setTheme(next);
    applyAppTheme(next);
  }, []);

  const restoreTheme = useCallback(() => {
    setTheme(persistedTheme);
    applyAppTheme(persistedTheme);
  }, [persistedTheme]);

  const value = useMemo(() => ({ theme, persistedTheme, previewTheme, commitTheme, restoreTheme }), [commitTheme, persistedTheme, previewTheme, restoreTheme, theme]);
  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

export function useAppTheme(): AppThemeContextValue {
  const context = useContext(AppThemeContext);
  if (!context) throw new Error("AppThemeProvider is missing");
  return context;
}
