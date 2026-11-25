import { hasWorkspaceRuntime } from "../../lib/runtime/environment";
/* eslint-disable react-refresh/only-export-components -- provider and hook form one app boundary. */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { getSettings, type AppTheme } from "@qterm/services/settings";
import { setNativeWindowTheme } from "../../lib/tauri/window";
import { commitTerminalFontSize } from "../../terminal/terminalFontSize";
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
  const theme = document.documentElement.dataset.theme;
  return theme === "light" || theme === "cyberpunk" ? theme : "dark";
}

export function applyAppTheme(theme: AppTheme): void {
  document.documentElement.dataset.theme = theme;
  refreshTerminalThemes();
  void setNativeWindowTheme(theme)?.catch(() => undefined);
}

export async function bootstrapAppTheme(): Promise<AppTheme> {
  let theme: AppTheme = "dark";
  let fontSize: number | undefined;
  if (hasWorkspaceRuntime()) {
    try {
      const appearance = (await getSettings()).appearance;
      theme = appearance.theme;
      fontSize = appearance.terminalFontSize;
    } catch {
      theme = "dark";
    }
  }
  commitTerminalFontSize(fontSize);
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
