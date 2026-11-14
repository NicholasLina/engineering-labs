import type { LogEvent, SearchStatus } from "./useDebouncedSearch.ts";

export type DebounceSnapshot = {
  keystrokes: readonly { query: string; at: number }[];
  armed: boolean;
  pendingQuery: string | null;
  log: readonly { id: number; query: string; event: LogEvent }[];
  status: SearchStatus;
  resultsQuery: string;
};

export type DebounceDescription = {
  happened: string;
  keystrokes: string;
  window: string;
  requests: string;
};

export function describeDebounce(state: DebounceSnapshot): DebounceDescription {
  const starts = state.log.filter((entry) => entry.event === "started");
  const ignored = state.log.filter((entry) => entry.event === "ignored");
  const resolved = state.log.filter((entry) => entry.event === "resolved");
  const rejected = state.log.filter((entry) => entry.event === "rejected");
  const keystrokes = keystrokeText(state.keystrokes);
  const window = windowText(state);
  const requests = requestText(starts.length, resolved.length, ignored.length, rejected.length);

  if (
    !state.armed &&
    state.keystrokes.length === 0 &&
    starts.length === 0 &&
    state.log.length === 0
  ) {
    return {
      happened: "Nothing has been typed yet.",
      keystrokes,
      window,
      requests,
    };
  }

  if (ignored.length > 0) {
    const older = ignored[ignored.length - 1];
    const lead =
      ignored.length === 1 && older
        ? `The older "${older.query}" response was ignored.`
        : "Older responses were ignored.";
    let rest = "A newer search is still the one that may write.";
    if ((state.status === "success" || state.status === "empty") && state.resultsQuery.length > 0) {
      rest = `Results stay on "${state.resultsQuery}".`;
    } else if (state.status === "error") {
      rest = "The latest search failed.";
    }
    return {
      happened: `${lead} ${rest}`,
      keystrokes,
      window,
      requests,
    };
  }

  if (state.armed && starts.length === 0) {
    const query = state.pendingQuery ?? state.keystrokes[state.keystrokes.length - 1]?.query ?? "";
    return {
      happened: `A trailing window is armed for "${query}". No search has started.`,
      keystrokes,
      window,
      requests,
    };
  }

  if (starts.length === 1) {
    const query = starts[0]?.query ?? "";
    return {
      happened: singleStart(query, state.status),
      keystrokes,
      window,
      requests,
    };
  }

  return {
    happened: manyStarts(starts.length, starts[starts.length - 1]?.query ?? "", state),
    keystrokes,
    window,
    requests,
  };
}

function keystrokeText(keystrokes: readonly { query: string; at: number }[]): string {
  if (keystrokes.length === 0) {
    return "No keystrokes yet.";
  }

  const listed = keystrokes
    .map((stroke) => `"${stroke.query}" at ${Math.round(stroke.at)} ms`)
    .join(", ");
  const noun = keystrokes.length === 1 ? "keystroke" : "keystrokes";
  return `${keystrokes.length} ${noun}: ${listed}.`;
}

function windowText(state: DebounceSnapshot): string {
  if (state.armed && state.pendingQuery) {
    return `Armed for "${state.pendingQuery}". The timer resets on each change and has not fired.`;
  }

  return "No debounce window is armed.";
}

function requestText(
  startCount: number,
  resolvedCount: number,
  ignoredCount: number,
  rejectedCount: number,
): string {
  if (startCount === 0) {
    return "No searches have started.";
  }

  const started = startCount === 1 ? "1 search has started." : `${startCount} searches have started.`;
  const applied =
    resolvedCount === 0
      ? ""
      : resolvedCount === 1
        ? " 1 response was applied."
        : ` ${resolvedCount} responses were applied.`;
  const ignored =
    ignoredCount === 0
      ? ""
      : ignoredCount === 1
        ? " 1 older response was ignored."
        : ` ${ignoredCount} older responses were ignored.`;
  const rejected =
    rejectedCount === 0
      ? ""
      : rejectedCount === 1
        ? " 1 response failed."
        : ` ${rejectedCount} responses failed.`;
  return `${started}${applied}${ignored}${rejected}`;
}

function singleStart(query: string, status: SearchStatus): string {
  if (status === "empty") {
    return `One search started for "${query}", and it matched nothing.`;
  }
  if (status === "error") {
    return `One search started for "${query}", and it failed.`;
  }
  if (status === "success") {
    return `One search started for "${query}", and that response was applied.`;
  }
  return `One search started for "${query}". Its response has not arrived.`;
}

function manyStarts(
  count: number,
  latestQuery: string,
  state: DebounceSnapshot,
): string {
  if ((state.status === "success" || state.status === "empty") && state.resultsQuery.length > 0) {
    return `${count} searches started. The latest response for "${state.resultsQuery}" was applied.`;
  }
  if (state.status === "error") {
    return `${count} searches started. The latest search failed.`;
  }
  return `${count} searches started. The latest, "${latestQuery}", has not arrived.`;
}
