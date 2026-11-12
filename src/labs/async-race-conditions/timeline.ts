const laneCount = 8;

/** Series colour from src/theme.css, cycling --lane-1 through --lane-8. */
export function requestLaneColor(id: number): string {
  const slot = ((id - 1) % laneCount + laneCount) % laneCount + 1;
  return `var(--lane-${slot})`;
}

export type TimelineOutcome =
  | "pending"
  | "resolved"
  | "rejected"
  | "ignored"
  | "cache-hit";

export type TimelineRequest = {
  id: number;
  query: string;
  startedAtMs: number;
  delayMs: number;
  outcome: TimelineOutcome;
};

export type TimelineBar = {
  id: number;
  query: string;
  delayMs: number;
  outcome: TimelineOutcome;
  startPct: number;
  widthPct: number;
};

export type Timeline = {
  spanMs: number;
  bars: TimelineBar[];
};

export function buildTimeline(requests: readonly TimelineRequest[]): Timeline {
  if (requests.length === 0) {
    return { spanMs: 0, bars: [] };
  }

  const origin = Math.min(...requests.map((request) => request.startedAtMs));
  const spanMs = Math.max(
    ...requests.map((request) => request.startedAtMs + request.delayMs - origin),
  );

  return {
    spanMs,
    bars: requests.map((request) => ({
      id: request.id,
      query: request.query,
      delayMs: request.delayMs,
      outcome: request.outcome,
      startPct: spanMs === 0 ? 0 : ((request.startedAtMs - origin) / spanMs) * 100,
      widthPct: spanMs === 0 ? 0 : (request.delayMs / spanMs) * 100,
    })),
  };
}
