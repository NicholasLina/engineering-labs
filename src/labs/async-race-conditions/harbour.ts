import {
  arrivalOrder,
  scenarios,
  slowDelayMs,
  type Channel,
  type ScenarioId,
  type ScenarioRequest,
} from "./scenarios.ts";
import { settlementMayWrite, type SearchMode } from "./settlement.ts";

export const premiseCopy =
  "This lighthouse shows the signal for whichever channel the keeper is assigned to. The colour comes from that channel's signal station. When the assignment changes, the keeper writes a new dispatch number and sends a messenger for that station's signal card. A messenger can bring back the right card for an assignment that has already changed.";

export const assignmentNote =
  "The channel written in the logbook. It changes when the keeper writes a new dispatch.";

export const lampNote =
  "The signal on the lighthouse. It changes only when the keeper applies a report.";

export const dispatchNote =
  "The number on the messenger's envelope. It stays with that report.";

export const premiseHappened =
  "Nothing has been sent. Start the walkthrough, or skip to the search demo.";

export const westSlip = "Couldn't obtain West's signal";

export type HarbourBeat =
  | { type: "dispatch"; id: number }
  | { type: "at-door"; id: number }
  | { type: "settle"; id: number; mode: SearchMode };

export type HarbourNotes = {
  assignment: string;
  lamp: string;
  dispatch: string;
};

export type HarbourPrompt = {
  question: string;
  choices: readonly { id: string; label: string }[];
  acknowledgements: Readonly<Record<string, string>>;
};

export type HarbourStep = {
  caption: string;
  beats: readonly HarbourBeat[];
  prompt?: HarbourPrompt;
  notes: HarbourNotes;
};

export type HarbourStory = {
  id: ScenarioId;
  setup: string | null;
  steps: readonly HarbourStep[];
};

export type LampSignal = "awaiting" | "amber" | "blue" | "dark";

export type MessengerProgress = "en-route" | "door" | "delivered" | "set-aside";

export type HarbourMessenger = {
  id: number;
  channel: Channel;
  route: "long" | "short";
  progress: MessengerProgress;
  carrying: "none" | "card" | "slip";
  card: "amber" | "blue" | null;
  slipText: string | null;
};

export type HarbourFrame = {
  assignment: string;
  signal: LampSignal;
  signalLabel: string;
  producedBy: string;
  messengers: readonly HarbourMessenger[];
  log: readonly string[];
};

type MessengerState = {
  id: number;
  channel: Channel;
  route: "long" | "short";
  progress: MessengerProgress | "hidden";
  carrying: "none" | "card" | "slip";
};

type FoldState = {
  assignmentId: number | null;
  latestId: number;
  signal: LampSignal;
  appliedId: number | null;
  messengers: MessengerState[];
  log: string[];
};

function notes(overrides: Partial<HarbourNotes> = {}): HarbourNotes {
  return {
    assignment: assignmentNote,
    lamp: lampNote,
    dispatch: dispatchNote,
    ...overrides,
  };
}

function channelName(channel: Channel): string {
  return channel === "west" ? "West" : "East";
}

function signalFor(channel: Channel): "amber" | "blue" {
  return channel === "west" ? "amber" : "blue";
}

function signalLabel(signal: LampSignal): string {
  if (signal === "awaiting") {
    return "Awaiting report";
  }
  if (signal === "dark") {
    return "No signal";
  }
  if (signal === "amber") {
    return "Amber · West";
  }
  return "Blue · East";
}

function requestById(requests: readonly ScenarioRequest[], id: number): ScenarioRequest {
  const request = requests.find((item) => item.id === id);
  if (!request) {
    throw new Error(`Missing dispatch #${id}.`);
  }
  return request;
}

function reportName(request: ScenarioRequest): string {
  if (request.fail) {
    return "failure slip";
  }
  return request.channel === "west" ? "amber card" : "blue card";
}

function slipText(request: ScenarioRequest): string | null {
  if (!request.fail) {
    return null;
  }
  return request.channel === "west" ? westSlip : `Couldn't obtain ${channelName(request.channel)}'s signal`;
}

function sentLine(request: ScenarioRequest): string {
  return `#${request.id} · ${channelName(request.channel)} channel · sent`;
}

function reportLine(request: ScenarioRequest, action: string): string {
  return `#${request.id} · ${channelName(request.channel)} · ${reportName(request)} · ${action}`;
}

