import { catalog, filterCatalog } from "./catalog.ts";
import { westSlip } from "./harbour.ts";
import { scenarios, slowDelayMs, type ScenarioId } from "./scenarios.ts";
import type { SearchMode } from "./useSearchSession.ts";
import type { TimelineOutcome } from "./timeline.ts";

export type BridgeRequest = {
  id: number;
  query: string;
  delayMs: number;
  outcome: TimelineOutcome;
};

export type BridgeCopy = {
  happened: string;
  search: string;
  timeline: string;
  requests: string;
};

type NamedRequest = {
  sessionId: number;
  query: string;
  channel: "West" | "East";
  delayMs: number;
  route: "longer" | "shorter";
  outcome: TimelineOutcome;
};

function rendered(query: string): string {
  const labels = filterCatalog(catalog, query).map((item) => item.label);
  return labels.length === 0 ? "nothing" : labels.join(", ");
}

function named(scenarioId: ScenarioId, requests: readonly BridgeRequest[]): NamedRequest[] | null {
  const schedule = scenarios[scenarioId];
  if (requests.length < schedule.length) {
    return null;
  }
  const pair: NamedRequest[] = [];
  for (const [index, item] of schedule.entries()) {
    const live = requests[index];
    if (!live) {
      return null;
    }
    pair.push({
      sessionId: live.id,
      query: item.query,
      channel: item.channel === "west" ? "West" : "East",
      delayMs: item.delayMs,
      route: item.delayMs >= slowDelayMs ? "longer" : "shorter",
      outcome: live.outcome,
    });
  }
  return pair;
}

export function describeBridge(input: {
  scenarioId: ScenarioId;
  mode: SearchMode;
  query: string;
  resultsQuery: string;
  requests: readonly BridgeRequest[];
}): BridgeCopy | null {
  const pair = named(input.scenarioId, input.requests);
  const older = pair?.[0];
  const newer = pair?.[1];
  if (!pair || !older || !newer || pair.length !== 2) {
    return null;
  }

  const search = `The box is the logbook: ${input.query || newer.query}, #${newer.sessionId} · ${newer.channel}. The heading is the lamp. The request rows are the envelopes.`;
  const timeline = `Request #${older.sessionId} is ${older.query}, ${older.delayMs} ms, the ${older.route} trip. Request #${newer.sessionId} is ${newer.query}, ${newer.delayMs} ms, the ${newer.route} trip. The envelope number is the request id, not the signal colour.`;
  const bothPending = older.outcome === "pending" && newer.outcome === "pending";
  const olderTravelling = older.outcome === "pending";
  const newerTravelling = newer.outcome === "pending";

  if (bothPending) {
    return {
      happened: pendingHappened(input.scenarioId, older, newer),
      search,
      timeline,
      requests: "Both rows say started. Later rows show which report is allowed to write.",
    };
  }

  if (olderTravelling || newerTravelling) {
    return {
      happened: travellingHappened(input.scenarioId, input.mode, older, newer),
      search,
      timeline,
      requests: travellingRequests(input.scenarioId, input.mode, older, newer),
    };
  }

  return {
    happened: settledHappened(input.scenarioId, input.mode, older, newer, input.resultsQuery),
    search,
    timeline,
    requests: settledRequests(input.scenarioId, input.mode, older, newer),
  };
}

function pendingHappened(scenarioId: ScenarioId, older: NamedRequest, newer: NamedRequest): string {
  if (scenarioId === "error") {
    return `Both messengers are out. The box says ${newer.query}. Request #${older.sessionId} is the slow failure. A messenger who has not returned yet is pending, not a failure.`;
  }
  if (scenarioId === "sequence") {
    return `Both messengers are out. Request #${older.sessionId} takes the shorter trip, so ${older.query} can arrive before ${newer.query}. The box already says ${newer.query}.`;
  }
  if (scenarioId === "duplicate") {
    return `Two requests for ${older.query} are travelling. Request #${older.sessionId} is the longer trip and request #${newer.sessionId} is the shorter one. The answers match, so the heading will not show a different query.`;
  }
  return `The box says ${newer.query}. That is the open channel, #${newer.sessionId} · ${newer.channel}. Request #${older.sessionId} is ${older.query} on the longer trip and is still travelling. Request #${newer.sessionId} is ${newer.query} on the shorter trip. The lamp has not taken a card yet.`;
}

