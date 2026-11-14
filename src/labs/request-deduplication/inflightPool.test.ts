import { expect, test } from "vitest";
import { createManualClock } from "./clock.ts";
import { createInflightPool, type DedupMode } from "./inflightPool.ts";
import { createSimulatedTransport, type Transport } from "./transport.ts";

type Call = {
  key: string;
  signal: AbortSignal;
  fail: boolean;
  settle: (value: string) => void;
  failWith: (error: unknown) => void;
};

function harness(mode: DedupMode) {
  const calls: Call[] = [];
  const transport: Transport = ({ key, signal, fail }) => {
    let onOk: (value: string) => void = () => {};
    let onErr: (error: unknown) => void = () => {};
    const promise = {
      then(ok?: (value: string) => unknown, err?: (error: unknown) => unknown) {
        onOk = (value) => {
          ok?.(value);
        };
        onErr = (error) => {
          err?.(error);
        };
        return Promise.resolve();
      },
    } as Promise<string>;

    calls.push({
      key,
      signal,
      fail,
      settle: (value) => {
        onOk(value);
      },
      failWith: (error) => {
        onErr(error);
      },
    });
    return promise;
  };

  return { calls, pool: createInflightPool({ transport, mode }) };
}

test("shared mode uses one transport and clears the key when it settles", () => {
  const { pool, calls } = harness("shared");

  pool.request("a", "atlas");
  pool.request("b", "atlas");

  expect(calls).toHaveLength(1);
  expect(calls[0]?.key).toBe("atlas");
  let state = pool.getState();
  expect(state.transports.map((record) => record.id)).toEqual([1]);
  expect(state.transports[0]).toMatchObject({
    key: "atlas",
    phase: "pending",
    consumers: ["a", "b"],
  });
  expect(state.consumers.a.phase).toBe("pending");
  expect(state.consumers.b.phase).toBe("pending");
  expect(state.inflightKeys).toEqual(["atlas"]);

  calls[0]?.settle("Record atlas");

  state = pool.getState();
  expect(state.consumers.a).toMatchObject({ phase: "done", value: "Record atlas", error: "" });
  expect(state.consumers.b).toMatchObject({ phase: "done", value: "Record atlas", error: "" });
  expect(state.inflightKeys).toEqual([]);
  expect(state.transports[0]?.phase).toBe("settled");
});

test("independent mode starts a transport per consumer for the same key", () => {
  const { pool, calls } = harness("independent");

  pool.request("a", "atlas");
  pool.request("b", "atlas");

  const state = pool.getState();
  expect(calls).toHaveLength(2);
  expect(state.transports.map((record) => record.id)).toEqual([1, 2]);
  expect(state.transports[0]?.consumers).toEqual(["a"]);
  expect(state.transports[1]?.consumers).toEqual(["b"]);
  expect(state.inflightKeys).toEqual(["atlas", "atlas"]);
});

test("shared mode keeps different keys on different transports", () => {
  const { pool, calls } = harness("shared");

  pool.request("a", "atlas");
  pool.request("b", "borealis");

  const state = pool.getState();
  expect(calls.map((call) => call.key)).toEqual(["atlas", "borealis"]);
  expect(state.transports.map((record) => record.id)).toEqual([1, 2]);
  expect(state.inflightKeys).toEqual(["atlas", "borealis"]);
});

test("failure removes the in-flight key and the next request uses a new id", () => {
  const { pool, calls } = harness("shared");

  pool.request("a", "atlas", { fail: true });
  pool.request("b", "atlas", { fail: true });
  expect(calls).toHaveLength(1);
  expect(calls[0]?.fail).toBe(true);

  calls[0]?.failWith(new Error("Request failed"));

  let state = pool.getState();
  expect(state.inflightKeys).toEqual([]);
  expect(state.transports[0]?.phase).toBe("failed");
  expect(state.consumers.a).toMatchObject({ phase: "error", value: "", error: "Request failed" });
  expect(state.consumers.b.phase).toBe("error");

  pool.request("a", "atlas");
  pool.request("b", "atlas");

  state = pool.getState();
  expect(calls).toHaveLength(2);
  expect(state.transports.map((record) => record.id)).toEqual([1, 2]);
  expect(state.transports[1]).toMatchObject({ phase: "pending", key: "atlas" });
  expect(state.inflightKeys).toEqual(["atlas"]);
});

