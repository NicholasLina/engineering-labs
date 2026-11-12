import type { TimelineOutcome } from "./timeline.ts";
import type { SearchMode, SearchStatus } from "./useSearchSession.ts";

export type InspectorKind = "idle" | "cleared" | "order" | "sequence" | "error" | "duplicate" | "manual";

export type InspectorCopy = {
  happened: string;
  search: string;
  timeline: string;
  requests: string;
};

type RequestSnap = {
  query: string;
  delayMs: number;
  outcome: TimelineOutcome;
};

const searchPage =
  "The search window is the page. The box is the latest query. The results are whichever response was allowed to write.";
const timelineRule =
  "A bar's left edge is when the request was issued. Its length is the delay it was scheduled to wait. The color matches that request in the list.";
const requestRule =
  "Each row is one event: started, resolved, rejected, ignored, or cache-hit. Read them from top to bottom.";

export function describeInspector(input: {
  kind: InspectorKind;
  mode: SearchMode;
  query: string;
  status: SearchStatus;
  resultsQuery: string;
  requests: readonly RequestSnap[];
}): InspectorCopy {
  if (input.kind === "cleared") {
    return {
      happened:
        "Clear advanced the epoch and removed the timeline and the request list. A response from that old epoch cannot write the search window or put those rows back.",
      search: "The search window is idle. It is waiting for a new query.",
      timeline: "The timeline is empty because those requests belonged to the cleared epoch.",
      requests: "The request list is empty for the same reason. A late arrival does not reappear here.",
    };
  }

  if (input.kind === "order" || input.kind === "error") {
    return describeScenario(input.kind, input.mode, input.requests);
  }

  if (input.kind === "sequence") {
    return describeSequence(input.mode, input.requests);
  }

  if (input.kind === "duplicate") {
    return describeDuplicate(input.mode, input.requests);
  }

  if (input.kind === "manual") {
    return describeManual(input);
  }

  return {
    happened: "Nothing has been issued yet. Run a scenario, or type in the search window.",
    search: searchPage,
    timeline: `The timeline is empty until a request starts. ${timelineRule}`,
    requests: `The request list is empty until a request starts. ${requestRule}`,
  };
}

function describeScenario(
  kind: "order" | "error",
  mode: SearchMode,
  requests: readonly RequestSnap[],
): InspectorCopy {
  const recent = requests.slice(-2);
  const slow = recent.find((request) => request.delayMs >= 600);
  const fast = recent.find((request) => request.delayMs > 0 && request.delayMs < 600);
  if (!slow || !fast) {
    return {
      happened:
        kind === "error"
          ? "Stale error issues \"re\" for 600 ms, set to fail, then \"rea\" for 50 ms."
          : "Out of order issues \"re\" for 600 ms, then \"rea\" for 50 ms.",
      search: searchPage,
      timeline: timelineRule,
      requests: requestRule,
    };
  }

  const slowPending = slow.outcome === "pending";
  const fastPending = fast.outcome === "pending";

  if (kind === "error") {
    return describeError(mode, slowPending, fastPending, slow.outcome);
  }

  return describeOrder(mode, slowPending, fastPending, slow.outcome);
}

