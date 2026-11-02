import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); sessionStorage.clear(); });

it("loads page identity on HTTP and retains independent page proofs", async () => {
  vi.stubGlobal("crypto", { getRandomValues: crypto.getRandomValues.bind(crypto) });
  const first = await import("./accessIdentity");
  const firstId = first.accessProof().clientId;
  expect(firstId).toMatch(/^[0-9a-f-]{36}$/);
  first.rememberAccess("fixture-access-key");
  expect(first.accessHeaders()["X-Qterm-Access"]).toBe("fixture-access-key");
  vi.resetModules();
  const second = await import("./accessIdentity");
  expect(second.accessProof()).toEqual({ clientId: expect.any(String), accessKey: "fixture-access-key" });
  expect(second.accessProof().clientId).not.toBe(firstId);
});
