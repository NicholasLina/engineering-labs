import { useEffect, useRef, useState } from "react";
import { jitterSeed, maxAttempts, mulberry32, waitBeforeAttempt } from "./backoff.ts";
import type { Clock } from "./clock.ts";

export type AttemptOutcome = "success" | "transient" | "permanent";

export type RetryMode = "none" | "backoff";

export type RetryStatus = "idle" | "waiting" | "success" | "failed";

export type AttemptRecord = {
  logicalId: number;
  attempt: number;
  outcome: AttemptOutcome;
  query: string;
};

export type RetryState = {
  logicalId: number | null;
  query: string;
  status: RetryStatus;
  attempts: readonly AttemptRecord[];
  waitMs: number | null;
  result: string | null;
  error: string | null;
};

export type RetryOptions = {
  mode: RetryMode;
  jitter: boolean;
};

export type RetrySession = RetryState & {
  start: (query: string, script: readonly AttemptOutcome[], options: RetryOptions) => void;
  clear: () => void;
};

const attemptLogLimit = 50;

type ArmedTimer = {
  clock: Clock;
  handle: number;
};

type Session = {
  mounted: boolean;
  logicalId: number;
  armed: ArmedTimer | null;
  clock: Clock;
  rng: () => number;
};

function idleState(): RetryState {
  return {
    logicalId: null,
    query: "",
    status: "idle",
    attempts: [],
    waitMs: null,
    result: null,
    error: null,
  };
}

function createSession(clock: Clock): Session {
  return {
    mounted: true,
    logicalId: 0,
    armed: null,
    clock,
    rng: mulberry32(jitterSeed),
  };
}

function cancelArmed(session: Session) {
  if (session.armed === null) {
    return;
  }
  session.armed.clock.cancel(session.armed.handle);
  session.armed = null;
}

function canWrite(session: Session, logicalId: number): boolean {
  return session.mounted && session.logicalId === logicalId;
}

function outcomeFor(script: readonly AttemptOutcome[], attempt: number): AttemptOutcome {
  const outcome = script[attempt - 1];
  if (outcome === "success" || outcome === "transient" || outcome === "permanent") {
    return outcome;
  }
  return "permanent";
}

function failureMessage(outcome: AttemptOutcome): string {
  if (outcome === "permanent") {
    return "Permanent failure.";
  }
  return "Transient failure.";
}

function statusFor(outcome: AttemptOutcome, retry: boolean): RetryStatus {
  if (outcome === "success") {
    return "success";
  }
  if (retry) {
    return "waiting";
  }
  return "failed";
}

export function useRetryLoad(clock: Clock): RetrySession {
  const [state, setState] = useState<RetryState>(idleState);
  const sessionRef = useRef<Session>(createSession(clock));

  useEffect(() => {
    sessionRef.current.clock = clock;
  }, [clock]);

  useEffect(() => {
    const current = sessionRef.current;
    current.mounted = true;
    return () => {
      current.mounted = false;
      cancelArmed(current);
      current.logicalId += 1;
    };
  }, []);

  function clear() {
    const session = sessionRef.current;
    cancelArmed(session);
    session.logicalId += 1;
    if (!session.mounted) {
      return;
    }
    setState(idleState());
  }

  function beginAttempt(
    logicalId: number,
    query: string,
    script: readonly AttemptOutcome[],
    options: RetryOptions,
    attempt: number,
  ) {
    const session = sessionRef.current;
    if (!canWrite(session, logicalId)) {
      return;
    }

    const outcome = outcomeFor(script, attempt);
    const record: AttemptRecord = { logicalId, attempt, outcome, query };
    const retry = outcome === "transient" && options.mode === "backoff" && attempt < maxAttempts;
    const waitMs = retry ? waitBeforeAttempt(attempt + 1, options.jitter, session.rng) : null;

    // Check the id again immediately before writing. The timer callback also
    // checks it before this function starts the next attempt.
    if (!canWrite(session, logicalId)) {
      return;
    }

    const status = statusFor(outcome, retry);
    setState((current) => ({
      logicalId,
      query,
      status,
      attempts: [...current.attempts, record].slice(-attemptLogLimit),
      waitMs: status === "waiting" ? waitMs : null,
      result: status === "success" ? `Loaded ${query}` : null,
      error: status === "failed" ? failureMessage(outcome) : null,
    }));

    if (!retry || waitMs === null) {
      return;
    }

    const activeClock = session.clock;
    const armed: ArmedTimer = { clock: activeClock, handle: 0 };
    armed.handle = activeClock.schedule(waitMs, () => {
      if (session.armed === armed) {
        session.armed = null;
      }
      if (!canWrite(session, logicalId)) {
        return;
      }
      beginAttempt(logicalId, query, script, options, attempt + 1);
    });
    session.armed = armed;
  }

  function start(query: string, script: readonly AttemptOutcome[], options: RetryOptions) {
    const session = sessionRef.current;
    cancelArmed(session);
    const logicalId = session.logicalId + 1;
    session.logicalId = logicalId;
    session.rng = mulberry32(jitterSeed);
    beginAttempt(logicalId, query, script, options, 1);
  }

  return { ...state, start, clear };
}
