export type Clock = {
  now: () => number;
  schedule: (callback: () => void, delayMs: number) => () => void;
};

export type ManualClock = Clock & {
  advance: (ms: number) => void;
};

type Scheduled = {
  id: number;
  due: number;
  callback: () => void;
  cancelled: boolean;
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

export function createManualClock(): ManualClock {
  let time = 0;
  let nextId = 0;
  const timers: Scheduled[] = [];

  function schedule(callback: () => void, delayMs: number): () => void {
    const entry: Scheduled = {
      id: ++nextId,
      due: time + delayMs,
      callback,
      cancelled: false,
    };
    timers.push(entry);
    return () => {
      entry.cancelled = true;
    };
  }

  function advance(ms: number) {
    const target = time + ms;
    while (true) {
      let bestIndex = -1;
      for (let index = 0; index < timers.length; index += 1) {
        const timer = timers[index];
        if (!timer || timer.cancelled || timer.due > target) {
          continue;
        }
        if (bestIndex === -1) {
          bestIndex = index;
          continue;
        }
        const best = timers[bestIndex];
        if (!best || timer.due < best.due || (timer.due === best.due && timer.id < best.id)) {
          bestIndex = index;
        }
      }

      if (bestIndex === -1) {
        break;
      }

      const chosen = timers[bestIndex];
      if (!chosen) {
        break;
      }
      chosen.cancelled = true;
      time = chosen.due;
      chosen.callback();
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