function blank(requests: readonly ScenarioRequest[]): FoldState {
  return {
    assignmentId: null,
    latestId: 0,
    signal: "awaiting",
    appliedId: null,
    messengers: requests.map((request) => ({
      id: request.id,
      channel: request.channel,
      route: request.delayMs >= slowDelayMs ? "long" : "short",
      progress: "hidden",
      carrying: "none",
    })),
    log: [],
  };
}

function withMessenger(
  state: FoldState,
  id: number,
  patch: Partial<MessengerState>,
): MessengerState[] {
  return state.messengers.map((messenger) =>
    messenger.id === id ? { ...messenger, ...patch } : messenger,
  );
}

function applyBeat(
  requests: readonly ScenarioRequest[],
  state: FoldState,
  beat: HarbourBeat,
): FoldState {
  const request = requestById(requests, beat.id);

  if (beat.type === "dispatch") {
    return {
      ...state,
      assignmentId: request.id,
      latestId: Math.max(state.latestId, request.id),
      messengers: withMessenger(state, request.id, { progress: "en-route", carrying: "none" }),
      log: [...state.log, sentLine(request)],
    };
  }

  if (beat.type === "at-door") {
    return {
      ...state,
      messengers: withMessenger(state, request.id, {
        progress: "door",
        carrying: request.fail ? "slip" : "card",
      }),
      log: [...state.log, reportLine(request, "at the door")],
    };
  }

  const mayWrite = settlementMayWrite({
    mounted: true,
    responseEpoch: 0,
    currentEpoch: 0,
    mode: beat.mode,
    responseId: request.id,
    latestId: state.latestId,
  });

  if (!mayWrite) {
    return {
      ...state,
      messengers: withMessenger(state, request.id, {
        progress: "set-aside",
        carrying: request.fail ? "slip" : "card",
      }),
      log: [...state.log, reportLine(request, "received and ignored")],
    };
  }

  return {
    ...state,
    signal: request.fail ? "dark" : signalFor(request.channel),
    appliedId: request.id,
    messengers: withMessenger(state, request.id, { progress: "delivered", carrying: "none" }),
    log: [...state.log, reportLine(request, "applied")],
  };
}

export function frameFor(story: HarbourStory, stepIndex: number): HarbourFrame {
  const step = story.steps[stepIndex];
  if (!step) {
    throw new Error(`Missing step ${stepIndex} for ${story.id}.`);
  }

  const requests = scenarios[story.id];
  const folded = step.beats.reduce(
    (state, beat) => applyBeat(requests, state, beat),
    blank(requests),
  );
  const assignment = folded.assignmentId === null
    ? "None"
    : `#${folded.assignmentId} · ${channelName(requestById(requests, folded.assignmentId).channel)} channel`;

  return {
    assignment,
    signal: folded.signal,
    signalLabel: signalLabel(folded.signal),
    producedBy: folded.appliedId === null ? "No report yet" : `#${folded.appliedId}`,
    messengers: folded.messengers
      .filter((messenger) => messenger.progress !== "hidden")
      .map((messenger) => {
        const request = requestById(requests, messenger.id);
        const progress = messenger.progress === "hidden" ? "en-route" : messenger.progress;
        return {
          id: messenger.id,
          channel: messenger.channel,
          route: messenger.route,
          progress,
          carrying: messenger.carrying,
          card: messenger.carrying === "card" ? signalFor(request.channel) : null,
          slipText: messenger.carrying === "slip" ? slipText(request) : null,
        };
      }),
    log: folded.log,
  };
}

/** First time each dispatch reaches the door, in beat order. */
export function firstArrivals(beats: readonly HarbourBeat[]): number[] {
  const seen = new Set<number>();
  const ids: number[] = [];
  for (const beat of beats) {
    if (beat.type === "dispatch" || seen.has(beat.id)) {
      continue;
    }
    seen.add(beat.id);
    ids.push(beat.id);
  }
  return ids;
}

export function acknowledgementFor(
  story: HarbourStory,
  stepIndex: number,
  predictions: Readonly<Record<number, string | undefined>>,
): string | null {
  if (stepIndex <= 0) {
    return null;
  }
  const previous = story.steps[stepIndex - 1];
  const choice = predictions[stepIndex - 1];
  if (!previous?.prompt || !choice) {
    return null;
  }
  return previous.prompt.acknowledgements[choice] ?? null;
}

function chain(groups: readonly (readonly HarbourBeat[])[]): HarbourBeat[][] {
  const steps: HarbourBeat[][] = [];
  let all: HarbourBeat[] = [];
  for (const group of groups) {
    all = [...all, ...group];
    steps.push(all);
  }
  return steps;
}

