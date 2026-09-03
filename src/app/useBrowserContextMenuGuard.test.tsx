import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// @ts-expect-error Node built-in types are intentionally absent from the browser production config.
import { readFileSync } from "node:fs";

import { useBrowserContextMenuGuard } from "./useBrowserContextMenuGuard";

afterEach(cleanup);

function Harness({ onContextMenu }: { onContextMenu?: () => void }) {
  useBrowserContextMenuGuard();
  return <div data-testid="surface" onContextMenu={onContextMenu}>Qterm surface</div>;
}

describe("useBrowserContextMenuGuard", () => {
  it("prevents the embedded browser menu on a surface without a Qterm menu", () => {
    render(<Harness/>);
    expect(fireEvent.contextMenu(screen.getByTestId("surface"))).toBe(false);
  });

  it("keeps component-owned context-menu handlers reachable", () => {
    const onContextMenu = vi.fn();
    render(<Harness onContextMenu={onContextMenu}/>);
    expect(fireEvent.contextMenu(screen.getByTestId("surface"))).toBe(false);
    expect(onContextMenu).toHaveBeenCalledOnce();
  });

  it("removes the document guard when its owner unmounts", () => {
    const view = render(<Harness/>);
    view.unmount();
    const surface = document.createElement("div");
    document.body.append(surface);
    expect(fireEvent.contextMenu(surface)).toBe(true);
    surface.remove();
  });

  it("registers only the context-menu event lifecycle", () => {
    const source = readFileSync("src/app/useBrowserContextMenuGuard.ts", "utf8");
    expect(source).toContain('addEventListener("contextmenu"');
    expect(source).not.toMatch(/addEventListener\("(?:pointer|mouse|key|copy|cut|paste|select)/);
  });
});
