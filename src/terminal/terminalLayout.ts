import type { FitAddon } from "@xterm/addon-fit";
import type { Terminal } from "@xterm/xterm";
import { createResizeScheduler } from "./resizeScheduler";

type LayoutTerminal = Pick<Terminal, "cols" | "rows" | "options" | "write" | "refresh">;
type LayoutFit = Pick<FitAddon, "fit" | "proposeDimensions">;

export interface TerminalLayout {
  restore: (force?: boolean) => boolean;
  dispose: () => void;
}

// ConPTY sends screen repaints asynchronously after resize returns. Keep both
// grids stable during a drag instead of parsing those repaints at interim sizes.
const CONPTY_SETTLE_MS = 120;

export function createTerminalLayout(
  terminal: LayoutTerminal,
  fit: LayoutFit,
  send: (columns: number, rows: number) => Promise<void>,
  resizeDelayMs = 0,
): TerminalLayout {
  const scheduler = createResizeScheduler(send, terminal.options.windowsPty?.backend === "conpty" ? 0 : resizeDelayMs);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  let disposed = false;
  let forced = false;
  const apply = () => {
    fit.fit();
    terminal.refresh(0, Math.max(0, terminal.rows - 1));
    scheduler.request(terminal.cols, terminal.rows, forced);
    forced = false;
  };
  return {
    restore(force = false) {
      if (disposed) return false;
      const dimensions = fit.proposeDimensions();
      if (!dimensions || !Number.isFinite(dimensions.cols) || !Number.isFinite(dimensions.rows) || dimensions.cols < 2 || dimensions.rows < 1) return false;
      forced ||= force;
      if (terminal.options.windowsPty?.backend !== "conpty") {
        apply();
        return true;
      }
      clearTimeout(timer);
      const current = ++generation;
      timer = setTimeout(() => {
        timer = undefined;
        // Drain already-delivered bytes at the old size before changing the grid.
        terminal.write("", () => {
          if (!disposed && current === generation) apply();
        });
      }, CONPTY_SETTLE_MS);
      return true;
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
      scheduler.dispose();
    },
  };
}