const orderNaive = chain([
  [{ type: "dispatch", id: 1 }],
  [{ type: "dispatch", id: 2 }],
  [{ type: "settle", id: 2, mode: "naive" }],
  [{ type: "at-door", id: 1 }],
  [{ type: "settle", id: 1, mode: "naive" }],
]);

const orderStory: HarbourStory = {
  id: "order",
  setup: null,
  steps: [
    {
      caption:
        "The keeper writes #1 · West channel and sends messenger #1 on the longer route. The lamp reads Awaiting report.",
      beats: orderNaive[0] ?? [],
      notes: notes({
        dispatch:
          "The number on the envelope is the request ID. It identifies this trip, not the colour of the card.",
      }),
    },
    {
      caption:
        "The assignment changes to #2 · East channel, and messenger #2 leaves on the shorter route. Messenger #1 is still travelling.",
      beats: orderNaive[1] ?? [],
      notes: notes({
        assignment:
          "The logbook is the latest user intent. It changes as soon as the keeper writes the new assignment.",
      }),
    },
    {
      caption:
        "Messenger #2 returns with East's blue card, and the keeper lights the lamp blue. The logbook and the lamp both say this signal came from #2.",
      beats: orderNaive[2] ?? [],
      notes: notes({
        lamp:
          "The signal card is the response. The lamp is what gets rendered. The newer request finished first, so the lamp is correct.",
      }),
    },
    {
      caption:
        "Messenger #1 is at the door with West's amber card. The keeper has not applied it yet.",
      beats: orderNaive[3] ?? [],
      prompt: {
        question: "The keeper uses every report that arrives. What colour will the lamp show next?",
        choices: [
          { id: "amber", label: "Amber" },
          { id: "blue", label: "Blue" },
        ],
        acknowledgements: {
          amber: "You chose amber. That is the card in the keeper's hand.",
          blue: "You chose blue. That is the current assignment, and this keeper does not check it.",
        },
      },
      notes: notes({
        dispatch:
          "Both cards are valid. The open question is which assignment this card belongs to.",
      }),
    },
    {
      caption:
        "The keeper applies #1. The lamp turns amber. Current assignment: #2 · East. Lamp: amber from #1 · West. Both cards were right. This card belongs to an assignment the keeper has already left.",
      beats: orderNaive[4] ?? [],
      notes: notes({
        lamp:
          "The last arrival overwrote a newer answer. The keeper did not switch back to West. That is a race condition.",
      }),
    },
    {
      caption:
        "This keeper compares the envelope number with the logbook before touching the lamp. Envelope #1 does not match #2, so the amber card is recorded and ignored. The lamp stays blue. The messengers used the same routes and arrived in the same order as before.",
      beats: [
        { type: "dispatch", id: 1 },
        { type: "dispatch", id: 2 },
        { type: "settle", id: 2, mode: "protected" },
        { type: "settle", id: 1, mode: "protected" },
      ],
      notes: notes({
        dispatch:
          "Asking an older messenger to turn back is cancellation. In this simulator the messenger can still reach the door, so the keeper also checks the dispatch number. The same check applies to a successful card and to a failed report.",
      }),
    },
  ],
};

const sequenceNaive = chain([
  [
    { type: "dispatch", id: 1 },
    { type: "dispatch", id: 2 },
  ],
  [{ type: "settle", id: 1, mode: "naive" }],
  [{ type: "settle", id: 2, mode: "naive" }],
]);

const sequenceStory: HarbourStory = {
  id: "sequence",
  setup:
    "In order uses the same two assignments. Messenger #1 takes the shorter route, so West's card can arrive first.",
  steps: [
    {
      caption:
        "Both messengers are already out. The assignment is #2 · East, and the lamp still reads Awaiting report. #1 is on the shorter route.",
      beats: sequenceNaive[0] ?? [],
      notes: notes(),
    },
    {
      caption:
        "Messenger #1 returns with West's amber card. This keeper applies every report, so the lamp turns amber while the assignment stays #2 · East.",
      beats: sequenceNaive[1] ?? [],
      notes: notes(),
    },
    {
      caption:
        "Messenger #2 returns with East's blue card, and the keeper applies it. The lamp ends on the right colour. The amber lamp was the bug, and the later card covered it.",
      beats: sequenceNaive[2] ?? [],
      notes: notes(),
    },
    {
      caption:
        "Same trips, same arrivals. This keeper ignores envelope #1 because the logbook is already on #2. The lamp never turns amber. It stays on Awaiting report until #2's blue card, then turns blue.",
      beats: [
        { type: "dispatch", id: 1 },
        { type: "dispatch", id: 2 },
        { type: "settle", id: 1, mode: "protected" },
        { type: "settle", id: 2, mode: "protected" },
      ],
      notes: notes(),
    },
  ],
};

