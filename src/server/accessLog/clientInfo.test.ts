import { expect, it } from "vitest";
import { clientInfo } from "./clientInfo";
import { reasonLabel, type AccessEvent } from "./model";
const event = (browser: string | null, kind: AccessEvent["kind"] = "connected", reason = "presenceReady") => ({
  source: { browser, ip: null, session: null }, kind, reason,
});

it.each([
  ["macos", "aarch64", "macOS · arm64"],
  ["windows", "x86_64", "Windows · x64"],
  ["linux", "x86", "Linux · x86"],
])("identifies desktop %s metadata consistently across session events", (os, arch, detail) => {
  for (const kind of ["login", "resume", "connected", "disconnected", "workbenchLock", "workbenchUnlock"] as const) {
    expect(clientInfo(event(`Qterm Desktop/1.2.3 (${os}; ${arch})`, kind))).toEqual({
      label: "Qterm 桌面端", detail: `${detail} · 版本 1.2.3`, icon: "computer",
    });
  }
});
it("reads historical desktop records without inventing missing platform metadata", () => {
  expect(clientInfo(event("Qterm Desktop/0.9.0"))).toEqual({ label: "Qterm 桌面端", detail: "版本 0.9.0", icon: "computer" });
});
it.each([
  ["Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36 Edg/130.1", "Edge", "Windows"],
  ["Mozilla/5.0 (X11; Linux x86_64) Firefox/132.0", "Firefox", "Linux"],
  ["Mozilla/5.0 (Macintosh) Chrome/130.0 Safari/537.36", "Chrome", "macOS"],
  ["Mozilla/5.0 (Macintosh) Version/18.0 Safari/605.1.15", "Safari", "macOS"],
  ["Mozilla/5.0 (iPhone) CriOS/130.0 Safari/604.1", "Chrome", "iOS"],
  ["Mozilla/5.0 (Android) Chrome/130.0 EdgA/130.1", "Edge", "Android"],
  ["Mozilla/5.0 Chrome/130.0 Safari/537.36 OPR/115.0", "Opera", null],
])("recognizes browser product before its compatibility tokens: %s", (agent, label, os) => {
  const info = clientInfo(event(agent));
  expect(info.label).toBe(label);
  expect(info.icon).toBe("browser");
  if (os) expect(info.detail).toContain(os);
});
it("distinguishes absent metadata from explicit system events and unrecognized clients", () => {
  for (const agent of [null, "", "  "]) expect(clientInfo(event(agent)).label).toBe("未知客户端");
  expect(clientInfo(event(null, "vaultLock", "timeout")).label).toBe("系统");
  expect(clientInfo(event("curl/8.0")).label).toBe("其他客户端");
  expect(reasonLabel("connectionClosed")).toBe("客户端连接已结束");
});