function travellingHappened(
  scenarioId: ScenarioId,
  mode: SearchMode,
  older: NamedRequest,
  newer: NamedRequest,
): string {
  if (scenarioId === "error" && older.outcome === "pending") {
    return `The heading says Results for "${newer.query}". Request #${older.sessionId} has not returned yet. A messenger who has not returned yet is pending, not a failure, so the page does not say the search failed.`;
  }
  if (scenarioId === "order" && older.outcome === "pending") {
    if (mode === "protected") {
      return `The heading says Results for "${newer.query}". Request #${older.sessionId} was cancel-requested when #${newer.sessionId} started. It is still travelling, and its card will be ignored.`;
    }
    return `The heading says Results for "${newer.query}". That is East's blue card. Request #${older.sessionId} has not returned. This keeper still applies every report, so the heading can change.`;
  }
  if (scenarioId === "sequence" && newer.outcome === "pending") {
    if (mode === "protected") {
      return `Request #${older.sessionId} was cancel-requested when #${newer.sessionId} started, and it did not write. The page is waiting for ${newer.query}.`;
    }
    return `The heading says Results for "${older.query}". That is the older card, while the open channel is already #${newer.sessionId} · ${newer.channel}. Request #${newer.sessionId} is still travelling.`;
  }
  if (scenarioId === "duplicate" && older.outcome === "pending") {
    if (mode === "protected") {
      return `The newer ${newer.query} response is on the page. Request #${older.sessionId} was cancel-requested and will be ignored.`;
    }
    return `The newer ${newer.query} response has written the page. Request #${older.sessionId} is still travelling. When it arrives, this mode writes again.`;
  }
  return `One messenger has returned and the other is still travelling. The box says ${newer.query}.`;
}

function travellingRequests(
  scenarioId: ScenarioId,
  mode: SearchMode,
  older: NamedRequest,
  newer: NamedRequest,
): string {
  if (mode === "protected") {
    return `Request #${older.sessionId} has a cancel-requested row. Request #${newer.sessionId} is the one that may write.`;
  }
  if (scenarioId === "sequence") {
    return `Request #${older.sessionId} has resolved. Request #${newer.sessionId} is still only started.`;
  }
  return `Request #${newer.sessionId} has resolved. Request #${older.sessionId} is still only started.`;
}

function settledHappened(
  scenarioId: ScenarioId,
  mode: SearchMode,
  older: NamedRequest,
  newer: NamedRequest,
  resultsQuery: string,
): string {
  if (scenarioId === "order") {
    if (mode === "protected" || older.outcome === "ignored") {
      return `The box says ${newer.query} and the heading stays Results for "${newer.query}". Request #${older.sessionId} was cancel-requested when #${newer.sessionId} started, then ignored when it arrived. Calling the messenger back is cancellation. The number check is the request id against the latest id.`;
    }
    return `The box says ${newer.query}. That is the open channel, #${newer.sessionId} · ${newer.channel}. The heading says Results for "${resultsQuery || older.query}". That is the lamp, now showing the older card. Request #${older.sessionId} is ${older.query}, the longer trip. Request #${newer.sessionId} is ${newer.query}, the shorter trip. #${newer.sessionId} finished first and rendered ${rendered(newer.query)}. #${older.sessionId} finished last and replaced that heading. Choose Protected and run Out of order again to keep the heading on ${newer.query}.`;
  }

  if (scenarioId === "error") {
    if (mode === "protected" || older.outcome === "ignored") {
      return `The heading stays Results for "${newer.query}", and the matches include ${rendered(newer.query)}. Request #${older.sessionId} failed and was ignored. The slip did not put the light out.`;
    }
    return `The box still says ${newer.query}, and the page says Search failed. That error is messenger #${older.sessionId}'s slip, ${westSlip}. The failure was applied, so it erased the ${newer.query} result.`;
  }

  if (scenarioId === "sequence") {
    if (mode === "protected" || older.outcome === "ignored") {
      return `The box says ${newer.query} and the heading is Results for "${newer.query}". Request #${older.sessionId} was ignored, so the lamp never showed the older card. Request #${newer.sessionId} is the write that stuck.`;
    }
    return `The box says ${newer.query} and the heading is Results for "${resultsQuery || newer.query}". The last write happened to be the open channel, #${newer.sessionId} · ${newer.channel}. Request #${older.sessionId} resolved first, then request #${newer.sessionId}. That earlier write is why a successful run can hide the bug.`;
  }

  if (mode === "protected" || older.outcome === "ignored") {
    return `The box says ${older.query} and the heading stays Results for "${older.query}". Request #${older.sessionId} was ignored. The colour and the channel name never change, so only the request list shows that the older report was not applied.`;
  }
  return `The heading stays Results for "${resultsQuery || older.query}". Request #${older.sessionId} resolved last and wrote again. The matches look the same. The request list shows the older id as the last resolved row.`;
}

function settledRequests(
  scenarioId: ScenarioId,
  mode: SearchMode,
  older: NamedRequest,
  newer: NamedRequest,
): string {
  if (mode === "protected" || older.outcome === "ignored") {
    return `Request #${older.sessionId} was cancel-requested, then ignored. Request #${newer.sessionId} is the row that wrote.`;
  }
  if (scenarioId === "error") {
    return `Request #${newer.sessionId} resolved, then request #${older.sessionId} rejected. The rejection is the write that stuck.`;
  }
  if (scenarioId === "sequence") {
    return `Request #${older.sessionId} resolved, then request #${newer.sessionId} resolved. The newer id is the write that stuck.`;
  }
  return `Request #${newer.sessionId} resolved, then request #${older.sessionId} resolved. The older id is the write that stuck.`;
}