test("a finished value is not reused for the next caller", () => {
  const { pool, calls } = harness("shared");

  pool.request("a", "atlas");
  calls[0]?.settle("Record atlas");
  pool.request("b", "atlas");

  const state = pool.getState();
  expect(calls).toHaveLength(2);
  expect(state.consumers.a.value).toBe("Record atlas");
  expect(state.consumers.b).toMatchObject({ phase: "pending", value: "" });
  expect(state.inflightKeys).toEqual(["atlas"]);
});

test("a same-time retry starts only after the failed transport leaves the in-flight map", () => {
  const clock = createManualClock();
  const pool = createInflightPool({
    transport: createSimulatedTransport(clock),
    mode: "shared",
  });

  pool.request("a", "atlas", { fail: true });
  pool.request("b", "atlas", { fail: true });
  clock.schedule(() => {
    pool.request("a", "atlas");
    pool.request("b", "atlas");
  }, 400);

  clock.advance(400);

  let state = pool.getState();
  expect(state.transports.map((record) => record.phase)).toEqual(["failed", "pending"]);
  expect(state.transports.map((record) => record.id)).toEqual([1, 2]);
  expect(state.inflightKeys).toEqual(["atlas"]);
  expect(state.consumers.a.phase).toBe("pending");
  expect(state.consumers.b.phase).toBe("pending");

  clock.advance(400);

  state = pool.getState();
  expect(state.consumers.a.value).toBe("Record atlas");
  expect(state.consumers.b.value).toBe("Record atlas");
  expect(state.inflightKeys).toEqual([]);
  expect(state.transports).toHaveLength(2);
});

test("detaching one shared subscriber leaves the signal running for the other", () => {
  const { pool, calls } = harness("shared");

  pool.request("a", "atlas");
  pool.request("b", "atlas");
  pool.detach("a");

  expect(calls[0]?.signal.aborted).toBe(false);
  let state = pool.getState();
  expect(state.transports[0]).toMatchObject({ phase: "pending", consumers: ["b"] });
  expect(state.consumers.a).toMatchObject({ phase: "idle", value: "", key: "" });
  expect(state.consumers.b.phase).toBe("pending");

  calls[0]?.settle("Record atlas");

  state = pool.getState();
  expect(state.consumers.b).toMatchObject({ phase: "done", value: "Record atlas" });
  expect(state.consumers.a).toMatchObject({ phase: "idle", value: "" });
  expect(state.transports[0]?.phase).toBe("settled");
  expect(state.inflightKeys).toEqual([]);
});

test("detaching the last subscriber aborts and a late result updates nobody", () => {
  const { pool, calls } = harness("shared");

  pool.request("a", "atlas");
  pool.request("b", "atlas");
  pool.detach("a");
  expect(calls[0]?.signal.aborted).toBe(false);

  pool.detach("b");

  expect(calls[0]?.signal.aborted).toBe(true);
  expect(pool.getState().transports[0]?.phase).toBe("aborted");

  calls[0]?.settle("Record atlas");

  const state = pool.getState();
  expect(state.consumers.a).toMatchObject({ phase: "idle", value: "" });
  expect(state.consumers.b).toMatchObject({ phase: "idle", value: "" });
  expect(state.inflightKeys).toEqual([]);
  expect(state.transports[0]?.phase).toBe("aborted");
});

