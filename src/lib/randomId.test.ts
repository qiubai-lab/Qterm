import { afterEach, describe, expect, it, vi } from "vitest";
import { randomId } from "./randomId";

afterEach(() => vi.unstubAllGlobals());

describe("secure random IDs", () => {
  it("uses native UUIDs when available", () => {
    const expected = "e4f7f9be-af67-4bde-8f40-3f881d22ee83";
    vi.stubGlobal("crypto", { randomUUID: () => expected });
    expect(randomId()).toBe(expected);
  });

  it("generates independent UUID v4 values on HTTP without randomUUID", () => {
    const getRandomValues = crypto.getRandomValues.bind(crypto);
    vi.stubGlobal("crypto", { getRandomValues });
    const values = Array.from({ length: 100 }, () => randomId());
    expect(new Set(values).size).toBe(100);
    for (const value of values) {
      expect(value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });

  it("does not fall back to predictable randomness when crypto is absent", () => {
    vi.stubGlobal("crypto", undefined);
    expect(() => randomId()).toThrow("安全随机数");
  });
});
