import { useCallback, useState, type RefObject } from "react";
import type { Terminal } from "@xterm/xterm";
import { currentDocumentTheme } from "../../app/theme/AppThemeProvider";
import type { AppTheme } from "../../lib/tauri/settings";
import { currentDesktopPlatform } from "../../lib/tauri/window";
import { imageExportError, type TerminalImageSnapshot, type TerminalImageStyle } from "./terminalImageModel";
import { captureTerminalImage, measureTerminalImage } from "./terminalImageSnapshot";

export interface TerminalImageRequest {
  sessionKey: string;
  snapshot: TerminalImageSnapshot | null;
  error: string;
  theme: AppTheme;
  style: TerminalImageStyle;
}

export function useTerminalImageExport(view: RefObject<{ terminal: Terminal } | null>, surface: RefObject<HTMLElement | null>, sessionKey: string, restoreFocus: () => void) {
  const [request, setRequest] = useState<TerminalImageRequest | null>(null);
  const open = useCallback(() => {
    const terminal = view.current?.terminal;
    const element = surface.current;
    const result: TerminalImageRequest = { sessionKey, snapshot: null, error: "", theme: currentDocumentTheme(), style: currentDesktopPlatform() };
    try {
      if (!terminal || !element) throw new Error("终端尚未就绪，请稍后重试");
      result.snapshot = captureTerminalImage(terminal, measureTerminalImage(terminal, element));
    } catch (reason) { result.error = imageExportError(reason, "无法读取选中的终端行"); }
    setRequest(result);
  }, [sessionKey, surface, view]);
  const close = useCallback(() => { setRequest(null); restoreFocus(); }, [restoreFocus]);
  return { request: request?.sessionKey === sessionKey ? request : null, open, close };
}
