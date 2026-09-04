import { Terminal } from "@xterm/xterm";
import { describe, expect, it } from "vitest";
import { createNotificationParser, type TerminalNotification } from "./notificationProtocol";
const bytes = (value: string) => new TextEncoder().encode(value);
function parse(chunks: Uint8Array[]) {
  const events: TerminalNotification[] = [];
  const parser = createNotificationParser(event => events.push(event));
  chunks.forEach(chunk => parser.feed(chunk));
  return events;
}
describe("terminal notification protocol", () => {
  it("handles every UTF8 split and does not ring for an OSC terminator", () => {
    const input = bytes("\x1b]777;notify;任务;完成;更多\x07\x07\x1b]9;Done\x1b\\");
    const expected = [{ protocol: "osc777", title: "任务", body: "完成;更多" }, { protocol: "bell", title: "", body: "" }, { protocol: "osc9", title: "", body: "Done" }];
    for (let i = 0; i <= input.length; i++) expect(parse([input.slice(0, i), input.slice(i)])).toEqual(expected);
    expect(parse(Array.from(input, byte => Uint8Array.of(byte)))).toEqual(expected);
  });
  it("ignores directories, progress, other OSC and controls in DCS/APC/PM/SOS", () => {
    expect(parse([bytes("\x1b]7;file://host/path\x07\x1b]9;4;1;50\x07\x1b]99;;title\x07" + ["P", "_", "^", "X"].map(code => `\x1b${code}\x07\x1b]9;fake\x07\x1b\\`).join(""))])).toEqual([]);
  });
  it("recovers from overflow, cancellation and reset without leaking old strings", () => {
    expect(parse([bytes("\x1b]9;" + "x".repeat(10000) + "\x07\x1b]9;cancel\x18\x07")])).toEqual([{ protocol: "bell", title: "", body: "" }]);
    const events: TerminalNotification[] = [];
    const parser = createNotificationParser(event => events.push(event));
    parser.feed(bytes("\x1b]9;old")); parser.reset(); parser.feed(bytes("tail\x07"));
    expect(events).toEqual([{ protocol: "bell", title: "", body: "" }]);
  });
});

it("matches the real xterm parser on supported controls", async () => {
  const terminal = new Terminal({ allowProposedApi: true });
  const events: TerminalNotification[] = [];
  const { decodeNotification } = await import("./notificationProtocol");
  terminal.onBell(() => events.push({ protocol: "bell", title: "", body: "" }));
  for (const id of [9, 777]) terminal.parser.registerOscHandler(id, value => {
    const event = decodeNotification(`${id};${value}`); if (event) events.push(event); return true;
  });
  const input = bytes("text\x1b[31mred\x1b[0m\x1b]777;notify;标题;完成\x07\x07\x1b]9;4;1;50\x1b\\\x1bPpayload\x07\x1b\\\x1b]9;done\x1b\\");
  const chunks = Array.from(input, byte => Uint8Array.of(byte));
  for (const chunk of chunks) await new Promise<void>(resolve => terminal.write(chunk, resolve));
  expect(parse(chunks)).toEqual(events);
  terminal.dispose();
});
