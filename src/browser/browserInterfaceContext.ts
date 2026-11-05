import { createContext, useContext } from "react";
export type InterfaceMode = "auto" | "desktop" | "touch";
export type KeybarMode = "auto" | "show" | "hide";
export type Preferences = { mode: InterfaceMode; keybar: KeybarMode };
export const defaults: Preferences = { mode: "auto", keybar: "auto" };
interface BrowserInterfaceState {
  enabled: boolean;
  touch: boolean;
  showKeybar: boolean;
  preferences: Preferences;
  update: (value: Partial<Preferences>) => void;
}
export const BrowserInterfaceContext = createContext<BrowserInterfaceState>({ enabled:false, touch:false, showKeybar:false, preferences:defaults, update:()=>{} });
export const useBrowserInterface = () => useContext(BrowserInterfaceContext);
