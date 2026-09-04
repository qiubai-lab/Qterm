export interface TerminalNotification { protocol: "bell" | "osc9" | "osc777"; title: string; body: string }
const MAX_OSC_LENGTH = 8192;
const clean = (value: string, limit: number) => Array.from(value).filter(char => {
  const code = char.codePointAt(0)!;
  return code >= 32 && !(code >= 127 && code <= 159) && !(code >= 0x202a && code <= 0x202e) && !(code >= 0x2066 && code <= 0x2069);
}).slice(0, limit).join("").trim();

export function decodeNotification(payload: string): TerminalNotification | null {
  if (payload.startsWith("9;")) {
    const body = payload.slice(2);
    // Numeric OSC 9 subcommands include progress and ConEmu controls, not messages.
    if (/^\d+(?:;|$)/.test(body)) return null;
    const text = clean(body, 4096);
    return text ? { protocol: "osc9", title: "", body: text } : null;
  }
  if (!payload.startsWith("777;notify;")) return null;
  const value = payload.slice(11);
  const separator = value.indexOf(";");
  if (separator < 0) return null;
  const title = clean(value.slice(0, separator), 128);
  const body = clean(value.slice(separator + 1), 4096);
  return title || body ? { protocol: "osc777", title, body } : null;
}

/** Bounded observer of 7-bit VT control strings. Never rewrites terminal output. */
export function createNotificationParser(emit: (event: TerminalNotification) => void) {
  let decoder = new TextDecoder();
  const groundControls = new RegExp(`[${String.fromCharCode(7, 27)}]`, "g");
  let state: "ground" | "escape" | "osc" | "oscEscape" | "string" | "stringEscape" = "ground";
  let payload = "";
  let overflow = false;
  const reset = () => { state = "ground"; payload = ""; overflow = false; };
  const finish = () => {
    const event = overflow ? null : decodeNotification(payload);
    reset();
    if (event) emit(event);
  };
  const escape = (char: string) => {
    if (char === "]") { state = "osc"; payload = ""; overflow = false; }
    else if ("PX^_".includes(char)) state = "string";
    else state = char === "\x1b" ? "escape" : "ground";
  };
  return {
    feed(data: Uint8Array) {
      const text = decoder.decode(data, { stream: true });
      for (let index = 0; index < text.length; index++) {
        if (state === "ground") {
          groundControls.lastIndex = index;
          const control = groundControls.exec(text);
          if (!control) break;
          index = control.index;
        }
        const char = text[index];
        if (char === "\x18" || char === "\x1a") { reset(); continue; }
        if (state === "string" || state === "stringEscape") {
          if (state === "stringEscape" && char === "\\") reset();
          else state = char === "\x1b" ? "stringEscape" : "string";
        } else if (state === "oscEscape") {
          if (char === "\\") finish();
          else { reset(); escape(char); }
        } else if (state === "osc") {
          if (char === "\x07") finish();
          else if (char === "\x1b") state = "oscEscape";
          else if (!overflow) {
            if (payload.length + char.length > MAX_OSC_LENGTH) { overflow = true; payload = ""; }
            else payload += char;
          }
        } else if (char === "\x07") {
          emit({ protocol: "bell", title: "", body: "" });
        } else if (state === "escape") escape(char);
        else if (char === "\x1b") state = "escape";
      }
    },
    reset() { reset(); decoder = new TextDecoder(); },
  };
}
