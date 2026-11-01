import type { Terminal } from "@xterm/xterm";
import { isServer } from "../lib/runtime/environment";

/** The server owns terminal responses and snapshot sizing; desktop parsing is unchanged. */
export function bindServerScreen(terminal: Terminal, blockId: () => string | undefined, fit: () => void, restoreCwd: (cwd:string) => void) {
  if (!isServer) return {dispose: () => undefined};
  let locked = false;
  let columns = terminal.cols, rows = terminal.rows;
  const handlers = [
    terminal.parser.registerCsiHandler({final:"n"}, () => true),
    terminal.parser.registerCsiHandler({prefix:"?",final:"n"}, () => true),
    terminal.parser.registerCsiHandler({final:"c"}, () => true),
    terminal.parser.registerCsiHandler({prefix:">",final:"c"}, () => true),
    terminal.parser.registerOscHandler(10, () => true),
    terminal.parser.registerOscHandler(11, () => true),
    terminal.onResize(size => {
      if (locked && (size.cols !== columns || size.rows !== rows)) terminal.resize(columns,rows);
    }),
  ];
  const listener = (event: Event) => {
    const value = (event as CustomEvent<{runtimeKey:string;phase:string;columns?:number;rows?:number;cwd?:string;readOnly:boolean}>).detail;
    if (value.runtimeKey !== blockId()) return;
    if (value.phase === "start" && value.columns && value.rows) {
      locked = true; columns = value.columns; rows = value.rows;
      terminal.reset(); terminal.resize(columns,rows);
      if (value.cwd) restoreCwd(value.cwd);
    } else if (value.phase === "geometry" && value.columns && value.rows) {
      const nextColumns = value.columns, nextRows = value.rows;
      terminal.write("", () => { columns=nextColumns;rows=nextRows;terminal.resize(columns,rows); });
    } else if (value.phase === "end" || value.phase === "access") {
      locked = value.readOnly;
      if (!locked) requestAnimationFrame(fit);
    }
  };
  window.addEventListener("qterm:server-screen",listener);
  return {dispose: () => {window.removeEventListener("qterm:server-screen",listener);for (const handler of handlers) handler.dispose();}};
}
