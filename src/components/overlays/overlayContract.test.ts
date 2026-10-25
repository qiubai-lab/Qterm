// @ts-expect-error Vitest runs in Node; the frontend config intentionally omits Node declarations.
import { readdirSync, readFileSync } from "node:fs";
// @ts-expect-error Vitest runs in Node; the frontend config intentionally omits Node declarations.
import { join } from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";

it("requires explicit paint registration for every application menu, tooltip and dialog", () => {
  const missing: string[] = [];
  function inspect(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) { inspect(path); continue; }
      if (!path.endsWith(".tsx") || path.endsWith(".test.tsx")) continue;
      const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      function visit(node: ts.Node) {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const attrs = node.attributes.properties.filter(ts.isJsxAttribute);
          const role = attrs.find(attr => attr.name.getText(source) === "role")?.initializer;
          if (role && ts.isStringLiteral(role) && ["menu", "dialog", "tooltip"].includes(role.text)
            && !attrs.some(attr => attr.name.getText(source) === "data-app-overlay")) {
            missing.push(`${path}:${source.getLineAndCharacterOfPosition(node.pos).line + 1}`);
          }
          if (role && ts.isStringLiteral(role) && role.text === "tooltip") {
            const motion = attrs.find(attr => attr.name.getText(source) === "data-overlay-motion")?.initializer;
            if (!motion || !ts.isStringLiteral(motion) || motion.text !== "hover") {
              missing.push(`${path}:${source.getLineAndCharacterOfPosition(node.pos).line + 1}: tooltip must use shared hover motion`);
            }
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  inspect("src");
  expect(missing, "New overlays must declare paint policy independently of ARIA semantics").toEqual([]);
});