function describeOrder(
  mode: SearchMode,
  slowPending: boolean,
  fastPending: boolean,
  slowOutcome: TimelineOutcome,
): InspectorCopy {
  if (slowPending && fastPending) {
    return {
      happened:
        "Out of order started \"re\" for 600 ms and \"rea\" for 50 ms together. The search window already shows \"rea\". The short bar should finish first.",
      search: "The box shows the latest query, \"rea\", before either response has written results.",
      timeline:
        "The long bar is \"re\" and the short bar is \"rea\". They share a start, so the short one ends while the long one is still running.",
      requests: "Both rows say started. Later rows show how each request settles.",
    };
  }

  if (slowPending) {
    if (mode === "protected") {
      return {
        happened:
          "Protected mode retired \"re\" when \"rea\" started. The search window shows \"rea\". The long bar is still running, and its settlement will be ignored.",
        search: "The results belong to \"rea\". A later settlement from \"re\" is not allowed to replace them.",
        timeline: "The short bar has settled. The long bar still shows its full 600 ms and is pending.",
        requests: "\"re\" already has a cancel-requested row. An ignored row appears when it settles.",
      };
    }

    return {
      happened:
        "The fast \"rea\" response has written the search window. The slow \"re\" request is still running. Naive mode will let that late response replace these results.",
      search: "The results currently belong to \"rea\". They can still change when \"re\" arrives.",
      timeline: "The short bar has settled. The long bar is still the full 600 ms.",
      requests: "\"rea\" has a resolved row. \"re\" is still only started.",
    };
  }

  if (slowOutcome === "ignored") {
    return {
      happened:
        "The late \"re\" response was ignored. The search window and the results both stay on \"rea\".",
      search: "The box and the results heading name the same query. The late response did not get a turn.",
      timeline: "The short bar resolved. The long bar ran its full length and ended ignored.",
      requests:
        "\"re\" shows cancel-requested when \"rea\" started, then ignored when it settled. Cancellation retired the work. The id check refused the write.",
    };
  }

  return {
    happened:
      "The late \"re\" response replaced the \"rea\" results. The search window still says \"rea\", and the results belong to \"re\". The response that finished last wrote the page.",
    search: "Compare the box with the results heading. They name different queries. That mismatch is the bug.",
    timeline:
      "Both bars resolved. The short bar ended first, then the long bar. Length stays the scheduled delay.",
    requests: "Both requests resolved. The older id is the last resolved row, which is the write that stuck.",
  };
}

function describeError(
  mode: SearchMode,
  slowPending: boolean,
  fastPending: boolean,
  slowOutcome: TimelineOutcome,
): InspectorCopy {
  if (slowPending && fastPending) {
    return {
      happened: "Stale error uses the same timing, and the slow \"re\" request is set to fail.",
      search: "The box shows \"rea\". Nothing is written until a response is allowed through.",
      timeline: "The long bar is the request that will fail. The short bar is \"rea\" at 50 ms.",
      requests: "Both rows say started. The failure shows up when \"re\" settles.",
    };
  }

  if (slowPending) {
    if (mode === "protected") {
      return {
        happened:
          "\"rea\" has results. Protected mode already retired \"re\". When that request fails, the error will be ignored.",
        search: "The results belong to \"rea\". The coming failure is not allowed to replace them.",
        timeline: "The short bar has settled. The long bar is the failing request and is still pending.",
        requests: "\"re\" already has a cancel-requested row. An ignored row appears when the failure arrives.",
      };
    }

    return {
      happened:
        "\"rea\" has results. The failing \"re\" request is still in flight. Naive mode will replace this success with the error if that failure arrives last.",
      search: "The results currently belong to \"rea\". The status can still become the error from \"re\".",
      timeline: "The short bar has settled. The long bar is the failing request and is still the full 600 ms.",
      requests: "\"rea\" has a resolved row. \"re\" is still only started.",
    };
  }

  if (slowOutcome === "ignored") {
    return {
      happened:
        "The slow \"re\" request failed, and protected mode ignored it. The search window keeps the \"rea\" results.",
      search: "The status stays on the \"rea\" result. It does not say the search failed.",
      timeline: "The short bar resolved. The long bar ended ignored after its full 600 ms.",
      requests:
        "\"re\" was cancel-requested, then ignored. The failure used the same id check as a success.",
    };
  }

  if (slowOutcome === "rejected" && !fastPending) {
    return {
      happened:
        "The slow \"re\" request failed after \"rea\" succeeded, and naive mode wrote that error onto the search window.",
      search:
        "The box still says \"rea\", but the status is the failure from \"re\". An older error replaced a newer success.",
      timeline:
        "The short bar resolved. The long bar is rejected. The outline marks the failure without shrinking the bar.",
      requests: "\"rea\" resolved, then \"re\" rejected. The rejection is the write that stuck.",
    };
  }

  return {
    happened: "Stale error finished. Compare the search window with the long bar's outcome.",
    search: searchPage,
    timeline: timelineRule,
    requests: requestRule,
  };
}