const errorNaive = chain([
  [
    { type: "dispatch", id: 1 },
    { type: "dispatch", id: 2 },
    { type: "settle", id: 2, mode: "naive" },
  ],
  [{ type: "at-door", id: 1 }],
  [{ type: "settle", id: 1, mode: "naive" }],
]);

const errorStory: HarbourStory = {
  id: "error",
  setup:
    "Stale error uses the same routes as the first walkthrough. The difference is the slip messenger #1 brings back.",
  steps: [
    {
      caption:
        "Messenger #2 has lit the lamp blue for #2 · East. Messenger #1 has not returned. That wait is pending, not a failure, so the lamp stays blue.",
      beats: errorNaive[0] ?? [],
      notes: notes(),
    },
    {
      caption:
        "Messenger #1 is at the door with a slip: Couldn't obtain West's signal. The keeper has not acted on it yet.",
      beats: errorNaive[1] ?? [],
      prompt: {
        question: "This keeper puts the lamp out for every failed report. What happens to the blue light?",
        choices: [
          { id: "dark", label: "It goes dark" },
          { id: "blue", label: "It stays blue" },
        ],
        acknowledgements: {
          dark: "You chose dark. That is this keeper's rule.",
          blue: "You chose blue. That would keep the current signal, and this keeper does not check.",
        },
      },
      notes: notes(),
    },
    {
      caption:
        "The keeper acts on the slip. The lamp goes dark. The assignment is still #2 · East. The light went out because the failure was applied.",
      beats: errorNaive[2] ?? [],
      notes: notes(),
    },
    {
      caption:
        "Same trips, same arrivals. This keeper records the slip and ignores it, because envelope #1 does not match #2. The blue lamp stays on. A failed report uses the same check as a card.",
      beats: [
        { type: "dispatch", id: 1 },
        { type: "dispatch", id: 2 },
        { type: "settle", id: 2, mode: "protected" },
        { type: "settle", id: 1, mode: "protected" },
      ],
      notes: notes(),
    },
  ],
};

const duplicateNaive = chain([
  [
    { type: "dispatch", id: 1 },
    { type: "dispatch", id: 2 },
  ],
  [
    { type: "settle", id: 2, mode: "naive" },
    { type: "settle", id: 1, mode: "naive" },
  ],
]);

const duplicateStory: HarbourStory = {
  id: "duplicate",
  setup:
    "Same query sends two messengers for West channel. Both cards are amber. The envelope numbers are different.",
  steps: [
    {
      caption:
        "Messenger #1 is on the longer route and messenger #2 is on the shorter route. The assignment is #2 · West. The lamp reads Awaiting report.",
      beats: duplicateNaive[0] ?? [],
      notes: notes(),
    },
    {
      caption:
        "#2 returns first and the lamp shows amber from #2. #1 returns later with the same colour, and this keeper applies it. The lamp still looks amber, but the record now says the signal came from #1.",
      beats: duplicateNaive[1] ?? [],
      notes: notes(),
    },
    {
      caption:
        "Same trips, same arrivals. This keeper ignores envelope #1. The lamp stays amber from #2. The colour and the channel name never change, so only the dispatch record shows which report was applied.",
      beats: [
        { type: "dispatch", id: 1 },
        { type: "dispatch", id: 2 },
        { type: "settle", id: 2, mode: "protected" },
        { type: "settle", id: 1, mode: "protected" },
      ],
      notes: notes(),
    },
  ],
};

const stories: Record<ScenarioId, HarbourStory | null> = {
  order: orderStory,
  sequence: sequenceStory,
  error: errorStory,
  duplicate: duplicateStory,
};

export function harbourStory(id: ScenarioId): HarbourStory | null {
  return stories[id];
}

export function storyArrivalIds(story: HarbourStory, stepIndex: number): number[] {
  const step = story.steps[stepIndex];
  if (!step) {
    return [];
  }
  return firstArrivals(step.beats);
}

export function scheduleArrivalIds(id: ScenarioId): number[] {
  return arrivalOrder(scenarios[id]).map((request) => request.id);
}
