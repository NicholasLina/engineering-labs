import { catalog, filterCatalog, type CatalogItem } from "./catalog.ts";
import { guidedHarbour } from "./harbour.ts";
import { fastDelayMs, slowDelayMs } from "./scenarios.ts";
import type { SearchFn } from "./simulateSearch.ts";
import type { SearchMode } from "./settlement.ts";

export type SearchCue =
  | { type: "send"; query: string; delayMs: number }
  | { type: "deliver"; query: string };

export type SearchEmphasis = "none" | "box" | "request" | "response" | "results" | "number";

export type GuidedSearchStep = {
  id: string;
  chapter: string;
  title: string;
  action: string;
  caption: string;
  mode: SearchMode;
  cues: readonly SearchCue[];
  emphasis: SearchEmphasis;
  rule: string | null;
  showBox: boolean;
};

const searchChapter = "The search box";
const everyResponse = "Apply every response";
const checkNumber = "Check the request number";

const re = { type: "send", query: "re", delayMs: slowDelayMs } as const;
const rea = { type: "send", query: "rea", delayMs: fastDelayMs } as const;
const deliverRea = { type: "deliver", query: "rea" } as const;
const deliverRe = { type: "deliver", query: "re" } as const;

function searchStep(
  step: Pick<GuidedSearchStep, "id" | "title" | "action" | "caption"> & Partial<GuidedSearchStep>,
): GuidedSearchStep {
  return {
    chapter: searchChapter,
    mode: "naive",
    cues: [],
    emphasis: "none",
    rule: null,
    showBox: true,
    ...step,
  };
}

export const guidedSearchSteps: readonly GuidedSearchStep[] = [
  searchStep({
    id: "search-wait",
    title: "A search takes time",
    action: "Show the search box",
    caption:
      "When you type into a search box, the page can ask another computer for matching results. Asking takes time, and you can keep typing while an earlier answer is still on its way.",
    showBox: false,
  }),
  searchStep({
    id: "map-box",
    title: "The box is the assignment",
    action: "Show what sending a request means",
    caption: "The text in the box is the current assignment.",
    emphasis: "box",
  }),
  searchStep({
    id: "map-request",
    title: "Sending a request",
    action: "Show what a response means",
    caption: "Sending a messenger is sending a request. A request asks for results.",
    emphasis: "request",
  }),
  searchStep({
    id: "map-response",
    title: "The response is the answer",
    action: "Show what the results are",
    caption: "The returned report is the response. The response is the answer that comes back.",
    emphasis: "response",
  }),
  searchStep({
    id: "map-light",
    title: "Results are the light",
    action: "Show what the request number is",
    caption: "The light is the results on screen.",
    emphasis: "results",
  }),
  searchStep({
    id: "map-number",
    title: "The request number",
    action: "Enter re",
    caption: "The envelope number is the request number.",
    emphasis: "number",
  }),
  searchStep({
    id: "naive-send-1",
    title: "The first request leaves",
    action: "Change the box to rea",
    caption: "The box now says re. Request #1 has been sent. Nothing is displayed yet.",
    cues: [re],
    rule: everyResponse,
    emphasis: "box",
  }),
  searchStep({
    id: "naive-send-2",
    title: "A second request leaves",
    action: "Bring back the answer for rea",
    caption: "The box now says rea. Request #2 has been sent. Request #1 is still unanswered.",
    cues: [re, rea],
    rule: everyResponse,
    emphasis: "request",
  }),
  searchStep({
    id: "naive-deliver-2",
    title: "The answer for rea arrives",
    action: "Bring back the earlier answer",
    caption: "The answer for rea has come back, and those results are on the screen.",
    cues: [re, rea, deliverRea],
    rule: everyResponse,
    emphasis: "results",
  }),
  searchStep({
    id: "naive-deliver-1",
    title: "The earlier answer arrives",
    action: "Compare this with the lighthouse",
    caption: "The earlier answer has come back. The results change to re while the box still says rea.",
    cues: [re, rea, deliverRea, deliverRe],
    rule: everyResponse,
    emphasis: "results",
  }),
  searchStep({
    id: "naive-mismatch",
    title: "The same mix-up",
    action: "Try the number check",
    caption:
      "The box says rea, and the screen shows results for re. That is East assigned in the logbook while West is showing on the light.",
    cues: [re, rea, deliverRea, deliverRe],
    rule: everyResponse,
    emphasis: "results",
  }),
  searchStep({
    id: "protected-restart",
    title: "The same typing, with a check",
    action: "Enter re again",
    caption:
      "This is the same typing again. This time the page compares the request number with the latest request before it displays an answer.",
    mode: "protected",
    rule: checkNumber,
  }),
  searchStep({
    id: "protected-send-1",
    title: "Request #1 leaves again",
    action: "Change the box to rea",
    caption: "The box says re again. Request #1 has been sent. Nothing is displayed yet.",
    mode: "protected",
    cues: [re],
    rule: checkNumber,
  }),
  searchStep({
    id: "protected-send-2",
    title: "Request #2 leaves again",
    action: "Bring back the answer for rea",
    caption: "The box says rea. Request #2 has been sent, and request #1 is still unanswered.",
    mode: "protected",
    cues: [re, rea],
    rule: checkNumber,
  }),
  searchStep({
    id: "protected-deliver-2",
    title: "The matching answer is displayed",
    action: "Bring back the earlier answer",
    caption: "Request #2 matches the latest request, so the results for rea are displayed.",
    mode: "protected",
    cues: [re, rea, deliverRea],
    rule: checkNumber,
    emphasis: "results",
  }),
  searchStep({
    id: "protected-deliver-1",
    title: "The older answer waits",
    action: "Explore the demo",
    caption:
      "An older answer can arrive later. Before displaying an answer, check that it still belongs to the latest request.",
    mode: "protected",
    cues: [re, rea, deliverRea, deliverRe],
    rule: checkNumber,
    emphasis: "number",
  }),
];

