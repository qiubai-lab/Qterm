import type { ComponentProps } from "react";
import { supportsWebBlocks, webSupportNotice } from "../web/webModel";
import { openFileWindowAction } from "./fileWindow";
import { openGitWindowAction } from "./gitWindow";
import { openNetworkWindowAction } from "./networkWindow";
import { useWorkspace } from "./WorkspaceProvider";
import { WorkspaceUtilityRail } from "./WorkspaceUtilityRail";

type ShellControls = Pick<NonNullable<ComponentProps<typeof WorkspaceUtilityRail>["controls"]>, "connections" | "credentials" | "lock" | "settings" | "help">;

/** Desktop block-opening actions; dialog and lock state remain with the shell. */
export function WorkspaceToolRail({ controls, remoteShellIntegrationEnabled }: { controls: ShellControls; remoteShellIntegrationEnabled: boolean }) {
  const { activeWorkspace, runtimes, dispatch, splitTerminalBlock } = useWorkspace();
  const browserSupported = supportsWebBlocks();
  return <WorkspaceUtilityRail controls={{
    ...controls,
    files: { onClick: () => dispatch(openFileWindowAction(activeWorkspace, runtimes, remoteShellIntegrationEnabled)) },
    network: { onClick: () => dispatch(openNetworkWindowAction(activeWorkspace)) },
    git: { onClick: () => dispatch(openGitWindowAction(activeWorkspace, runtimes)) },
    terminal: { onClick: () => splitTerminalBlock(activeWorkspace.id, activeWorkspace.activeBlockId, "horizontal", remoteShellIntegrationEnabled) },
    browser: {
      disabled: !browserSupported,
      title: browserSupported ? undefined : webSupportNotice(),
      onClick: () => dispatch({ type: "openWeb", workspaceId: activeWorkspace.id, anchorBlockId: activeWorkspace.activeBlockId, profileId: null }),
    },
  }}/>;
}
