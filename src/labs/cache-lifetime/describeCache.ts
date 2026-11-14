import { cacheCapacity, cacheTtl } from "./cache.ts";
import type { CacheEntry, CacheEviction } from "./cache.ts";
import type { LookupLogEntry } from "./useLookup.ts";

export type CacheDescription = {
  happened: string;
  clock: string;
  lookup: string;
  cache: string;
};

export type CacheDescriptionInput = {
  now: number;
  log: readonly LookupLogEntry[];
  entries: readonly CacheEntry[];
  evictions: readonly CacheEviction[];
};

const boundary =
  "A record is fresh while now < expiresAt and expired when now >= expiresAt.";

const policy = `Capacity is ${cacheCapacity}. An insert expires ${cacheTtl} ticks after storedAt. A hit does not move expiresAt.`;

function joinSentences(parts: readonly string[]): string {
  return parts.filter((part) => part.length > 0).join(" ");
}

function lookupSentence(entry: LookupLogEntry): string {
  if (entry.kind === "hit") {
    return `Hit for ${entry.key} returned the stored record "${entry.value}".`;
  }
  if (entry.kind === "source") {
    return `Source read for ${entry.key} stored "${entry.value}".`;
  }
  return `Miss for ${entry.key}. The source has no record for that key.`;
}

function lookupDetail(entry: LookupLogEntry | undefined): string {
  if (entry === undefined) {
    return "A lookup has not run. The log records a hit, a source read, or a miss.";
  }
  if (entry.kind === "hit") {
    return `Hit ${entry.key} at tick ${entry.at}: ${entry.value}.`;
  }
  if (entry.kind === "source") {
    return `Source read ${entry.key} at tick ${entry.at}: ${entry.value}.`;
  }
  return `Miss ${entry.key} at tick ${entry.at}. The source has no record for that key.`;
}

function expiredSentence(entries: readonly CacheEntry[]): string {
  const expired = entries.filter((entry) => entry.freshness === "expired");
  const only = expired[0];
  if (expired.length === 1 && only !== undefined) {
    return `${only.key} is expired and still stored. The next read or insert removes it.`;
  }
  if (expired.length > 1) {
    const names = expired.map((entry) => entry.key).join(", ");
    return `${names} are expired and still stored. The next read or insert removes them.`;
  }
  return "";
}

function evictionSentence(evictions: readonly CacheEviction[]): string {
  const latest = evictions[evictions.length - 1];
  if (latest === undefined) {
    return "";
  }
  return `The latest eviction removed ${latest.key} (${latest.reason}).`;
}

function cacheDetail(input: CacheDescriptionInput): string {
  const eviction = evictionSentence(input.evictions);
  if (input.entries.length === 0) {
    return joinSentences(["The cache is empty.", eviction, policy]);
  }

  const stored = input.entries
    .map(
      (entry) =>
        `${entry.key} is ${entry.freshness}, storedAt ${entry.storedAt}, expiresAt ${entry.expiresAt}, recency ${entry.recency}`,
    )
    .join("; ");

  return joinSentences([`Stored: ${stored}.`, eviction, policy]);
}

export function describeCache(input: CacheDescriptionInput): CacheDescription {
  const latest = input.log[input.log.length - 1];
  const happened =
    latest === undefined
      ? "No lookup has run yet."
      : joinSentences([
          lookupSentence(latest),
          expiredSentence(input.entries),
          evictionSentence(input.evictions),
        ]);

  return {
    happened,
    clock: `The clock is ${input.now}. ${boundary}`,
    lookup: lookupDetail(latest),
    cache: cacheDetail(input),
  };
}