export type LessonCursor = {
  id: string;
  kind: "harbour" | "search";
  chapter: string;
  title: string;
  action: string;
  caption: string;
};

export function lessonCursors(): LessonCursor[] {
  const harbour = guidedHarbour.steps.flatMap((step) => {
    if (!step.id || !step.chapter || !step.title || !step.action) {
      return [];
    }
    return [{
      id: step.id,
      kind: "harbour" as const,
      chapter: step.chapter,
      title: step.title,
      action: step.action,
      caption: step.caption,
    }];
  });
  return [
    ...harbour,
    ...guidedSearchSteps.map((step) => ({
      id: step.id,
      kind: "search" as const,
      chapter: step.chapter,
      title: step.title,
      action: step.action,
      caption: step.caption,
    })),
  ];
}

export function guidedSearchById(id: string): GuidedSearchStep {
  const step = guidedSearchSteps.find((item) => item.id === id);
  if (!step) {
    throw new Error(`Missing guided search step ${id}.`);
  }
  return step;
}

type PendingSearch = {
  query: string;
  generation: number;
  resolve: (items: CatalogItem[]) => void;
};

export function createGuidedSearch() {
  let generation = 0;
  const queue: PendingSearch[] = [];

  function begin(): number {
    generation += 1;
    queue.length = 0;
    return generation;
  }

  function invalidate() {
    generation += 1;
  }

  const search: SearchFn = (params) =>
    new Promise((resolve) => {
      queue.push({ query: params.query, generation, resolve });
    });

  function deliver(query: string, ticket: number) {
    const index = queue.findIndex((item) => item.query === query && item.generation === ticket);
    const item = queue[index];
    if (!item || item.generation !== generation) {
      return;
    }
    queue.splice(index, 1);
    item.resolve(filterCatalog(catalog, item.query));
  }

  return { search, begin, deliver, invalidate };
}

export function replayGuidedSearch(
  session: {
    prepareReplay: () => void;
    searchFor: (
      query: string,
      request: { delayMs: number; fail: boolean; useCache?: boolean },
    ) => void;
  },
  player: ReturnType<typeof createGuidedSearch>,
  cues: readonly SearchCue[],
) {
  const ticket = player.begin();
  session.prepareReplay();
  for (const cue of cues) {
    if (cue.type === "send") {
      session.searchFor(cue.query, { delayMs: cue.delayMs, fail: false, useCache: false });
    }
  }
  for (const cue of cues) {
    if (cue.type === "deliver") {
      player.deliver(cue.query, ticket);
    }
  }
}
