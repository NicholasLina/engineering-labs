import {
  arrivalOrder,
  scenarios,
  slowDelayMs,
  type Channel,
  type ScenarioId,
  type ScenarioRequest,
} from "./scenarios.ts";
import { settlementMayWrite, type SearchMode } from "./settlement.ts";

export const raceConditionCopy =
  "A race condition is an outcome that depends on timing. Two reports can be travelling at once, and whichever arrives last can decide what you see, even after a newer choice has already replaced the older one.";

export const lighthouseSceneCopy =
  "Imagine there is a lighthouse, which can change colours based on information from a far away source. West's station sends an amber card. East's station sends a blue card. The lamp can show only one colour: the report the keeper chooses to apply.";

export const lighthouseRules = [
  "The logbook is the current assignment. Writing a new one sends another messenger and does not, by itself, change the lamp. Typing a new search does not, by itself, replace the results.",
  "The number on the letter is which messenger it is. The colour is what the far station reported. A late card can be the right colour for an assignment the logbook has already left.",
  "The longer route is a slow reply and the shorter route is a fast one. The keeper does not choose which messenger returns first.",
  "A messenger still on the route has not been applied. Waiting does not change the lamp, and it is not a failure.",
  "A coloured card is a successful report. A failure is a paper slip with no colour. Applying the slip puts the lamp out. Leaving it unread leaves the lamp as it was.",
  "A careful keeper reads the number and ignores a letter from an older assignment. The messenger is not called back. The letter still arrives, and the number is what stops it from painting the lamp.",
] as const;

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

export type HarbourFocus =
  | { target: "lamp" }
  | { target: "logbook" }
  | { target: "messenger"; id: number };

