import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ConnectionProfile } from "../../lib/tauri/profiles";
import { ConnectionDialog } from "./ConnectionDialog";

const mocks = vi.hoisted(() => ({ createProfile: vi.fn(), refreshProfiles: vi.fn() }));
const profile: ConnectionProfile = {
  id: "profile-1", name: "K8S服务器", host: "10.100.5.28", port: 22,
  username: "root", authPreference: "sshAgent", credentialId: null, groupId: "group-1",
};
let workspaceProfiles: ConnectionProfile[] = [];

vi.mock("../../lib/tauri/profiles", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../lib/tauri/profiles")>(),
  createProfile: mocks.createProfile,
  listProfileGroups: vi.fn(async () => [{ id: "group-1", name: "Production" }]),
}));
vi.mock("../../lib/tauri/credentials", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../lib/tauri/credentials")>(),
  getVaultStatus: vi.fn(async () => ({ initialized: false, unlocked: false })),
  listCredentials: vi.fn(async () => []),
}));
vi.mock("../../workspace/WorkspaceProvider", () => ({
  useWorkspace: () => ({
    profiles: workspaceProfiles,
    refreshProfiles: mocks.refreshProfiles,
    activeWorkspace: {
      layout: { type: "terminal", blockId: "block-1", profileId: "profile-1", restoreDirectory: null },
    },
    activeBlockId: "block-1",
    selectBlockTarget: vi.fn(),
  }),
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("connection list overflow after copying", () => {
  it.each(["group-1", null])("removes the copied row's selection surface when its group is collapsed (%s)", async (groupId) => {
    workspaceProfiles = [{ ...profile, groupId }];
    const duplicate = { ...profile, groupId, id: "profile-copy", name: "K8S服务器 副本" };
    mocks.createProfile.mockResolvedValue(duplicate);
    mocks.refreshProfiles.mockImplementation(async () => { workspaceProfiles = [...workspaceProfiles, duplicate]; });
    const user = userEvent.setup();
    render(<ConnectionDialog onClose={vi.fn()}/>);

    const toggle = (await screen.findByText(groupId ? "Production" : "未分组", { selector: ".connection-group-toggle strong" })).closest("button")!;
    await user.click(toggle);
    fireEvent.contextMenu(screen.getByRole("button", { name: /^K8S服务器root@/ }));
    await user.click(screen.getByRole("menuitem", { name: "复制连接" }));
    await waitFor(() => expect(document.querySelector(".connection-selection-indicator.visible")).toHaveAttribute("data-target-id", duplicate.id));

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(document.querySelector(`[data-profile-id="${duplicate.id}"]`)).not.toBeInTheDocument();
    expect(document.querySelector(".connection-selection-indicator")).not.toBeInTheDocument();
    expect(screen.getByLabelText("名称")).toHaveValue(duplicate.name);

    await user.click(toggle);
    expect(document.querySelector(".connection-selection-indicator.visible")).toHaveAttribute("data-target-id", duplicate.id);
    await user.click(toggle);
    expect(document.querySelector(".connection-selection-indicator")).not.toBeInTheDocument();
  });

});
