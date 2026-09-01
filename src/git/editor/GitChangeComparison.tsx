import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { minimalSetup } from "codemirror";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { yaml } from "@codemirror/lang-yaml";
import { MergeView } from "@codemirror/merge";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";

import type { EditorLanguage } from "../../files/CodeEditor";
import {
  buildOverviewMarkers,
  clamp,
  type OverviewMarker,
  type OverviewSegment,
  overviewScrollTopForKey,
  overviewScrollTopForPointer,
} from "./gitDiffOverviewModel";

interface OverviewLayout {
  markers: OverviewMarker[];
  visible: boolean;
  thumbTop: number;
  thumbHeight: number;
  scrollTop: number;
  scrollMax: number;
  changeCount: number;
}

interface ComparisonMeasurement {
  overview: OverviewLayout;
  gutterWidths: readonly [number, number];
}

const hiddenOverview: OverviewLayout = {
  markers: [],
  visible: false,
  thumbTop: 0,
  thumbHeight: 24,
  scrollTop: 0,
  scrollMax: 0,
  changeCount: 0,
};

export function GitChangeComparison({ before, after, beforeLabel, afterLabel, language }: {
  before: string;
  after: string;
  beforeLabel: string;
  afterLabel: string;
  language: EditorLanguage;
}) {
  const host = useRef<HTMLDivElement>(null);
  const overviewTrack = useRef<HTMLDivElement>(null);
  const scrollElement = useRef<HTMLElement | null>(null);
  const drag = useRef<{ pointerId: number; startY: number; startScrollTop: number } | null>(null);
  const [overview, setOverview] = useState<OverviewLayout>(hiddenOverview);
  const scrollId = `git-diff-scroll-${useId().replace(/:/g, "")}`;

  useEffect(() => {
    if (!host.current) return;
    setOverview(hiddenOverview);
    const mergeView = new MergeView({
      a: { doc: before, extensions: comparisonExtensions(language, beforeLabel) },
      b: { doc: after, extensions: comparisonExtensions(language, afterLabel) },
      parent: host.current,
      orientation: "a-b",
      highlightChanges: true,
      gutter: true,
      diffConfig: { timeout: 250 },
    });
    const scroller = mergeView.dom;
    scroller.id = scrollId;
    scrollElement.current = scroller;
    let scrollFrame = 0;
    let secondMeasureFrame = 0;

    const measure = () => mergeView.a.requestMeasure({
      read: (): ComparisonMeasurement => ({
        overview: measureOverview(mergeView, scroller, overviewTrack.current?.clientHeight ?? 0),
        gutterWidths: [measureGutterWidth(mergeView.a), measureGutterWidth(mergeView.b)],
      }),
      write: ({ overview: layout, gutterWidths }) => {
        applyGutterWidth(mergeView.a, gutterWidths[0]);
        applyGutterWidth(mergeView.b, gutterWidths[1]);
        setOverview(layout);
      },
    });
    const updateViewport = () => {
      cancelAnimationFrame(scrollFrame);
      scrollFrame = requestAnimationFrame(() => setOverview((current) => overviewWithScroll(
        current,
        scroller,
        overviewTrack.current?.clientHeight ?? 0,
      )));
    };
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);

    scroller.addEventListener("scroll", updateViewport, { passive: true });
    resizeObserver?.observe(scroller);
    if (overviewTrack.current) resizeObserver?.observe(overviewTrack.current);
    window.addEventListener("resize", measure);
    measure();
    secondMeasureFrame = requestAnimationFrame(measure);

    return () => {
      cancelAnimationFrame(scrollFrame);
      cancelAnimationFrame(secondMeasureFrame);
      scroller.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", measure);
      resizeObserver?.disconnect();
      scrollElement.current = null;
      mergeView.destroy();
    };
  }, [after, afterLabel, before, beforeLabel, language, scrollId]);

  function setSharedScrollTop(next: number) {
    const scroller = scrollElement.current;
    if (!scroller) return;
    scroller.scrollTop = clamp(next, 0, Math.max(0, scroller.scrollHeight - scroller.clientHeight));
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !overview.visible) return;
    const scroller = scrollElement.current;
    if (!scroller) return;
    const onThumb = (event.target as HTMLElement).closest(".git-diff-overview-viewport");
    const bounds = event.currentTarget.getBoundingClientRect();
    const next = onThumb
      ? scroller.scrollTop
      : overviewScrollTopForPointer(event.clientY - bounds.top, bounds.height, scroller.scrollHeight, scroller.clientHeight);
    setSharedScrollTop(next);
    drag.current = { pointerId: event.pointerId, startY: event.clientY, startScrollTop: next };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const trackTravel = Math.max(1, event.currentTarget.clientHeight - overview.thumbHeight);
    setSharedScrollTop(active.startScrollTop + (event.clientY - active.startY) / trackTravel * overview.scrollMax);
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (!overview.visible) return;
    setSharedScrollTop((scrollElement.current?.scrollTop ?? 0) + event.deltaY);
    event.preventDefault();
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const scroller = scrollElement.current;
    if (!scroller || !overview.visible) return;
    const next = overviewScrollTopForKey(event.key, scroller.scrollTop, overview.scrollMax, scroller.clientHeight);
    if (next === null) return;
    setSharedScrollTop(next);
    event.preventDefault();
  }

  return <div className="git-change-comparison-shell">
    <div ref={host} className="git-change-comparison file-code-editor" data-read-only aria-label="Git 更改差异"/>
    <div
      ref={overviewTrack}
      className="git-diff-overview"
      data-visible={overview.visible || undefined}
      role="scrollbar"
      aria-label={`差异概览，共 ${overview.changeCount} 处变更`}
      aria-controls={scrollId}
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={Math.round(overview.scrollMax)}
      aria-valuenow={Math.round(overview.scrollTop)}
      aria-hidden={!overview.visible}
      tabIndex={overview.visible ? 0 : -1}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onWheel={handleWheel}
      onKeyDown={handleKeyDown}
    >
      {overview.markers.map((marker) => <span
        key={marker.id}
        className="git-diff-overview-marker"
        data-kind={marker.kind}
        style={{ top: marker.top, height: marker.height }}
        aria-hidden="true"
      />)}
      <span
        className="git-diff-overview-viewport"
        style={{ top: overview.thumbTop, height: overview.thumbHeight }}
        aria-hidden="true"
      />
    </div>
  </div>;
}

