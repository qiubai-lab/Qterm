import { expect, it, vi } from "vitest";
import { readNativeClipboard } from "./clipboard";
import { invoke } from "@tauri-apps/api/core";
vi.mock("@tauri-apps/api/core",()=>({invoke:vi.fn()}));
it("reads desktop clipboard without requiring the browser clipboard API", async () => {
  vi.mocked(invoke).mockResolvedValue({text:"native text",files:[{name:"clipboard.png",data:"AQID"}]});
  const value=await readNativeClipboard();
  expect(invoke).toHaveBeenCalledWith("remote_runtime_clipboard");
  expect(value.text).toBe("native text"); expect(value.files[0].name).toBe("clipboard.png"); expect(value.files[0].size).toBe(3);
});