test("a new key aborts the previous transport only when that consumer was the last subscriber", () => {
  const { pool, calls } = harness("shared");

  pool.request("a", "atlas");
  pool.request("a", "borealis");

  expect(calls[0]?.signal.aborted).toBe(true);
  expect(calls[1]?.key).toBe("borealis");
  expect(calls[1]?.signal.aborted).toBe(false);

  let state = pool.getState();
  expect(state.transports[0]?.phase).toBe("aborted");
  expect(state.transports[1]).toMatchObject({
    key: "borealis",
    phase: "pending",
    consumers: ["a"],
  });
  expect(state.inflightKeys).toEqual(["borealis"]);
  expect(state.consumers.a).toMatchObject({ key: "borealis", phase: "pending", value: "" });

  calls[0]?.settle("Record atlas");
  expect(pool.getState().consumers.a).toMatchObject({ key: "borealis", value: "" });
});

test("switching keys leaves the previous transport running for a remaining subscriber", () => {
  const { pool, calls } = harness("shared");

  pool.request("a", "atlas");
  pool.request("b", "atlas");
  pool.request("a", "borealis");

  expect(calls[0]?.signal.aborted).toBe(false);
  expect(calls).toHaveLength(2);

  calls[0]?.settle("Record atlas");

  const state = pool.getState();
  expect(state.consumers.b.value).toBe("Record atlas");
  expect(state.consumers.a).toMatchObject({ key: "borealis", phase: "pending", value: "" });
});

test("shared failure then a fresh request starts a second transport", () => {
  const { pool, calls } = harness("shared");

  pool.request("a", "atlas", { fail: true });
  pool.request("b", "atlas", { fail: true });
  expect(calls).toHaveLength(1);

  calls[0]?.failWith(new Error("Request failed"));
  expect(pool.getState().inflightKeys).toEqual([]);

  pool.request("a", "atlas");
  pool.request("b", "atlas");

  expect(calls).toHaveLength(2);
  expect(calls[1]?.signal).not.toBe(calls[0]?.signal);
  expect(pool.getState().transports[0]?.phase).toBe("failed");
  expect(pool.getState().transports[1]?.phase).toBe("pending");
});

test("independent detach aborts only that consumer's transport", () => {
  const { pool, calls } = harness("independent");

  pool.request("a", "atlas");
  pool.request("b", "atlas");
  pool.detach("a");

  expect(calls[0]?.signal.aborted).toBe(true);
  expect(calls[1]?.signal.aborted).toBe(false);

  const state = pool.getState();
  expect(state.transports[0]?.phase).toBe("aborted");
  expect(state.transports[1]?.phase).toBe("pending");
  expect(state.consumers.a.phase).toBe("idle");
  expect(state.consumers.b.phase).toBe("pending");

  calls[1]?.settle("Record atlas");
  expect(pool.getState().consumers.b.value).toBe("Record atlas");
  expect(pool.getState().consumers.a.value).toBe("");
});

test("reset aborts in-flight work when it removes the last subscriber", () => {
  const { pool, calls } = harness("shared");

  pool.request("a", "atlas");
  pool.request("b", "atlas");
  pool.reset();

  expect(calls).toHaveLength(1);
  expect(calls[0]?.signal.aborted).toBe(true);

  const state = pool.getState();
  expect(state.inflightKeys).toEqual([]);
  expect(state.consumers.a.phase).toBe("idle");
  expect(state.consumers.b.phase).toBe("idle");
  expect(state.transports[0]?.phase).toBe("aborted");

  calls[0]?.settle("Record atlas");
  expect(pool.getState().consumers.a.value).toBe("");
  expect(pool.getState().consumers.b.value).toBe("");
});

test("reset aborts each key that loses its last subscriber", () => {
  const { pool, calls } = harness("shared");

  pool.request("a", "atlas");
  pool.request("b", "borealis");
  pool.reset();

  expect(calls[0]?.signal.aborted).toBe(true);
  expect(calls[1]?.signal.aborted).toBe(true);
  expect(pool.getState().inflightKeys).toEqual([]);
  expect(pool.getState().transports.map((record) => record.phase)).toEqual(["aborted", "aborted"]);
});
