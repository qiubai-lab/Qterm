import { TerminalExternalLinkConfirmationHost } from "../terminal/TerminalExternalLinkConfirmation";
import { resolveWebLinkOrigin } from "../web/webLinkOrigin";
import { supportsWebBlocks } from "../web/webModel";
import { useWorkspace } from "./WorkspaceProvider";

export function WorkspaceTerminalLinkHost() {
  const { document, profiles, openTerminalWebLink } = useWorkspace();
  return <TerminalExternalLinkConfirmationHost
    internalSupported={supportsWebBlocks}
    resolveOrigin={blockId => resolveWebLinkOrigin(document, profiles, blockId)}
    onOpenInternal={openTerminalWebLink}
  />;
}
