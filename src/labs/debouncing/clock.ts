export type Clock = {
  now: () => number;
  schedule: (callback: () => void, delayMs: number) => () => void;
};

export type ManualClock = Clock & {
  advance: (ms: number) => void;
};

type Scheduled = {
  id: number;
  time: number;
  callback: () => void;
};

export function createWallClock(): Clock {
  return {
    now() {
      return performance.now();
    },
    schedule(callback, delayMs) {
      const handle = setTimeout(callback, delayMs);
      return () => {
        clearTimeout(handle);
      };
    },
  };
}

export function createManualClock(start = 0): ManualClock {
  let time = start;
  let nextId = 1;
  const timers = new Map<number, Scheduled>();

  function schedule(callback: () => void, delayMs: number) {
    const id = nextId;
    nextId += 1;
    timers.set(id, { id, time: time + delayMs, callback });
    return () => {
      timers.delete(id);
    };
  }

  function advance(ms: number) {
    const target = time + ms;
    for (;;) {
      let next: Scheduled | null = null;
      for (const timer of timers.values()) {
        if (timer.time > target) {
          continue;
        }
        if (
          next === null ||
          timer.time < next.time ||
          (timer.time === next.time && timer.id < next.id)
        ) {
          next = timer;
        }
      }
      if (next === null) {
        break;
      }
      timers.delete(next.id);
      time = next.time;
      next.callback();
    }
    time = target;
  }

  return {
    now() {
      return time;
    },
    schedule,
    advance,
  };
}
