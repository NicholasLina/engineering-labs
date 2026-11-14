export type Clock = {
  now: () => number;
  schedule: (delayMs: number, callback: () => void) => number;
  cancel: (timerId: number) => void;
};

export type ManualClock = Clock & {
  advance: (ms: number) => void;
};

type ScheduledTimer = {
  id: number;
  dueAt: number;
  callback: () => void;
};

export function createWallClock(): Clock {
  let nextId = 1;
  const handles = new Map<number, ReturnType<typeof setTimeout>>();

  return {
    now() {
      return Date.now();
    },
    schedule(delayMs, callback) {
      const id = nextId;
      nextId += 1;
      const delay = normalizeDelay(delayMs);
      const handle = setTimeout(() => {
        handles.delete(id);
        callback();
      }, delay);
      handles.set(id, handle);
      return id;
    },
    cancel(timerId) {
      const handle = handles.get(timerId);
      if (handle === undefined) {
        return;
      }
      clearTimeout(handle);
      handles.delete(timerId);
    },
  };
}

export function createManualClock(startMs = 0): ManualClock {
  let nowMs = startMs;
  let nextId = 1;
  const pending: ScheduledTimer[] = [];

  return {
    now() {
      return nowMs;
    },
    schedule(delayMs, callback) {
      const id = nextId;
      nextId += 1;
      pending.push({ id, dueAt: nowMs + normalizeDelay(delayMs), callback });
      return id;
    },
    cancel(timerId) {
      const index = pending.findIndex((timer) => timer.id === timerId);
      if (index >= 0) {
        pending.splice(index, 1);
      }
    },
    advance(ms) {
      if (!Number.isFinite(ms) || ms < 0) {
        return;
      }

      const target = nowMs + ms;
      for (;;) {
        let nextIndex = -1;
        for (let index = 0; index < pending.length; index += 1) {
          const timer = pending[index];
          if (!timer || timer.dueAt > target) {
            continue;
          }
          const best = nextIndex >= 0 ? pending[nextIndex] : undefined;
          if (
            !best ||
            timer.dueAt < best.dueAt ||
            (timer.dueAt === best.dueAt && timer.id < best.id)
          ) {
            nextIndex = index;
          }
        }

        if (nextIndex < 0) {
          break;
        }

        const [timer] = pending.splice(nextIndex, 1);
        if (!timer) {
          break;
        }
        nowMs = timer.dueAt;
        timer.callback();
      }

      nowMs = target;
    },
  };
}

function normalizeDelay(delayMs: number): number {
  if (!Number.isFinite(delayMs) || delayMs <= 0) {
    return 0;
  }
  return delayMs;
}