function measureGutterWidth(view: EditorView): number {
  return view.dom.querySelector<HTMLElement>(".cm-gutters")?.getBoundingClientRect().width ?? 0;
}

function applyGutterWidth(view: EditorView, width: number) {
  view.dom.closest<HTMLElement>(".cm-mergeViewEditor")?.style.setProperty("--git-diff-gutter-width", `${Math.ceil(width)}px`);
}

function measureOverview(mergeView: MergeView, scroller: HTMLElement, trackHeight: number): OverviewLayout {
  const scrollHeight = scroller.scrollHeight;
  const clientHeight = scroller.clientHeight;
  const scrollMax = Math.max(0, scrollHeight - clientHeight);
  const visible = scrollMax > 1 && trackHeight > 0;
  const segments: OverviewSegment[] = [];

  for (const chunk of mergeView.chunks) {
    if (chunk.fromA !== chunk.toA) {
      const range = visualRange(mergeView.a, chunk.fromA, chunk.endA);
      segments.push({ kind: "deletion", ...range });
    }
    if (chunk.fromB !== chunk.toB) {
      const range = visualRange(mergeView.b, chunk.fromB, chunk.endB);
      segments.push({ kind: "addition", ...range });
    }
  }

  const thumbHeight = visible ? Math.max(24, trackHeight * clientHeight / scrollHeight) : trackHeight;
  const thumbTop = scrollMax > 0 ? (trackHeight - thumbHeight) * scroller.scrollTop / scrollMax : 0;
  return {
    markers: visible ? buildOverviewMarkers(segments, scrollHeight, trackHeight) : [],
    visible,
    thumbTop,
    thumbHeight,
    scrollTop: scroller.scrollTop,
    scrollMax,
    changeCount: mergeView.chunks.length,
  };
}

function visualRange(view: EditorView, from: number, to: number) {
  const safeFrom = clamp(from, 0, view.state.doc.length);
  const safeTo = clamp(to, safeFrom, view.state.doc.length);
  const start = view.lineBlockAt(safeFrom);
  const end = view.lineBlockAt(safeTo);
  return { from: start.top, to: end.bottom };
}

function overviewWithScroll(current: OverviewLayout, scroller: HTMLElement, trackHeight: number): OverviewLayout {
  if (!current.visible) return current;
  const scrollMax = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  return {
    ...current,
    scrollTop: scroller.scrollTop,
    scrollMax,
    thumbTop: scrollMax > 0 ? (trackHeight - current.thumbHeight) * scroller.scrollTop / scrollMax : 0,
  };
}

function comparisonExtensions(language: EditorLanguage, label: string): Extension {
  const languageExtension = language === "markdown" ? markdown()
    : language === "json" ? json()
    : language === "yaml" ? yaml()
    : [];
  return [
    minimalSetup,
    lineNumbers(),
    EditorView.lineWrapping,
    EditorState.readOnly.of(true),
    EditorView.editable.of(false),
    EditorView.contentAttributes.of({ "aria-label": label }),
    languageExtension,
  ];
}
