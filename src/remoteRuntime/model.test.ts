import { expect, it } from "vitest";
import { normalizeEndpoint, serverEntry } from "./model";
it("normalizes endpoint and derives a recognizable name", () => {
  expect(serverEntry(" ", " http://EXAMPLE.com:8080/ ", "a")).toEqual({id:"a",name:"example.com:8080",endpoint:"http://example.com:8080"});
});
it.each(["file:///tmp/test", "javascript:alert(1)", "https://user:password@example.com", "https://example.com/api", "https://example.com?token=secret", "https://example.com/#token", "example.com"])("rejects ambiguous or credential-bearing endpoint %s", value => {
  expect(() => normalizeEndpoint(value)).toThrow();
});
