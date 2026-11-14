import raceThumbnail from "./async-race-conditions/thumbnail.svg";
import optimisticThumbnail from "./optimistic-updates/thumbnail.svg";

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
    slug: "optimistic-updates",
    title: "Optimistic Updates",
    summary:
      "Move a task as soon as you ask, then watch that save confirm, roll back, or conflict. Waiting and immediate mode share one server, so the difference is when the board moves.",
    concepts: ["Optimistic UI", "Rollback", "Conflicts"],
    thumbnail: optimisticThumbnail,
  },
];
