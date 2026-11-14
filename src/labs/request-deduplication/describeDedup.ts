import type { ConsumerSnapshot, PoolState } from "./inflightPool.ts";

export type DedupCopy = {
  happened: string;
  consumers: string;
  transports: string;
  inflight: string;
};

function transportPhrase(count: number): string {
  return count === 1 ? "1 transport request" : `${count} transport requests`;
}

function isIdle(state: PoolState): boolean {
  return (
    state.transports.length === 0 &&
    state.inflightKeys.length === 0 &&
    state.consumers.a.phase === "idle" &&
    state.consumers.b.phase === "idle"
  );
}

function describeConsumer(label: string, slot: ConsumerSnapshot): string {
  if (slot.phase === "idle") {
    return `${label} is idle.`;
  }
  if (slot.phase === "pending") {
    return `${label} is pending on ${slot.key}.`;
  }
  if (slot.phase === "done") {
    return `${label} has ${slot.value || "a value"} for ${slot.key}.`;
  }
  return `${label} failed on ${slot.key}${slot.error ? `: ${slot.error}` : ""}.`;
}

function describeTransports(state: PoolState): string {
  if (state.transports.length === 0) {
    return "No transport has started.";
  }

  return state.transports
    .map((record) => {
      const who = record.consumers.length === 0 ? "nobody" : record.consumers.join(" and ");
      return `#${record.id} ${record.key} is ${record.phase} for ${who}.`;
    })
    .join(" ");
}

function happened(state: PoolState, phrase: string): string {
  const pending = state.transports.filter((record) => record.phase === "pending");
  const sharedPending =
    state.consumers.a.phase === "pending" &&
    state.consumers.b.phase === "pending" &&
    state.consumers.a.key === state.consumers.b.key &&
    pending.length === 1 &&
    pending[0]?.consumers.length === 2;

  if (sharedPending) {
    return `Both consumers are waiting on ${state.consumers.a.key} and share one pending request. ${phrase}.`;
  }

  const latest = state.transports[state.transports.length - 1];
  const nothingPending = pending.length === 0 && state.inflightKeys.length === 0;

  if (nothingPending && latest?.phase === "failed") {
    return `The request failed and nothing is in flight. ${phrase} finished, so the next caller starts new work.`;
  }

  if (nothingPending && state.transports.some((record) => record.phase === "aborted")) {
    return `A transport aborted because no subscriber remained. ${phrase}.`;
  }

  if (nothingPending) {
    return `The pending work has settled. ${phrase}.`;
  }

  const running = pending.length === 1 ? "is still running" : "are still running";
  return `${phrase} ${running}.`;
}

export function describeDedup(state: PoolState): DedupCopy {
  if (isIdle(state)) {
    return {
      happened: "No request has started yet.",
      consumers: "Consumer A and consumer B are idle.",
      transports: "No transport has started.",
      inflight: "Nothing is in flight.",
    };
  }

  const phrase = transportPhrase(state.transports.length);
  return {
    happened: happened(state, phrase),
    consumers: `${describeConsumer("A", state.consumers.a)} ${describeConsumer("B", state.consumers.b)}`,
    transports: describeTransports(state),
    inflight:
      state.inflightKeys.length === 0
        ? "Nothing is in flight."
        : `In flight: ${state.inflightKeys.join(", ")}.`,
  };
}