function describeSequence(mode: SearchMode, requests: readonly RequestSnap[]): InspectorCopy {
  const older = requests.at(-2);
  const newer = requests.at(-1);
  if (!older || !newer) {
    return {
      happened: "In order issues \"re\" for 50 ms, then \"rea\" for 600 ms.",
      search: searchPage,
      timeline: timelineRule,
      requests: requestRule,
    };
  }

  const olderPending = older.outcome === "pending";
  const newerPending = newer.outcome === "pending";

  if (olderPending && newerPending) {
    return {
      happened:
        "In order started \"re\" for 50 ms, then \"rea\" for 600 ms. The newer request is the slow one. The search window already shows \"rea\".",
      search: "The box shows \"rea\" before either response has written results.",
      timeline:
        "The short bar is the older \"re\". The long bar is \"rea\". The short one ends first, and the long one is the request that should win.",
      requests: "Both rows say started. Later rows show how each request settles.",
    };
  }

  if (newerPending) {
    if (mode === "protected" || older.outcome === "ignored") {
      return {
        happened:
          "Protected mode retired \"re\" when \"rea\" started. The long bar is still running, and it is the request that may write.",
        search: "\"re\" is not allowed to write. The page waits for \"rea\".",
        timeline: "The short bar is ignored or still retiring. The long bar is still the full 600 ms.",
        requests: "\"re\" has a cancel-requested row. \"rea\" is still only started.",
      };
    }

    return {
      happened:
        "The fast \"re\" response has written the search window. \"rea\" is still running. When it arrives, it replaces these results, so the page ends on the newer query.",
      search: "The results currently belong to \"re\". They change to \"rea\" when the slow request finishes.",
      timeline: "The short bar has settled. The long bar is still the full 600 ms.",
      requests: "\"re\" has a resolved row. \"rea\" is still only started.",
    };
  }

  if (older.outcome === "ignored") {
    return {
      happened:
        "The fast \"re\" response was ignored. Only \"rea\" wrote the search window. The page is right because the newer request was the one allowed to finish.",
      search: "The box and the results name \"rea\". \"re\" never got a turn.",
      timeline: "The short bar ended ignored. The long bar is \"rea\" and resolved.",
      requests: "\"re\" was cancel-requested, then ignored. \"rea\" resolved.",
    };
  }

  return {
    happened:
      "Both requests resolved, and the later one was \"rea\". The search window ends on the newer query. The race happened, but the last write happened to be the right one.",
    search: "The box and the results both name \"rea\". An earlier write from \"re\" was replaced.",
    timeline: "The short bar ended first. The long bar is the newer request and resolved last.",
    requests: "\"re\" resolved, then \"rea\" resolved. The newer id is the write that stuck.",
  };
}

