import thumbnail from "./async-race-conditions/thumbnail.svg";

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
    thumbnail,
  },
];
