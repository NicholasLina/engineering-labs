import type { Clock } from "./clock.ts";

export type PendingFire = {
  query: string;
  fireAt: number;
};

export type DebounceScheduler = {
  arm: (query: string, intervalMs: number) => void;
  cancel: () => void;
  readonly pending: PendingFire | null;
};

export function createDebounceScheduler(
  clock: Clock,
  onFire: (query: string) => void,
): DebounceScheduler {
  let pending: PendingFire | null = null;
  let cancelTimer: (() => void) | null = null;
  let generation = 0;

  function invalidate() {
    generation += 1;
    cancelTimer?.();
    cancelTimer = null;
    pending = null;
  }

  return {
    arm(query, intervalMs) {
      invalidate();
      const token = generation;
      const fireAt = clock.now() + intervalMs;
      pending = { query, fireAt };
      cancelTimer = clock.schedule(() => {
        if (token !== generation) {
          return;
        }
        generation += 1;
        pending = null;
        cancelTimer = null;
        onFire(query);
      }, intervalMs);
    },
    cancel() {
      invalidate();
    },
    get pending() {
      return pending === null ? null : { query: pending.query, fireAt: pending.fireAt };
    },
  };
}
