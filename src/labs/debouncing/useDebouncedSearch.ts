import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { CatalogItem } from "./catalog.ts";
import type { Clock } from "./clock.ts";
import { createDebounceScheduler, type DebounceScheduler } from "./debounce.ts";
import type { SearchFn } from "./simulateSearch.ts";

export type SearchStrategy = "immediate" | "debounced";

export type SearchStatus = "idle" | "loading" | "success" | "empty" | "error";

export type LogEvent = "started" | "resolved" | "ignored" | "rejected";

export type LogEntry = {
  id: number;
  query: string;
  event: LogEvent;
  at: number;
};

export type Keystroke = {
  query: string;
  at: number;
};

export type PendingWindow = {
  query: string;
  fireAt: number;
};

export type QueryOptions = {
  intervalMs: number;
  delayMs: number;
};

export type DebouncedSearch = {
  query: string;
  status: SearchStatus;
  results: CatalogItem[];
  resultsQuery: string;
  errorMessage: string | null;
  log: LogEntry[];
  keystrokes: Keystroke[];
  startCount: number;
  armed: boolean;
  pending: PendingWindow | null;
  changeQuery: (query: string, options: QueryOptions) => void;
  clear: () => void;
};

type SessionState = Omit<DebouncedSearch, "changeQuery" | "clear">;

type Session = {
  clock: Clock;
  search: SearchFn;
  strategy: SearchStrategy;
  epoch: number;
  nextId: number;
  latestId: number;
  mounted: boolean;
  originMs: number;
  armedDelayMs: number;
  armedEpoch: number;
  setState: Dispatch<SetStateAction<SessionState>>;
  scheduler: DebounceScheduler | null;
};

const logLimit = 50;

function idleState(): SessionState {
  return {
    query: "",
    status: "idle",
    results: [],
    resultsQuery: "",
    errorMessage: null,
    log: [],
    keystrokes: [],
    startCount: 0,
    armed: false,
    pending: null,
  };
}

function withCap<T>(items: readonly T[], entry: T): T[] {
  return [...items, entry].slice(-logLimit);
}

function elapsed(session: Session): number {
  return session.clock.now() - session.originMs;
}

function messageFrom(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return "Search failed";
}

function beginSearch(session: Session, query: string, delayMs: number) {
  if (!session.mounted) {
    return;
  }

  const id = session.nextId + 1;
  session.nextId = id;
  session.latestId = id;
  const epoch = session.epoch;
  const at = elapsed(session);
  session.setState((current) => ({
    ...current,
    query,
    status: "loading",
    results: [],
    resultsQuery: "",
    errorMessage: null,
    log: withCap(current.log, { id, query, event: "started", at }),
    startCount: current.startCount + 1,
    armed: false,
    pending: null,
  }));

  let pending: Promise<CatalogItem[]>;
  try {
    pending = session.search({ query, delayMs, fail: false });
  } catch (error) {
    applyFailure(session, id, query, epoch, error);
    return;
  }

  void pending.then(
    (items) => {
      applySuccess(session, id, query, epoch, items);
    },
    (error: unknown) => {
      applyFailure(session, id, query, epoch, error);
    },
  );
}

// mounted && epoch === currentEpoch && id === latestId.
// An epoch change drops the settlement with no log row. A stale id is ignored.
function gateFor(session: Session, epoch: number, id: number): "drop" | "ignore" | "write" {
  if (!session.mounted || epoch !== session.epoch) {
    return "drop";
  }
  if (id !== session.latestId) {
    return "ignore";
  }
  return "write";
}

function applySuccess(
  session: Session,
  id: number,
  query: string,
  epoch: number,
  items: readonly CatalogItem[],
) {
  const gate = gateFor(session, epoch, id);
  if (gate === "drop") {
    return;
  }

  const at = elapsed(session);
  if (gate === "ignore") {
    session.setState((current) => ({
      ...current,
      log: withCap(current.log, { id, query, event: "ignored", at }),
    }));
    return;
  }

  const results = [...items];
  session.setState((current) => ({
    ...current,
    status: results.length === 0 ? "empty" : "success",
    results,
    resultsQuery: query,
    errorMessage: null,
    log: withCap(current.log, { id, query, event: "resolved", at }),
  }));
}

