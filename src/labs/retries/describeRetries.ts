import type { AttemptOutcome, RetryState } from "./useRetryLoad.ts";

export type RetryDescription = {
  happened: string;
  request: string;
  attempts: string;
  wait: string;
  outcome: string;
};

export function describeRetries(state: RetryState): RetryDescription {
  return {
    happened: happenedText(state),
    request: requestText(state),
    attempts: attemptsText(state),
    wait: waitText(state),
    outcome: outcomeText(state),
  };
}

function happenedText(state: RetryState): string {
  if (state.status === "idle") {
    return "No load has started yet.";
  }

  const id = state.logicalId ?? "none";
  const latest = state.attempts.at(-1);
  const older = state.attempts.some((attempt) => attempt.logicalId !== state.logicalId);

  if (state.status === "waiting") {
    const kind = latest?.outcome ?? "transient";
    const wait = state.waitMs ?? 0;
    return `Logical request ${id} for ${state.query} is waiting ${wait} ms after a ${kind} attempt.`;
  }

  if (state.status === "success") {
    const result = state.result ?? `Loaded ${state.query}`;
    if (older) {
      return `Logical request ${id} for ${state.query} is the one on screen. The result is ${result}.`;
    }
    return `Logical request ${id} for ${state.query} finished with ${result}.`;
  }

  if (latest?.outcome === "permanent") {
    return `Logical request ${id} for ${state.query} stopped on a permanent failure.`;
  }

  const count = state.attempts.length;
  const noun = count === 1 ? "attempt" : "attempts";
  return `Logical request ${id} for ${state.query} stopped after ${count} ${noun} on a transient failure.`;
}

function requestText(state: RetryState): string {
  if (state.logicalId === null) {
    return "Logical request none.";
  }
  return `Logical request ${state.logicalId} for ${state.query}.`;
}

function attemptsText(state: RetryState): string {
  const latest: AttemptOutcome | undefined = state.attempts.at(-1)?.outcome;
  const count = state.attempts.length;
  if (count === 0 || latest === undefined) {
    return "0 attempts recorded. There is no latest attempt to classify.";
  }
  const noun = count === 1 ? "attempt" : "attempts";
  return `${count} ${noun} recorded. The latest attempt is classified as ${latest}.`;
}

function waitText(state: RetryState): string {
  if (state.status === "waiting" && state.waitMs !== null) {
    return `Waiting ${state.waitMs} ms.`;
  }
  return "No retry is waiting.";
}

function outcomeText(state: RetryState): string {
  if (state.status === "success") {
    return `Success. ${state.result ?? ""}`.trim();
  }
  if (state.status === "failed") {
    return `Failed. ${state.error ?? ""}`.trim();
  }
  if (state.status === "waiting") {
    return "Waiting. No final outcome.";
  }
  return "Idle. No final outcome.";
}
