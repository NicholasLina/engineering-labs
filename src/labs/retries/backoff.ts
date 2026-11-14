export const maxAttempts = 3;
export const backoffBaseMs = 200;
export const backoffCapMs = 800;
export const jitterSeed = 1;

export function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function delayWithoutJitter(nextAttempt: number): number {
  if (nextAttempt < 2) {
    return 0;
  }

  return Math.min(backoffCapMs, backoffBaseMs * 2 ** (nextAttempt - 2));
}

export function waitBeforeAttempt(
  nextAttempt: number,
  jitter: boolean,
  random: () => number,
): number {
  const delay = delayWithoutJitter(nextAttempt);
  if (!jitter) {
    return delay;
  }

  return Math.floor(random() * delay);
}
