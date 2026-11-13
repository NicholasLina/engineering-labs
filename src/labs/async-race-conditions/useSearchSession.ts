import { useEffect, useRef, useState } from "react";
import type { CatalogItem } from "./catalog.ts";
import type { SearchFn } from "./simulateSearch.ts";
import type { TimelineOutcome, TimelineRequest } from "./timeline.ts";

export type SearchMode = "naive" | "protected";

export type SearchStatus = "idle" | "loading" | "success" | "empty" | "error";

export type LogEvent =
  | "started"
  | "cancel-requested"
  | "resolved"
  | "rejected"
  | "ignored"
  | "cache-hit";

export type LogEntry = {
  id: number;
  query: string;
  event: LogEvent;
};

export type SearchSession = {
  query: string;
  status: SearchStatus;
  results: CatalogItem[];
  resultsQuery: string;
  errorMessage: string | null;
  log: LogEntry[];
  requests: TimelineRequest[];
  searchFor: (
    query: string,
    request: { delayMs: number; fail: boolean; useCache?: boolean },
  ) => void;
  clear: () => void;
};

type SessionState = Omit<SearchSession, "searchFor" | "clear">;

type Inflight = {
  id: number;
  query: string;
  controller: AbortController;
  cancelLogged: boolean;
};

const logLimit = 50;

const initialState: SessionState = {
  query: "",
  status: "idle",
  results: [],
  resultsQuery: "",
  errorMessage: null,
  log: [],
  requests: [],
};

function withRequest(requests: TimelineRequest[], request: TimelineRequest): TimelineRequest[] {
  return [...requests, request].slice(-logLimit);
}

function withOutcome(
  requests: TimelineRequest[],
  id: number,
  outcome: TimelineOutcome,
): TimelineRequest[] {
  return requests.map((request) => (request.id === id ? { ...request, outcome } : request));
}

function withLog(log: LogEntry[], entries: LogEntry[]): LogEntry[] {
  if (entries.length === 0) {
    return log;
  }

  return [...log, ...entries].slice(-logLimit);
}

function messageFrom(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return "Search failed";
}

export function useSearchSession({
  search,
  mode,
}: {
  search: SearchFn;
  mode: SearchMode;
}): SearchSession {
  const [state, setState] = useState<SessionState>(initialState);
  const sessionRef = useRef({
    mode,
    search,
    epoch: 0,
    nextId: 0,
    mounted: true,
    cache: new Map<string, CatalogItem[]>(),
    inflight: new Map<number, Inflight>(),
  });

  useEffect(() => {
    sessionRef.current.mode = mode;
    sessionRef.current.search = search;
  }, [mode, search]);

  useEffect(() => {
    const session = sessionRef.current;
    session.mounted = true;

    return () => {
      session.mounted = false;
      session.epoch += 1;
      for (const entry of session.inflight.values()) {
        entry.controller.abort();
      }
      session.inflight.clear();
      session.cache.clear();
    };
  }, []);

  function cancellationsForRetiredRequests(): LogEntry[] {
    const session = sessionRef.current;
    if (session.mode !== "protected") {
      return [];
    }

    const entries: LogEntry[] = [];
    for (const entry of session.inflight.values()) {
      if (entry.cancelLogged) {
        continue;
      }

      entry.controller.abort();
      entry.cancelLogged = true;
      entries.push({ id: entry.id, query: entry.query, event: "cancel-requested" });
    }
    return entries;
  }

  function clear() {
    const session = sessionRef.current;
    session.epoch += 1;
    for (const entry of session.inflight.values()) {
      entry.controller.abort();
    }
    session.inflight.clear();
    setState(() => ({
      query: "",
      status: "idle",
      results: [],
      resultsQuery: "",
      errorMessage: null,
      log: [],
      requests: [],
    }));
  }

  function searchFor(
    rawQuery: string,
    request: { delayMs: number; fail: boolean; useCache?: boolean },
  ) {
    const query = rawQuery.trim();
    if (query.length === 0) {
      clear();
      return;
    }

    const session = sessionRef.current;
    const id = ++session.nextId;
    const epoch = session.epoch;
    const key = query.toLowerCase();
    const retired = cancellationsForRetiredRequests();
    const cached = request.useCache === false ? undefined : session.cache.get(key);

    if (cached) {
      const results = [...cached];
      const hit: TimelineRequest = {
        id,
        query,
        startedAtMs: performance.now(),
        delayMs: 0,
        outcome: "cache-hit",
      };
      setState((current) => ({
        query,
        status: results.length === 0 ? "empty" : "success",
        results,
        resultsQuery: query,
        errorMessage: null,
        log: withLog(current.log, [
          ...retired,
          { id, query, event: "cache-hit" },
        ]),
        requests: withRequest(current.requests, hit),
      }));
      return;
    }

    const controller = new AbortController();
    const started: TimelineRequest = {
      id,
      query,
      startedAtMs: performance.now(),
      delayMs: request.delayMs,
      outcome: "pending",
    };
    session.inflight.set(id, { id, query, controller, cancelLogged: false });
    setState((current) => ({
      query,
      status: "loading",
      results: [],
      resultsQuery: "",
      errorMessage: null,
      log: withLog(current.log, [...retired, { id, query, event: "started" }]),
      requests: withRequest(current.requests, started),
    }));

    // A response may write only while this epoch is current.
    // Naive mode also accepts an older id. Protected mode accepts the latest id.
    const mayWrite = () =>
      session.mounted &&
      epoch === session.epoch &&
      (session.mode === "naive" || id === session.nextId);

    void session.search({
      query,
      signal: controller.signal,
      delayMs: request.delayMs,
      fail: request.fail,
    }).then(
      (items) => {
        session.inflight.delete(id);
        if (!session.mounted) {
          return;
        }

        if (!mayWrite()) {
          if (epoch !== session.epoch) {
            return;
          }
          session.cache.set(key, [...items]);
          setState((current) => ({
            ...current,
            log: withLog(current.log, [{ id, query, event: "ignored" }]),
            requests: withOutcome(current.requests, id, "ignored"),
          }));
          return;
        }

        session.cache.set(key, [...items]);
        setState((current) => ({
          ...current,
          status: items.length === 0 ? "empty" : "success",
          results: [...items],
          resultsQuery: query,
          errorMessage: null,
          log: withLog(current.log, [{ id, query, event: "resolved" }]),
          requests: withOutcome(current.requests, id, "resolved"),
        }));
      },
      (error: unknown) => {
        session.inflight.delete(id);
        if (!session.mounted) {
          return;
        }

        if (!mayWrite()) {
          if (epoch !== session.epoch) {
            return;
          }
          setState((current) => ({
            ...current,
            log: withLog(current.log, [{ id, query, event: "ignored" }]),
            requests: withOutcome(current.requests, id, "ignored"),
          }));
          return;
        }

        setState((current) => ({
          ...current,
          status: "error",
          results: [],
          resultsQuery: "",
          errorMessage: messageFrom(error),
          log: withLog(current.log, [{ id, query, event: "rejected" }]),
          requests: withOutcome(current.requests, id, "rejected"),
        }));
      },
    );
  }

  return { ...state, searchFor, clear };
}
