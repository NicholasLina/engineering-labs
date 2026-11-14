import { useRef, useState } from "react";
import { createLookupCache } from "./cache.ts";
import type { CacheEntry, CacheEviction, LookupCache } from "./cache.ts";

export const defaultSource: Record<"ada" | "bea" | "cam", string> = {
  ada: "Ada Lovelace",
  bea: "Bea Atlas",
  cam: "Cam Rivera",
};

const logLimit = 50;

export type LookupKind = "hit" | "source" | "miss";

export type LookupLogEntry = {
  kind: LookupKind;
  key: string;
  value: string | null;
  at: number;
};

export type LookupSession = {
  now: number;
  source: Record<string, string>;
  log: LookupLogEntry[];
  result: LookupLogEntry | null;
  entries: CacheEntry[];
  evictions: CacheEviction[];
  lookup: (key: string) => void;
  setSource: (key: string, value: string) => void;
  invalidate: (key: string) => void;
  advance: (ticks: number) => void;
  advanceToExpiry: () => void;
  reset: () => void;
};

type SourceState = Record<string, string>;

type Model = {
  now: number;
  source: SourceState;
  log: LookupLogEntry[];
  result: LookupLogEntry | null;
  cache: LookupCache;
};

function freshSource(): SourceState {
  return { ...defaultSource };
}

function pushLog(log: readonly LookupLogEntry[], entry: LookupLogEntry): LookupLogEntry[] {
  const next = log.concat(entry);
  if (next.length <= logLimit) {
    return next;
  }
  return next.slice(next.length - logLimit);
}

function createModel(initialNow: number): Model {
  return {
    now: initialNow,
    source: freshSource(),
    log: [],
    result: null,
    cache: createLookupCache(),
  };
}

function record(model: Model, entry: LookupLogEntry) {
  model.result = entry;
  model.log = pushLog(model.log, entry);
}

function applyLookup(model: Model, key: string) {
  const read = model.cache.read(key, model.now);
  if (read.hit) {
    record(model, { kind: "hit", key, value: read.value, at: model.now });
    return;
  }

  if (Object.hasOwn(model.source, key)) {
    const value = model.source[key] ?? "";
    model.cache.insert(key, value, model.now);
    record(model, { kind: "source", key, value, at: model.now });
    return;
  }

  record(model, { kind: "miss", key, value: null, at: model.now });
}

function moveToEarliestExpiry(model: Model) {
  const entries = model.cache.snapshot(model.now).entries;
  const first = entries[0];
  if (first === undefined) {
    return;
  }

  let earliest = first.expiresAt;
  for (const entry of entries) {
    if (entry.expiresAt < earliest) {
      earliest = entry.expiresAt;
    }
  }
  model.now = earliest;
}

type LookupView = Omit<
  LookupSession,
  "lookup" | "setSource" | "invalidate" | "advance" | "advanceToExpiry" | "reset"
>;

function viewOf(model: Model): LookupView {
  const snap = model.cache.snapshot(model.now);
  return {
    now: model.now,
    source: { ...model.source },
    log: model.log.slice(),
    result: model.result === null ? null : { ...model.result },
    entries: snap.entries,
    evictions: snap.evictions,
  };
}

export function useLookup(initialNow = 0): LookupSession {
  // Handlers share this session so a scenario can chain before the next paint.
  // Render state stays a snapshot of it.
  const storeRef = useRef<Model | null>(null);
  const [view, setView] = useState(() => viewOf(createModel(initialNow)));

  function live(): Model {
    if (storeRef.current === null) {
      storeRef.current = createModel(initialNow);
    }
    return storeRef.current;
  }

  function publish(model: Model) {
    setView(viewOf(model));
  }

  function lookup(key: string) {
    const model = live();
    applyLookup(model, key);
    publish(model);
  }

  function setSource(key: string, value: string) {
    const model = live();
    model.source = { ...model.source, [key]: value };
    publish(model);
  }

  function invalidate(key: string) {
    const model = live();
    model.cache.invalidate(key, model.now);
    publish(model);
  }

  function advance(ticks: number) {
    const model = live();
    model.now += ticks;
    publish(model);
  }

  function advanceToExpiry() {
    const model = live();
    moveToEarliestExpiry(model);
    publish(model);
  }

  function reset() {
    const fresh = createModel(0);
    storeRef.current = fresh;
    publish(fresh);
  }

  return {
    ...view,
    lookup,
    setSource,
    invalidate,
    advance,
    advanceToExpiry,
    reset,
  };
}
