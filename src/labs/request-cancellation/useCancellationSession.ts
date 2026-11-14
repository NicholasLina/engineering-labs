import { useEffect, useRef, useState } from "react";
import type { CatalogItem } from "./catalog.ts";
import type { Clock } from "./clock.ts";
import { isAbortError, searchFailedMessage, type SearchFn } from "./simulateSearch.ts";

export type CancellationMode = "ignore" | "abort";

export type SearchStatus = "idle" | "loading" | "success" | "empty" | "error";

export type RequestOutcome = "pending" | "completed" | "aborted" | "failed";

export type WriteDisposition = "pending" | "applied" | "ignored";

export type LogEvent =
  | "started"
  | "abort-requested"
  | "aborted"
  | "completed"
  | "ignored"
  | "failed";

export type RequestRecord = {
  id: number;
  query: string;
  plannedMs: number;
  startedAt: number;
  endedAt: number | null;
  outcome: RequestOutcome;
  write: WriteDisposition;
};

export type LogEntry = {
  id: number;
  query: string;
  event: LogEvent;
  at: number;
};

export type CancellationSession = {
  query: string;
  status: SearchStatus;
  results: CatalogItem[];
  resultsQuery: string;
  errorMessage: string | null;
  requests: RequestRecord[];
  log: LogEntry[];
  search: (query: string, request: { delayMs: number; fail: boolean }) => void;
  cancel: () => void;
  clear: () => void;
};

type View = Omit<CancellationSession, "search" | "cancel" | "clear">;

type Inflight = {
  id: number;
  query: string;
  controller: AbortController;
  epoch: number;
};

type Applied = {
  query: string;
  results: CatalogItem[];
  status: "success" | "empty";
};

type Runtime = {
  mode: CancellationMode;
  transport: SearchFn;
  clock: Clock;
  epoch: number;
  nextId: number;
  mounted: boolean;
  inflight: Map<number, Inflight>;
  retired: Set<number>;
  applied: Applied | null;
};

const logLimit = 50;

const initialView: View = {
  query: "",
  status: "idle",
  results: [],
  resultsQuery: "",
  errorMessage: null,
  requests: [],
  log: [],
};

function withLog(log: readonly LogEntry[], entries: readonly LogEntry[]): LogEntry[] {
  if (entries.length === 0) {
    return [...log];
  }
  return [...log, ...entries].slice(-logLimit);
}

function patchRequest(
  requests: readonly RequestRecord[],
  id: number,
  patch: Pick<RequestRecord, "endedAt" | "outcome" | "write">,
): RequestRecord[] {
  return requests.map((request) => (request.id === id ? { ...request, ...patch } : request));
}

function idleView(): View {
  return {
    query: "",
    status: "idle",
    results: [],
    resultsQuery: "",
    errorMessage: null,
    requests: [],
    log: [],
  };
}

