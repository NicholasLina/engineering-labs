import type {
  CancellationMode,
  LogEntry,
  RequestRecord,
  SearchStatus,
} from "./useCancellationSession.ts";

export type CancellationCopy = {
  happened: string;
  search: string;
  lifetime: string;
  log: string;
};

const idleHappened = "Nothing has been requested yet.";

export function describeCancellation(input: {
  mode: CancellationMode;
  status: SearchStatus;
  query: string;
  resultsQuery: string;
  requests: readonly RequestRecord[];
  log: readonly LogEntry[];
}): CancellationCopy {
  return {
    happened: describeWhatHappened(input),
    search: describeSearch(input),
    lifetime: describeLifetimes(input.requests),
    log: describeLog(input.log),
  };
}

function describeWhatHappened(input: {
  mode: CancellationMode;
  status: SearchStatus;
  query: string;
  resultsQuery: string;
  requests: readonly RequestRecord[];
}): string {
  if (input.requests.length === 0) {
    return idleHappened;
  }

  const dropped = input.requests.filter(
    (request) =>
      request.write === "ignored" &&
      (request.outcome === "completed" || request.outcome === "failed"),
  );
  const droppedRequest = dropped.at(-1);
  if (droppedRequest) {
    if (droppedRequest.outcome === "failed") {
      return `Request #${droppedRequest.id} for "${droppedRequest.query}" failed, and that failure was ignored. The results on screen were not replaced.`;
    }
    const applied = [...input.requests].reverse().find((request) => request.write === "applied");
    const kept = applied
      ? ` The results stay with "${applied.query}".`
      : " The results were not changed.";
    return `Request #${droppedRequest.id} for "${droppedRequest.query}" completed, and the write was ignored.${kept}`;
  }

  const aborted = input.requests.filter((request) => request.outcome === "aborted");
  const abortedRequest = aborted.at(-1);
  const applied = [...input.requests].reverse().find((request) => request.write === "applied");
  if (abortedRequest && applied?.outcome === "completed") {
    return `Request #${abortedRequest.id} for "${abortedRequest.query}" was aborted. Request #${applied.id} for "${applied.query}" wrote the results.`;
  }

  const pending = input.requests.filter((request) => request.outcome === "pending");
  if (abortedRequest && pending.length === 0 && input.status !== "loading") {
    return `Request #${abortedRequest.id} for "${abortedRequest.query}" was aborted. The simulated timer stopped, and the result was not written.`;
  }

  if (input.status === "error") {
    return `The search for "${input.query}" failed. The outcome is failed. An abort is a different outcome.`;
  }

  const pendingRequest = pending.at(-1);
  if (pendingRequest && input.status !== "loading") {
    return "The current request was retired without aborting it. It is still running, and its later completion will be ignored.";
  }

  if (pendingRequest) {
    if (input.mode === "ignore" && input.requests.length > 1) {
      return `Ignore mode leaves the previous signal running. Request #${pendingRequest.id} for "${pendingRequest.query}" is the one that may write.`;
    }
    if (input.mode === "abort" && abortedRequest) {
      return `Abort mode cleared the previous simulated timer. Request #${pendingRequest.id} for "${pendingRequest.query}" is still running. A late result still has to pass the id check.`;
    }
    return `Request #${pendingRequest.id} for "${pendingRequest.query}" is in flight. The transport is a simulation.`;
  }

  if (applied) {
    return `Request #${applied.id} for "${applied.query}" wrote the search window.`;
  }

  return "The run has settled.";
}

function describeSearch(input: {
  status: SearchStatus;
  query: string;
  resultsQuery: string;
}): string {
  const simulation = "The transport is a simulation.";
  if (input.status === "loading") {
    return `The box shows "${input.query}". Results update only when a response is allowed to write. ${simulation}`;
  }
  if (input.status === "success") {
    return `The results belong to "${input.resultsQuery}". ${simulation}`;
  }
  if (input.status === "empty") {
    return `The search for "${input.resultsQuery}" matched nothing. ${simulation}`;
  }
  if (input.status === "error") {
    return `The status is Search failed. ${simulation}`;
  }
  if (input.query.length > 0) {
    return `The box shows "${input.query}", and nothing is loading. ${simulation}`;
  }
  return `The search window is idle. ${simulation}`;
}

function describeLifetimes(requests: readonly RequestRecord[]): string {
  if (requests.length === 0) {
    return "No request has a planned duration or a measured lifetime yet.";
  }
  return requests.map((request) => lifetimeSentence(request)).join(" ");
}

function lifetimeSentence(request: RequestRecord): string {
  const planned = `Request #${request.id} for "${request.query}" was planned for ${request.plannedMs} ms`;
  if (request.endedAt === null) {
    return `${planned} and is still running.`;
  }
  const actual = Math.round(request.endedAt - request.startedAt);
  return `${planned} and ran for ${actual} ms.`;
}

function describeLog(log: readonly LogEntry[]): string {
  if (log.length === 0) {
    return "The outcome log is empty.";
  }
  return `The outcome log records ${log.map((entry) => entry.event).join(", ")}.`;
}
