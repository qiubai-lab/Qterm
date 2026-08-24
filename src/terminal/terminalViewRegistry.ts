interface TerminalController {
  focus: () => void;
  openSearch: () => void;
}

const controllers = new Map<string, { owner: symbol; controller: TerminalController }>();

export function registerTerminalController(blockId: string, controller: TerminalController): () => void {
  const owner = Symbol(blockId);
  controllers.set(blockId, { owner, controller });
  return () => {
    if (controllers.get(blockId)?.owner === owner) controllers.delete(blockId);
  };
}

export function focusTerminalBlock(blockId: string): boolean {
  const controller = controllers.get(blockId)?.controller;
  if (!controller) return false;
  controller.focus();
  return true;
}

export function openTerminalSearch(blockId: string): boolean {
  const controller = controllers.get(blockId)?.controller;
  if (!controller) return false;
  controller.openSearch();
  return true;
}
