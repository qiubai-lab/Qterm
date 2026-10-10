/* eslint-disable react-refresh/only-export-components -- preference provider and hook share a feature boundary. */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { getSettings, type TerminalSettings } from "@qterm/services/settings";

type TitleSettings = Pick<TerminalSettings, "applicationTitleEnabled">;
const Context = createContext<{ enabled: boolean; applySettings: (settings: TitleSettings) => void }>({ enabled: false, applySettings: () => undefined });
export const useTerminalTitlePreference = () => useContext(Context);

/** Owns the live display preference; SettingsDialog owns persistence and errors. */
export function TerminalTitleProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const revision = useRef(0);
  const applySettings = useCallback((settings: TitleSettings) => {
    revision.current++;
    setEnabled(settings.applicationTitleEnabled ?? false);
  }, []);
  useEffect(() => {
    let live = true;
    const initialRevision = revision.current;
    void getSettings().then(snapshot => {
      if (live && revision.current === initialRevision) applySettings(snapshot.terminal);
    }).catch(() => undefined);
    return () => { live = false; };
  }, [applySettings]);
  return <Context.Provider value={{ enabled, applySettings }}>{children}</Context.Provider>;
}
