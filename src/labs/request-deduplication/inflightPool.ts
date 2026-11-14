import type { Transport } from "./transport.ts";

export type ConsumerId = "a" | "b";
export type ConsumerPhase = "idle" | "pending" | "done" | "error";
export type TransportPhase = "pending" | "settled" | "failed" | "aborted";
export type DedupMode = "independent" | "shared";

export type ConsumerSnapshot = {
  key: string;
  phase: ConsumerPhase;
  value: string;
  error: string;
};

export type TransportSnapshot = {
  id: number;
  key: string;
  phase: TransportPhase;
  consumers: ConsumerId[];
};

export type PoolState = {
  consumers: Record<ConsumerId, ConsumerSnapshot>;
  transports: TransportSnapshot[];
  inflightKeys: string[];
};

export type InflightPool = {
  request: (consumer: ConsumerId, key: string, options?: { fail?: boolean }) => void;
  detach: (consumer: ConsumerId) => void;
  reset: () => void;
  getState: () => PoolState;
  setMode: (mode: DedupMode) => void;
};

type ConsumerState = ConsumerSnapshot & {
  generation: number;
};

type Flight = {
  controller: AbortController;
  subscribers: Map<ConsumerId, number>;
  record: TransportSnapshot;
};

const consumerIds: readonly ConsumerId[] = ["a", "b"];

function idleConsumer(): ConsumerState {
  return { key: "", phase: "idle", value: "", error: "", generation: 0 };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function listSubscribers(flight: Flight): ConsumerId[] {
  return consumerIds.filter((id) => flight.subscribers.has(id));
}

export function createInflightPool({
  transport,
  mode,
  onChange,
}: {
  transport: Transport;
  mode: DedupMode;
  onChange?: () => void;
}): InflightPool {
  let currentMode = mode;
  const consumers: Record<ConsumerId, ConsumerState> = {
    a: idleConsumer(),
    b: idleConsumer(),
  };
  const transports: TransportSnapshot[] = [];
  const pendingFlights: Flight[] = [];
  let nextId = 1;

  function notify() {
    onChange?.();
  }

  function removePending(flight: Flight) {
    const index = pendingFlights.indexOf(flight);
    if (index >= 0) {
      pendingFlights.splice(index, 1);
    }
  }

  function abortFlight(flight: Flight) {
    if (flight.record.phase !== "pending") {
      return;
    }
    flight.record.phase = "aborted";
    flight.record.consumers = [];
    flight.subscribers.clear();
    removePending(flight);
    flight.controller.abort();
  }

  function release(consumer: ConsumerId) {
    const flight = pendingFlights.find((item) => item.subscribers.has(consumer));
    if (!flight) {
      return;
    }
    flight.subscribers.delete(consumer);
    flight.record.consumers = listSubscribers(flight);
    if (flight.subscribers.size === 0) {
      abortFlight(flight);
    }
  }

  function clearSlot(consumer: ConsumerId) {
    const slot = consumers[consumer];
    slot.key = "";
    slot.phase = "idle";
    slot.value = "";
    slot.error = "";
  }

  function finish(
    flight: Flight,
    result: { ok: true; value: string } | { ok: false; error: string },
  ) {
    if (flight.record.phase !== "pending") {
      return;
    }

    // Drop the key before writing consumers. A settled or failed request is
    // not reused, including when the transport rejected.
    removePending(flight);
    flight.record.phase = result.ok ? "settled" : "failed";
    flight.record.consumers = listSubscribers(flight);

    for (const [consumer, generation] of flight.subscribers) {
      const slot = consumers[consumer];
      if (slot.generation !== generation || slot.phase !== "pending") {
        continue;
      }
      if (result.ok) {
        slot.phase = "done";
        slot.value = result.value;
        slot.error = "";
      } else {
        slot.phase = "error";
        slot.value = "";
        slot.error = result.error;
      }
    }

    flight.subscribers.clear();
    notify();
  }

  function failFlight(flight: Flight, error: unknown) {
    if (flight.record.phase === "aborted") {
      return;
    }
    if (isAbortError(error)) {
      abortFlight(flight);
      notify();
      return;
    }
    const message = error instanceof Error && error.message ? error.message : "Request failed";
    finish(flight, { ok: false, error: message });
  }

  function startFlight(consumer: ConsumerId, key: string, generation: number, fail: boolean) {
    const controller = new AbortController();
    const record: TransportSnapshot = {
      id: nextId,
      key,
      phase: "pending",
      consumers: [consumer],
    };
    nextId += 1;
    transports.push(record);
    const flight: Flight = {
      controller,
      subscribers: new Map([[consumer, generation]]),
      record,
    };
    pendingFlights.push(flight);

    void transport({ key, signal: controller.signal, fail }).then(
      (value) => {
        finish(flight, { ok: true, value });
      },
      (error: unknown) => {
        failFlight(flight, error);
      },
    );
  }

  function request(consumer: ConsumerId, key: string, options?: { fail?: boolean }) {
    const fail = options?.fail === true;
    const slot = consumers[consumer];

    if (currentMode === "shared" && slot.phase === "pending" && slot.key === key) {
      return;
    }

    if (slot.phase === "pending") {
      release(consumer);
    }

    slot.generation += 1;
    slot.key = key;
    slot.phase = "pending";
    slot.value = "";
    slot.error = "";

    if (currentMode === "shared") {
      const existing = pendingFlights.find((flight) => flight.record.key === key);
      if (existing) {
        existing.subscribers.set(consumer, slot.generation);
        existing.record.consumers = listSubscribers(existing);
        notify();
        return;
      }
    }

    startFlight(consumer, key, slot.generation, fail);
    notify();
  }

  function detach(consumer: ConsumerId) {
    consumers[consumer].generation += 1;
    release(consumer);
    clearSlot(consumer);
    notify();
  }

  function reset() {
    detach("a");
    detach("b");
  }

  function getState(): PoolState {
    return {
      consumers: {
        a: {
          key: consumers.a.key,
          phase: consumers.a.phase,
          value: consumers.a.value,
          error: consumers.a.error,
        },
        b: {
          key: consumers.b.key,
          phase: consumers.b.phase,
          value: consumers.b.value,
          error: consumers.b.error,
        },
      },
      transports: transports.map((record) => ({
        id: record.id,
        key: record.key,
        phase: record.phase,
        consumers: [...record.consumers],
      })),
      inflightKeys: pendingFlights.map((flight) => flight.record.key),
    };
  }

  return {
    request,
    detach,
    reset,
    getState,
    setMode: (next) => {
      currentMode = next;
    },
  };
}
