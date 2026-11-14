import raceThumbnail from "./async-race-conditions/thumbnail.svg";
import cacheThumbnail from "./cache-lifetime/thumbnail.svg";
import debounceThumbnail from "./debouncing/thumbnail.svg";
import cancellationThumbnail from "./request-cancellation/thumbnail.svg";
import dedupeThumbnail from "./request-deduplication/thumbnail.svg";
import retriesThumbnail from "./retries/thumbnail.svg";

export interface Lab {
  slug: string;
  title: string;
  summary: string;
  concepts: string[];
  thumbnail: string;
}

export const labs: Lab[] = [
  {
    slug: "async-race-conditions",
    title: "Race Condition",
    summary:
      "Show how an older response can overwrite newer autocomplete results, and how cancellation and a stale-response check prevent it.",
    concepts: ["Async", "Cancellation", "Stale responses", "Caching"],
    thumbnail: raceThumbnail,
  },
  {
    slug: "debouncing",
    title: "Debouncing",
    summary:
      "Waiting for a typing pause starts fewer searches. A separate identity check still decides which response may render.",
    concepts: ["Scheduling", "Trailing edge", "Stale responses"],
    thumbnail: debounceThumbnail,
  },
  {
    slug: "request-cancellation",
    title: "Request Cancellation",
    summary:
      "Ignoring a late result and stopping simulated work are different, including a cancel that arrives after the work has finished.",
    concepts: ["Abort", "Work lifetime", "Stale responses"],
    thumbnail: cancellationThumbnail,
  },
  {
    slug: "cache-lifetime",
    title: "Cache Lifetime",
    summary:
      "A lookup reuses a stored record only while it is fresh, fits in two slots, and has not been invalidated.",
    concepts: ["Freshness", "LRU", "Invalidation"],
    thumbnail: cacheThumbnail,
  },
  {
    slug: "request-deduplication",
    title: "Request Deduplication",
    summary:
      "Two consumers can share one pending request, and a finished result is not kept for the next caller.",
    concepts: ["Fan-in", "Subscriptions", "Cancellation"],
    thumbnail: dedupeThumbnail,
  },
  {
    slug: "retries",
    title: "Retries",
    summary:
      "Capped backoff can recover a transient read failure, and an older retry loses authority when the query changes.",
    concepts: ["Backoff", "Attempt limits", "Relevance"],
    thumbnail: retriesThumbnail,
  },
];
