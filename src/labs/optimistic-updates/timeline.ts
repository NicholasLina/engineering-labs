const laneCount = 8;

/** Series colour from src/theme.css, cycling --lane-1 through --lane-8. */
export function saveLaneColor(id: number): string {
  const slot = ((id - 1) % laneCount + laneCount) % laneCount + 1;
  return `var(--lane-${slot})`;
}

export type SaveOutcome = "pending" | "confirmed" | "rejected" | "conflict" | "ignored";

export type SaveSpan = {
  id: number;
  taskId: string;
  title: string;
  startedAtMs: number;
  delayMs: number;
  outcome: SaveOutcome;
};

export type SaveBar = {
  id: number;
  taskId: string;
  title: string;
  delayMs: number;
  outcome: SaveOutcome;
  startPct: number;
  widthPct: number;
};

export type SaveTimeline = {
  spanMs: number;
  bars: SaveBar[];
};

export function buildSaveTimeline(requests: readonly SaveSpan[]): SaveTimeline {
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
      taskId: request.taskId,
      title: request.title,
      delayMs: request.delayMs,
      outcome: request.outcome,
      startPct: spanMs === 0 ? 0 : ((request.startedAtMs - origin) / spanMs) * 100,
      widthPct: spanMs === 0 ? 0 : (request.delayMs / spanMs) * 100,
    })),
  };
}
