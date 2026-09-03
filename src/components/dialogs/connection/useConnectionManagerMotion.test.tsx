import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { ConnectionProfile } from "../../../lib/tauri/profiles";
import { ConnectionSelectionIndicator } from "./ConnectionSelectionIndicator";
import { useConnectionManagerMotion } from "./useConnectionManagerMotion";

const profiles: ConnectionProfile[] = ["first", "second"].map((id) => ({
  id, name: id, host: "example.test", port: 22, username: "root",
  authPreference: "sshAgent", credentialId: null, groupId: null,
}));
const groups = [{ id: "above", name: "Above" }];
const collapsedGroupIds = new Set<string>();

function Harness({ collapsed, selectedId }: { collapsed: boolean; selectedId: string }) {
  const { listRef, indicator } = useConnectionManagerMotion({ selectedId, profiles, groups, collapsedGroupIds, ungroupedCollapsed: collapsed });
  return <div ref={listRef}>
    <ConnectionSelectionIndicator state={indicator}/>
    <section className="connection-group-section">
      {profiles.map((profile) => <button key={profile.id} data-profile-id={profile.id}>{profile.name}</button>)}
    </section>
  </div>;
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("snaps to the same row after group reflow but still animates a new selection", async () => {
  let firstRowTop = 500;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return { top: this.dataset.profileId === "first" ? firstRowTop : this.dataset.profileId === "second" ? 80 : 0 } as DOMRect;
  });
  const { container, rerender } = render(<Harness collapsed={false} selectedId="first"/>);
  const indicator = container.querySelector(".connection-selection-indicator")!;
  await waitFor(() => expect(indicator).toHaveClass("ready"));
  expect(indicator).toHaveStyle({ "--connection-selection-y": "500px" });

  firstRowTop = 30;
  rerender(<Harness collapsed selectedId="first"/>);
  expect(indicator).toHaveStyle({ "--connection-selection-y": "30px" });
  expect(indicator).not.toHaveClass("ready");

  rerender(<Harness collapsed selectedId="second"/>);
  expect(indicator).toHaveAttribute("data-target-id", "second");
  expect(indicator).toHaveStyle({ "--connection-selection-y": "80px" });
  expect(indicator).toHaveClass("ready");
});