export type HarbourStep = {
  caption: string;
  beats: readonly HarbourBeat[];
  prompt?: HarbourPrompt;
  notes: HarbourNotes;
  focus: HarbourFocus;
  briefing?: boolean;
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
    ? "No assignment"
    : `#${folded.assignmentId} · ${channelName(requestById(requests, folded.assignmentId).channel)} channel`;

  return {
    assignment,
    signal: folded.signal,
    signalLabel: folded.assignmentId === null ? "No signal yet" : signalLabel(folded.signal),
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

const briefingStep: HarbourStep = {
  briefing: true,
  caption: lighthouseSceneCopy,
  beats: [],
  focus: { target: "lamp" },
  notes: notes(),
};

function withBriefing(story: HarbourStory): HarbourStory {
  return {
    ...story,
    steps: [briefingStep, ...story.steps],
  };
}

const orderStory: HarbourStory = withBriefing({
  id: "order",
  setup: null,
  steps: [
    {
      caption: "The keeper sends messenger #1 for West, and the lamp has no signal yet.",
      beats: orderNaive[0] ?? [],
      focus: { target: "messenger", id: 1 },
      notes: notes(),
    },
    {
      caption: "The assignment switches to East, and messenger #2 takes the shorter route.",
      beats: orderNaive[1] ?? [],
      focus: { target: "logbook" },
      notes: notes(),
    },
    {
      caption: "Messenger #2 returns first, and the lamp turns blue.",
      beats: orderNaive[2] ?? [],
      focus: { target: "lamp" },
      notes: notes(),
    },
    {
      caption: "Messenger #1 is at the door with West's amber card. What colour will the lamp show next?",
      beats: orderNaive[3] ?? [],
      focus: { target: "messenger", id: 1 },
      prompt: {
        question: "What colour will the lamp show next?",
        choices: [
          { id: "amber", label: "Amber" },
          { id: "blue", label: "Blue" },
        ],
        acknowledgements: {
          amber: "You chose amber. The late card turns the lamp amber while the assignment is still East.",
          blue: "You chose blue. This keeper does not check, so the late card turns the lamp amber anyway.",
        },
      },
      notes: notes(),
    },
    {
      caption: "The late card turns the lamp amber while the assignment is still East.",
      beats: orderNaive[4] ?? [],
      focus: { target: "lamp" },
      notes: notes(),
    },
    {
      caption: "This keeper checks the envelope number and ignores the late card, so the lamp stays blue.",
      beats: [
        { type: "dispatch", id: 1 },
        { type: "dispatch", id: 2 },
        { type: "settle", id: 2, mode: "protected" },
        { type: "settle", id: 1, mode: "protected" },
      ],
      focus: { target: "messenger", id: 1 },
      notes: notes(),
    },
  ],
});

const sequenceNaive = chain([
  [
    { type: "dispatch", id: 1 },
    { type: "dispatch", id: 2 },
  ],
  [{ type: "settle", id: 1, mode: "naive" }],
  [{ type: "settle", id: 2, mode: "naive" }],
]);

const sequenceStory: HarbourStory = withBriefing({
  id: "sequence",
  setup: null,
  steps: [
    {
      caption: "Both messengers are out, and messenger #1 has the shorter route.",
      beats: sequenceNaive[0] ?? [],
      focus: { target: "messenger", id: 1 },
      notes: notes(),
    },
    {
      caption: "West's card arrives first, so the lamp turns amber while the assignment is East.",
      beats: sequenceNaive[1] ?? [],
      focus: { target: "lamp" },
      notes: notes(),
    },
    {
      caption: "East's card arrives next and turns the lamp blue, covering that mistake.",
      beats: sequenceNaive[2] ?? [],
      focus: { target: "lamp" },
      notes: notes(),
    },
    {
      caption: "This keeper ignores the early card, so the lamp never turns amber.",
      beats: [
        { type: "dispatch", id: 1 },
        { type: "dispatch", id: 2 },
        { type: "settle", id: 1, mode: "protected" },
        { type: "settle", id: 2, mode: "protected" },
      ],
      focus: { target: "lamp" },
      notes: notes(),
    },
  ],
});

const errorNaive = chain([
  [
    { type: "dispatch", id: 1 },
    { type: "dispatch", id: 2 },
    { type: "settle", id: 2, mode: "naive" },
  ],
  [{ type: "at-door", id: 1 }],
  [{ type: "settle", id: 1, mode: "naive" }],
]);

const errorStory: HarbourStory = withBriefing({
  id: "error",
  setup: null,
  steps: [
    {
      caption: "The lamp is blue for East, and messenger #1 has not returned.",
      beats: errorNaive[0] ?? [],
      focus: { target: "lamp" },
      notes: notes(),
    },
    {
      caption: "Messenger #1 is at the door with a failure slip. What happens to the blue light?",
      beats: errorNaive[1] ?? [],
      focus: { target: "messenger", id: 1 },
      prompt: {
        question: "What happens to the blue light?",
        choices: [
          { id: "dark", label: "It goes dark" },
          { id: "blue", label: "It stays blue" },
        ],
        acknowledgements: {
          dark: "You chose dark. The keeper applies the slip, so the lamp goes dark while the assignment is still East.",
          blue: "You chose blue. This keeper does not check. The keeper applies the slip, so the lamp goes dark while the assignment is still East.",
        },
      },
      notes: notes(),
    },
    {
      caption: "The keeper applies the slip, so the lamp goes dark while the assignment is still East.",
      beats: errorNaive[2] ?? [],
      focus: { target: "lamp" },
      notes: notes(),
    },
    {
      caption: "This keeper ignores the slip, so the blue lamp stays on.",
      beats: [
        { type: "dispatch", id: 1 },
        { type: "dispatch", id: 2 },
        { type: "settle", id: 2, mode: "protected" },
        { type: "settle", id: 1, mode: "protected" },
      ],
      focus: { target: "lamp" },
      notes: notes(),
    },
  ],
});

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

const duplicateStory: HarbourStory = withBriefing({
  id: "duplicate",
  setup: null,
  steps: [
    {
      caption: "Two messengers leave for West, and the lamp has no signal yet.",
      beats: duplicateNaive[0] ?? [],
      focus: { target: "messenger", id: 1 },
      notes: notes(),
    },
    {
      caption: "Both cards are amber, and the later arrival records the signal as coming from #1.",
      beats: duplicateNaive[1] ?? [],
      focus: { target: "logbook" },
      notes: notes(),
    },
    {
      caption: "This keeper ignores #1, so the lamp stays amber from #2.",
      beats: [
        { type: "dispatch", id: 1 },
        { type: "dispatch", id: 2 },
        { type: "settle", id: 2, mode: "protected" },
        { type: "settle", id: 1, mode: "protected" },
      ],
      focus: { target: "lamp" },
      notes: notes(),
    },
  ],
});

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
