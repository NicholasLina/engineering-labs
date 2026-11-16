import { settlementMayWrite, type SearchMode } from "./settlement.ts";

export const fastDelayMs = 50;
export const slowDelayMs = 600;

export type ScenarioId = "order" | "sequence" | "error" | "duplicate";

export type Channel = "west" | "east";

export type ScenarioRequest = {
  id: number;
  query: "re" | "rea";
  channel: Channel;
  delayMs: number;
  fail: boolean;
};

export const scenarios: Record<ScenarioId, readonly ScenarioRequest[]> = {
  order: [
    { id: 1, query: "re", channel: "west", delayMs: slowDelayMs, fail: false },
    { id: 2, query: "rea", channel: "east", delayMs: fastDelayMs, fail: false },
  ],
  sequence: [
    { id: 1, query: "re", channel: "west", delayMs: fastDelayMs, fail: false },
    { id: 2, query: "rea", channel: "east", delayMs: slowDelayMs, fail: false },
  ],
  error: [
    { id: 1, query: "re", channel: "west", delayMs: slowDelayMs, fail: true },
    { id: 2, query: "rea", channel: "east", delayMs: fastDelayMs, fail: false },
  ],
  duplicate: [
    { id: 1, query: "re", channel: "west", delayMs: slowDelayMs, fail: false },
    { id: 2, query: "re", channel: "west", delayMs: fastDelayMs, fail: false },
  ],
};

export function arrivalOrder<T extends { id: number; delayMs: number }>(
  requests: readonly T[],
): T[] {
  return [...requests].sort((left, right) => left.delayMs - right.delayMs || left.id - right.id);
}

export type ScheduleWrite = {
  id: number;
  query: ScenarioRequest["query"];
  channel: Channel;
  kind: "success" | "error";
};

export type ScheduleOutcome = {
  writes: ScheduleWrite[];
  ignoredIds: number[];
  final:
    | { status: "success"; query: ScenarioRequest["query"]; sourceId: number }
    | { status: "error"; sourceId: number };
};

/** Apply each response in arrival order with the shared write rule. */
export function applySchedule(
  requests: readonly ScenarioRequest[],
  mode: SearchMode,
): ScheduleOutcome {
  const latestId = requests.reduce((max, request) => Math.max(max, request.id), 0);
  const writes: ScheduleWrite[] = [];
  const ignoredIds: number[] = [];

  for (const request of arrivalOrder(requests)) {
    const mayWrite = settlementMayWrite({
      mounted: true,
      responseEpoch: 0,
      currentEpoch: 0,
      mode,
      responseId: request.id,
      latestId,
    });

    if (!mayWrite) {
      ignoredIds.push(request.id);
      continue;
    }

    writes.push({
      id: request.id,
      query: request.query,
      channel: request.channel,
      kind: request.fail ? "error" : "success",
    });
  }

  const last = writes.at(-1);
  if (!last) {
    throw new Error("A scenario settlement produced no write.");
  }

  if (last.kind === "error") {
    return { writes, ignoredIds, final: { status: "error", sourceId: last.id } };
  }

  return {
    writes,
    ignoredIds,
    final: { status: "success", query: last.query, sourceId: last.id },
  };
}
