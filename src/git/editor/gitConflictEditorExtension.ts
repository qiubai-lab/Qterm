import { RangeSet, StateField, type Extension, type Text } from "@codemirror/state";
import { Decoration, EditorView, GutterMarker, gutter, keymap, type DecorationSet } from "@codemirror/view";

export interface GitConflictBlock {
  from: number;
  to: number;
  startLine: number;
  baseLine: number | null;
  separatorLine: number;
  endLine: number;
}

type Direction = -1 | 1;

const START_MARKER = /^<{7}(?:\s|$)/;
const BASE_MARKER = /^\|{7}(?:\s|$)/;
const SEPARATOR_MARKER = /^={7}\s*$/;
const END_MARKER = /^>{7}(?:\s|$)/;

export function findGitConflictBlocks(document: string | Text): GitConflictBlock[] {
  const text = typeof document === "string" ? document : document.toString();
  const lines = text.split("\n");
  const offsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    offsets.push(offset);
    offset += line.length + 1;
  }

  const blocks: GitConflictBlock[] = [];
  let startLine = -1;
  let baseLine = -1;
  let separatorLine = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (START_MARKER.test(line)) {
      startLine = index;
      baseLine = -1;
      separatorLine = -1;
      continue;
    }
    if (startLine < 0) continue;
    if (separatorLine < 0 && baseLine < 0 && BASE_MARKER.test(line)) {
      baseLine = index;
      continue;
    }
    if (separatorLine < 0 && SEPARATOR_MARKER.test(line)) {
      separatorLine = index;
      continue;
    }
    if (separatorLine >= 0 && END_MARKER.test(line)) {
      blocks.push({
        from: offsets[startLine],
        to: offsets[index] + line.length,
        startLine: startLine + 1,
        baseLine: baseLine >= 0 ? baseLine + 1 : null,
        separatorLine: separatorLine + 1,
        endLine: index + 1,
      });
      startLine = -1;
      baseLine = -1;
      separatorLine = -1;
    }
  }
  return blocks;
}

export function nextGitConflictPosition(blocks: readonly GitConflictBlock[], position: number, direction: Direction): number | null {
  if (blocks.length === 0) return null;
  if (direction > 0) return blocks.find((block) => block.from > position)?.from ?? blocks[0].from;
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    if (blocks[index].from < position) return blocks[index].from;
  }
  return blocks[blocks.length - 1].from;
}

const conflictBlocksField = StateField.define<readonly GitConflictBlock[]>({
  create: (state) => findGitConflictBlocks(state.doc),
  update: (blocks, transaction) => transaction.docChanged ? findGitConflictBlocks(transaction.state.doc) : blocks,
});

const conflictDecorations = EditorView.decorations.compute([conflictBlocksField, "selection"], (state): DecorationSet => {
  const ranges: Array<ReturnType<Decoration["range"]>> = [];
  const addLine = (lineNumber: number, role: "marker" | "current" | "base" | "incoming", active: boolean) => {
    if (lineNumber < 1 || lineNumber > state.doc.lines) return;
    ranges.push(Decoration.line({ attributes: { class: `cm-git-conflict-${role}${active ? " cm-git-conflict-active" : ""}` } }).range(state.doc.line(lineNumber).from));
  };
  for (const block of state.field(conflictBlocksField)) {
    const active = state.selection.main.head >= block.from && state.selection.main.head <= block.to;
    addLine(block.startLine, "marker", active);
    const currentEnd = block.baseLine ?? block.separatorLine;
    for (let line = block.startLine + 1; line < currentEnd; line += 1) addLine(line, "current", active);
    if (block.baseLine) {
      addLine(block.baseLine, "marker", active);
      for (let line = block.baseLine + 1; line < block.separatorLine; line += 1) addLine(line, "base", active);
    }
    addLine(block.separatorLine, "marker", active);
    for (let line = block.separatorLine + 1; line < block.endLine; line += 1) addLine(line, "incoming", active);
    addLine(block.endLine, "marker", active);
  }
  return Decoration.set(ranges, true);
});

class ConflictGutterMarker extends GutterMarker {
  override toDOM() {
    const marker = document.createElement("span");
    marker.className = "cm-git-conflict-gutter-marker";
    marker.textContent = "!";
    marker.setAttribute("aria-hidden", "true");
    return marker;
  }
}

const conflictGutterMarker = new ConflictGutterMarker();
const conflictGutter = gutter({
  class: "cm-git-conflict-gutter",
  markers: (view) => RangeSet.of(view.state.field(conflictBlocksField).map((block) => conflictGutterMarker.range(block.from))),
});

const conflictTheme = EditorView.baseTheme({
  ".cm-git-conflict-marker": {
    color: "var(--warning)",
    backgroundColor: "color-mix(in srgb, var(--warning) 12%, transparent)",
  },
  ".cm-git-conflict-current": {
    backgroundColor: "color-mix(in srgb, var(--accent) 8%, transparent)",
  },
  ".cm-git-conflict-base": {
    backgroundColor: "color-mix(in srgb, var(--muted) 7%, transparent)",
  },
  ".cm-git-conflict-incoming": {
    backgroundColor: "color-mix(in srgb, var(--warning) 8%, transparent)",
  },
  ".cm-git-conflict-active": {
    backgroundImage: "linear-gradient(color-mix(in srgb, var(--focus) 5%, transparent), color-mix(in srgb, var(--focus) 5%, transparent))",
  },
  ".cm-git-conflict-gutter-marker": {
    color: "var(--warning)",
    fontSize: "9px",
    fontWeight: "800",
  },
});

export function goToGitConflict(view: EditorView, direction: Direction): boolean {
  const target = nextGitConflictPosition(view.state.field(conflictBlocksField), view.state.selection.main.head, direction);
  if (target === null) return false;
  view.dispatch({ selection: { anchor: target }, scrollIntoView: true });
  view.focus();
  return true;
}

const conflictKeymap = keymap.of([
  { key: "F7", run: (view) => goToGitConflict(view, 1) },
  { key: "Shift-F7", run: (view) => goToGitConflict(view, -1) },
]);

const extension: Extension = [conflictBlocksField, conflictDecorations, conflictGutter, conflictTheme, conflictKeymap];

export function gitConflictEditorExtension(): Extension {
  return extension;
}