export function useCancellationSession({
  search,
  clock,
  mode,
}: {
  search: SearchFn;
  clock: Clock;
  mode: CancellationMode;
}): CancellationSession {
  const [view, setView] = useState<View>(initialView);
  const runtime = useRef<Runtime>({
    mode,
    transport: search,
    clock,
    epoch: 0,
    nextId: 0,
    mounted: true,
    inflight: new Map(),
    retired: new Set(),
    applied: null,
  });

  useEffect(() => {
    runtime.current.mode = mode;
    runtime.current.transport = search;
    runtime.current.clock = clock;
  }, [mode, search, clock]);

  useEffect(() => {
    const current = runtime.current;
    current.mounted = true;
    return () => {
      current.mounted = false;
      current.epoch += 1;
      current.applied = null;
      if (current.mode === "abort") {
        for (const entry of current.inflight.values()) {
          entry.controller.abort();
        }
      }
      current.inflight.clear();
    };
  }, []);

  function commit(update: (current: View) => View) {
    if (!runtime.current.mounted) {
      return;
    }
    setView((previous) => update(previous));
  }

  function finishAbort(id: number, query: string, epoch: number) {
    const current = runtime.current;
    current.inflight.delete(id);
    if (!current.mounted || epoch !== current.epoch) {
      return;
    }

    const endedAt = current.clock.now();
    commit((previous) => {
      const next: View = {
        ...previous,
        log: withLog(previous.log, [{ id, query, event: "aborted", at: endedAt }]),
        requests: patchRequest(previous.requests, id, {
          endedAt,
          outcome: "aborted",
          write: "ignored",
        }),
      };
      // Only the latest request owns the loading state. An older abort must
      // not clear a newer search, and it must not surface as Search failed.
      if (id !== current.nextId) {
        return next;
      }
      const applied = current.applied;
      if (applied) {
        return {
          ...next,
          query: applied.query,
          status: applied.status,
          results: [...applied.results],
          resultsQuery: applied.query,
          errorMessage: null,
        };
      }
      return {
        ...next,
        status: "idle",
        results: [],
        resultsQuery: "",
        errorMessage: null,
      };
    });
  }

  function finishSuccess(id: number, query: string, epoch: number, items: readonly CatalogItem[]) {
    const current = runtime.current;
    current.inflight.delete(id);
    if (!current.mounted || epoch !== current.epoch) {
      return;
    }

    const endedAt = current.clock.now();
    const allowed = id === current.nextId && !current.retired.has(id);
    if (!allowed) {
      commit((previous) => ({
        ...previous,
        log: withLog(previous.log, [
          { id, query, event: "completed", at: endedAt },
          { id, query, event: "ignored", at: endedAt },
        ]),
        requests: patchRequest(previous.requests, id, {
          endedAt,
          outcome: "completed",
          write: "ignored",
        }),
      }));
      return;
    }

    const results = [...items];
    const status: "success" | "empty" = results.length === 0 ? "empty" : "success";
    current.applied = { query, results, status };
    commit((previous) => ({
      ...previous,
      status,
      results: [...results],
      resultsQuery: query,
      errorMessage: null,
      log: withLog(previous.log, [{ id, query, event: "completed", at: endedAt }]),
      requests: patchRequest(previous.requests, id, {
        endedAt,
        outcome: "completed",
        write: "applied",
      }),
    }));
  }

  function finishFailure(id: number, query: string, epoch: number) {
    const current = runtime.current;
    current.inflight.delete(id);
    if (!current.mounted || epoch !== current.epoch) {
      return;
    }

    const endedAt = current.clock.now();
    const allowed = id === current.nextId && !current.retired.has(id);
    if (!allowed) {
      commit((previous) => ({
        ...previous,
        log: withLog(previous.log, [
          { id, query, event: "failed", at: endedAt },
          { id, query, event: "ignored", at: endedAt },
        ]),
        requests: patchRequest(previous.requests, id, {
          endedAt,
          outcome: "failed",
          write: "ignored",
        }),
      }));
      return;
    }

    commit((previous) => ({
      ...previous,
      status: "error",
      results: [],
      resultsQuery: "",
      errorMessage: searchFailedMessage,
      log: withLog(previous.log, [{ id, query, event: "failed", at: endedAt }]),
      requests: patchRequest(previous.requests, id, {
        endedAt,
        outcome: "failed",
        write: "applied",
      }),
    }));
  }

  function abortInflight() {
    const current = runtime.current;
    const at = current.clock.now();
    for (const entry of [...current.inflight.values()]) {
      if (entry.controller.signal.aborted) {
        continue;
      }
      current.retired.add(entry.id);
      commit((previous) => ({
        ...previous,
        log: withLog(previous.log, [
          { id: entry.id, query: entry.query, event: "abort-requested", at },
        ]),
      }));
      entry.controller.abort();
    }
  }

  function searchFor(rawQuery: string, request: { delayMs: number; fail: boolean }) {
    const query = rawQuery.trim();
    if (query.length === 0) {
      clear();
      return;
    }

    const current = runtime.current;
    const id = ++current.nextId;
    const epoch = current.epoch;
    const startedAt = current.clock.now();
    const controller = new AbortController();

    if (current.mode === "abort") {
      abortInflight();
    }

    current.inflight.set(id, { id, query, controller, epoch });
    commit((previous) => ({
      ...previous,
      query,
      status: "loading",
      results: [],
      resultsQuery: "",
      errorMessage: null,
      log: withLog(previous.log, [{ id, query, event: "started", at: startedAt }]),
      requests: [
        ...previous.requests,
        {
          id,
          query,
          plannedMs: request.delayMs,
          startedAt,
          endedAt: null,
          outcome: "pending",
          write: "pending",
        },
      ],
    }));

    const transport = current.transport;
    void transport({
      query,
      signal: controller.signal,
      delayMs: request.delayMs,
      fail: request.fail,
    }).then(
      (items) => {
        finishSuccess(id, query, epoch, items);
      },
      (error: unknown) => {
        if (isAbortError(error)) {
          finishAbort(id, query, epoch);
          return;
        }
        finishFailure(id, query, epoch);
      },
    );
  }

  function cancel() {
    const current = runtime.current;
    const entry = current.inflight.get(current.nextId);
    if (!entry || entry.epoch !== current.epoch || current.retired.has(entry.id)) {
      return;
    }

    if (current.mode === "abort") {
      current.retired.add(entry.id);
      const at = current.clock.now();
      commit((previous) => ({
        ...previous,
        log: withLog(previous.log, [
          { id: entry.id, query: entry.query, event: "abort-requested", at },
        ]),
      }));
      entry.controller.abort();
      return;
    }

    current.retired.add(entry.id);
    commit((previous) => {
      const applied = current.applied;
      if (applied) {
        return {
          ...previous,
          query: applied.query,
          status: applied.status,
          results: [...applied.results],
          resultsQuery: applied.query,
          errorMessage: null,
        };
      }
      return {
        ...previous,
        status: "idle",
        results: [],
        resultsQuery: "",
        errorMessage: null,
      };
    });
  }

  function clear() {
    const current = runtime.current;
    current.epoch += 1;
    current.applied = null;
    if (current.mode === "abort") {
      for (const entry of [...current.inflight.values()]) {
        entry.controller.abort();
      }
    }
    current.inflight.clear();
    commit(() => idleView());
  }

  return { ...view, search: searchFor, cancel, clear };
}