function applyFailure(session: Session, id: number, query: string, epoch: number, error: unknown) {
  const gate = gateFor(session, epoch, id);
  if (gate === "drop") {
    return;
  }

  const at = elapsed(session);
  if (gate === "ignore") {
    session.setState((current) => ({
      ...current,
      log: withCap(current.log, { id, query, event: "ignored", at }),
    }));
    return;
  }

  session.setState((current) => ({
    ...current,
    status: "error",
    results: [],
    resultsQuery: "",
    errorMessage: messageFrom(error),
    log: withCap(current.log, { id, query, event: "rejected", at }),
  }));
}

function schedulerFor(session: Session): DebounceScheduler {
  if (session.scheduler) {
    return session.scheduler;
  }

  const facade: Clock = {
    now() {
      return session.clock.now();
    },
    schedule(callback, delayMs) {
      return session.clock.schedule(callback, delayMs);
    },
  };
  const scheduler = createDebounceScheduler(facade, (query) => {
    if (!session.mounted || session.armedEpoch !== session.epoch) {
      return;
    }
    beginSearch(session, query, session.armedDelayMs);
  });
  session.scheduler = scheduler;
  return scheduler;
}

function clearSession(session: Session) {
  session.epoch += 1;
  session.scheduler?.cancel();
  if (!session.mounted) {
    return;
  }

  session.originMs = session.clock.now();
  session.setState(idleState());
}

function applyQuery(session: Session, rawQuery: string, options: QueryOptions) {
  if (!session.mounted) {
    return;
  }

  const query = rawQuery.trim();
  if (query.length === 0) {
    clearSession(session);
    return;
  }

  const at = elapsed(session);
  const keystroke = { query, at };
  if (session.strategy === "debounced") {
    session.armedDelayMs = options.delayMs;
    session.armedEpoch = session.epoch;
    const scheduler = schedulerFor(session);
    scheduler.arm(query, options.intervalMs);
    const scheduled = scheduler.pending;
    session.setState((current) => ({
      ...current,
      query,
      keystrokes: withCap(current.keystrokes, keystroke),
      armed: scheduled !== null,
      pending:
        scheduled === null
          ? null
          : { query: scheduled.query, fireAt: scheduled.fireAt - session.originMs },
    }));
    return;
  }

  session.scheduler?.cancel();
  session.setState((current) => ({
    ...current,
    query,
    keystrokes: withCap(current.keystrokes, keystroke),
    armed: false,
    pending: null,
  }));
  beginSearch(session, query, options.delayMs);
}

export function useDebouncedSearch({
  clock,
  search,
  strategy,
}: {
  clock: Clock;
  search: SearchFn;
  strategy: SearchStrategy;
}): DebouncedSearch {
  const [state, setState] = useState(idleState);
  const sessionRef = useRef<Session>({
    clock,
    search,
    strategy,
    epoch: 0,
    nextId: 0,
    latestId: 0,
    mounted: true,
    originMs: clock.now(),
    armedDelayMs: 0,
    armedEpoch: 0,
    setState,
    scheduler: null,
  });

  useEffect(() => {
    const session = sessionRef.current;
    session.clock = clock;
    session.search = search;
    session.strategy = strategy;
    session.setState = setState;
  }, [clock, search, strategy, setState]);

  useEffect(() => {
    const session = sessionRef.current;
    session.mounted = true;
    return () => {
      session.mounted = false;
      session.epoch += 1;
      session.scheduler?.cancel();
    };
  }, []);

  return {
    ...state,
    changeQuery(query, options) {
      applyQuery(sessionRef.current, query, options);
    },
    clear() {
      clearSession(sessionRef.current);
    },
  };
}