function describeDuplicate(mode: SearchMode, requests: readonly RequestSnap[]): InspectorCopy {
  const older = requests.at(-2);
  const newer = requests.at(-1);
  if (!older || !newer) {
    return {
      happened: "Same query issues \"re\" for 600 ms, then \"re\" again for 50 ms.",
      search: searchPage,
      timeline: timelineRule,
      requests: requestRule,
    };
  }

  const olderPending = older.outcome === "pending";
  const newerPending = newer.outcome === "pending";

  if (olderPending && newerPending) {
    return {
      happened:
        "Same query started \"re\" for 600 ms, then \"re\" again for 50 ms. The answers match, so the page will not show a mismatched query.",
      search: "The box says \"re\". Whichever response writes, the heading still says \"re\".",
      timeline:
        "Two bars for the same query. The long one was issued first. The short one ends while the long one is still running.",
      requests: "Two started rows, both for \"re\".",
    };
  }

  if (olderPending) {
    if (mode === "protected") {
      return {
        happened:
          "Protected mode retired the first \"re\" when the second started. The long bar is still running and will be ignored. The page already shows the newer request.",
        search: "The results belong to the newer \"re\". The late response is not allowed to write again.",
        timeline: "The short bar has settled. The long bar is still the full 600 ms.",
        requests: "The first \"re\" has a cancel-requested row. The second has resolved.",
      };
    }

    return {
      happened:
        "The fast \"re\" response has written the page. The slow \"re\" is still running. When it arrives, naive mode writes again, but the matches look the same.",
      search: "The results already belong to \"re\". A later write from the older request does not change the heading.",
      timeline: "The short bar has settled. The long bar is still running.",
      requests: "The newer id has resolved. The older id is still only started.",
    };
  }

  if (older.outcome === "ignored") {
    return {
      happened:
        "The late response was ignored. The search window kept the newer \"re\" results. The list looks the same as it would have if the late response had written.",
      search: "The box and the results both say \"re\". The page does not show that a second response was dropped.",
      timeline: "The short bar resolved. The long bar ended ignored.",
      requests: "The first \"re\" was cancel-requested, then ignored. The second resolved.",
    };
  }

  return {
    happened:
      "Both \"re\" requests resolved. The older one finished last and wrote again. The matches did not change, so the search window looks consistent.",
    search:
      "The box and the results both say \"re\". The mismatch is not in the text. It is that an older response was allowed to write.",
    timeline: "Both bars resolved. The short bar ended first. The long bar is the older request.",
    requests: "Both ids resolved. The older id is the last resolved row, which is the write that stuck.",
  };
}

function describeManual(input: {
  mode: SearchMode;
  query: string;
  status: SearchStatus;
  resultsQuery: string;
  requests: readonly RequestSnap[];
}): InspectorCopy {
  const latest = input.requests.at(-1);
  if (!latest) {
    return {
      happened: "The search window changed before a request was recorded.",
      search: searchPage,
      timeline: timelineRule,
      requests: requestRule,
    };
  }

  if (latest.outcome === "cache-hit") {
    return {
      happened: `"${latest.query}" was already known, so this was a cache hit. The search window updated immediately and no new search was started.`,
      search: "The results are the stored matches for this query.",
      timeline:
        "A cache hit is a marker with no duration. It records that the query was known. It does not decide which response may write.",
      requests:
        "The row says cache-hit. An older request can still settle afterward and, in naive mode, replace this page.",
    };
  }

  if (latest.outcome === "pending") {
    return {
      happened: `A manual search for "${latest.query}" is in flight. It uses the Delay and Fail next settings, not the scenario timing.`,
      search: "The box shows the query that was just issued. Results update only when a response is allowed to write.",
      timeline: "The newest bar is this request. Its length is the delay chosen in Advanced.",
      requests: "The newest row says started. Further rows show how it settles.",
    };
  }

  if (latest.outcome === "rejected" || input.status === "error") {
    return {
      happened: `The request for "${latest.query}" failed, and that failure was allowed to write.`,
      search: "The status is the error, and the result list is cleared.",
      timeline: "The bar for this request is rejected.",
      requests: "The list ends in rejected for this query.",
    };
  }

  if (input.status === "empty") {
    return {
      happened: `The search for "${input.resultsQuery}" finished with no matches.`,
      search: "An empty settlement still counts as a write. The page shows that this query matched nothing.",
      timeline: "The bar for this request resolved. Its length is the delay it was given.",
      requests: "The list ends in resolved. An empty result is still a success.",
    };
  }

  const olderPending = input.requests.slice(0, -1).some((request) => request.outcome === "pending");
  if (olderPending && input.mode === "naive") {
    return {
      happened: `The search window is showing "${input.resultsQuery}". An older request is still running, and naive mode can still let it overwrite this page.`,
      search: searchPage,
      timeline: timelineRule,
      requests: requestRule,
    };
  }

  return {
    happened: `The search window is showing the settlement for "${input.resultsQuery}".`,
    search: searchPage,
    timeline: timelineRule,
    requests: requestRule,
  };
}
