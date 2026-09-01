export type OverviewMarkerKind = "addition" | "deletion";

export interface OverviewSegment {
  kind: OverviewMarkerKind;
  from: number;
  to: number;
}

export interface OverviewMarker extends OverviewSegment {
  id: string;
  top: number;
  height: number;
}

export function buildOverviewMarkers(segments: OverviewSegment[], contentHeight: number, trackHeight: number): OverviewMarker[] {
  if (contentHeight <= 0 || trackHeight <= 0) return [];
  const scaled = segments.map((segment, index) => {
    const top = clamp(segment.from / contentHeight * trackHeight, 0, trackHeight);
    const bottom = clamp(segment.to / contentHeight * trackHeight, top, trackHeight);
    return { ...segment, id: `${segment.kind}-${index}`, top, height: Math.max(3, bottom - top) };
  }).sort((left, right) => left.kind.localeCompare(right.kind) || left.top - right.top);
  const merged: OverviewMarker[] = [];

  for (const marker of scaled) {
    const previous = merged[merged.length - 1];
    if (previous && previous.kind === marker.kind && marker.top <= previous.top + previous.height + 1) {
      previous.height = Math.max(previous.height, marker.top + marker.height - previous.top);
    } else {
      merged.push({ ...marker });
    }
  }
  return merged;
}

export function overviewScrollTopForPointer(pointerOffset: number, trackHeight: number, scrollHeight: number, viewportHeight: number) {
  if (trackHeight <= 0) return 0;
  const scrollMax = Math.max(0, scrollHeight - viewportHeight);
  return clamp(pointerOffset / trackHeight * scrollHeight - viewportHeight / 2, 0, scrollMax);
}

export function overviewScrollTopForKey(key: string, current: number, scrollMax: number, viewportHeight: number) {
  const page = Math.max(40, viewportHeight * .9);
  const targets: Record<string, number> = {
    ArrowUp: current - 40,
    ArrowDown: current + 40,
    PageUp: current - page,
    PageDown: current + page,
    Home: 0,
    End: scrollMax,
  };
  const target = targets[key];
  return target === undefined ? null : clamp(target, 0, scrollMax);
}

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
