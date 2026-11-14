export type Clock = {
  now: () => number;
  schedule: (callback: () => void, delayMs: number) => () => void;
};

export type ManualClock = Clock & {
  advance: (ms: number) => void;
};

type Timer = {
  due: number;
  seq: number;
  callback: () => void;
  cancelled: boolean;
};

export function createWallClock(): Clock {
  return {
    now: () => Date.now(),
    schedule: (callback, delayMs) => {
      const handle = setTimeout(callback, delayMs);
      return () => {
        clearTimeout(handle);
      };
    },
  };
}

export function createManualClock(): ManualClock {
  let time = 0;
  let seq = 0;
  const timers: Timer[] = [];

  function nextDue(limit: number): Timer | undefined {
    let chosen: Timer | undefined;
    for (const timer of timers) {
      if (timer.cancelled || timer.due > limit) {
        continue;
      }
      if (
        !chosen ||
        timer.due < chosen.due ||
        (timer.due === chosen.due && timer.seq < chosen.seq)
      ) {
        chosen = timer;
      }
    }
    return chosen;
  }

  return {
    now: () => time,
    schedule: (callback, delayMs) => {
      const timer: Timer = {
        due: time + delayMs,
        seq,
        callback,
        cancelled: false,
      };
      seq += 1;
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
    advance: (ms) => {
      const limit = time + ms;
      for (;;) {
        const timer = nextDue(limit);
        if (!timer) {
          break;
        }
        time = timer.due;
        timer.cancelled = true;
        timer.callback();
      }
      time = limit;
      const live = timers.filter((timer) => !timer.cancelled);
      timers.length = 0;
      timers.push(...live);
    },
  };
}
