import { afterEach, describe, expect, it, vi } from "vitest";

const { createImageResource, writeImage } = vi.hoisted(() => ({
  createImageResource: vi.fn(),
  writeImage: vi.fn(),
}));

vi.mock("@tauri-apps/api/image", () => ({ Image: { new: createImageResource } }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeImage }));

import { copyImageUrlToClipboard } from "./clipboard";

describe("clipboard image adapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    createImageResource.mockReset();
    writeImage.mockReset();
  });

  it("decodes a browser image to RGBA, writes it, and releases the Tauri resource", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const resource = { close };
    const drawImage = vi.fn();
    const pixels = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);
    createImageResource.mockResolvedValue(resource);
    writeImage.mockResolvedValue(undefined);
    vi.stubGlobal("Image", class {
      naturalWidth = 2;
      naturalHeight = 1;
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    });
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      if (tagName !== "canvas") return originalCreateElement(tagName, options);
      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage, getImageData: () => ({ data: pixels }) }),
      } as unknown as HTMLCanvasElement;
    }) as typeof document.createElement);

    await copyImageUrlToClipboard("blob:qterm-image");

    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(createImageResource).toHaveBeenCalledWith(expect.any(Uint8Array), 2, 1);
    expect(writeImage).toHaveBeenCalledWith(resource);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("still releases the image resource when the clipboard write fails", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    createImageResource.mockResolvedValue({ close });
    writeImage.mockRejectedValue(new Error("clipboard unavailable"));
    vi.stubGlobal("Image", class {
      naturalWidth = 1;
      naturalHeight = 1;
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    });
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tagName: string, options?: ElementCreationOptions) => tagName === "canvas"
      ? { width: 0, height: 0, getContext: () => ({ drawImage: vi.fn(), getImageData: () => ({ data: new Uint8ClampedArray(4) }) }) } as unknown as HTMLCanvasElement
      : originalCreateElement(tagName, options)) as typeof document.createElement);

    await expect(copyImageUrlToClipboard("blob:qterm-image")).rejects.toThrow("clipboard unavailable");
    expect(close).toHaveBeenCalledTimes(1);
  });
});
