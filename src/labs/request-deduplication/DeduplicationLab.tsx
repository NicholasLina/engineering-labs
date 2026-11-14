import { useState, type CSSProperties } from "react";
import {
  ExampleFrame,
  Explanation,
  LabSplit,
  ScenarioBar,
  SegmentedControl,
  TooltipButton,
} from "../../ui/index.ts";
import { createWallClock, type Clock } from "./clock.ts";
import { describeDedup } from "./describeDedup.ts";
import {
  createInflightPool,
  type ConsumerId,
  type ConsumerSnapshot,
  type DedupMode,
  type InflightPool,
  type PoolState,
  type TransportSnapshot,
} from "./inflightPool.ts";
import { createSimulatedTransport, simulatedDelayMs, type Transport } from "./transport.ts";
import "./deduplication-lab.css";

const inFlightSample = `const inflight = new Map<string, Promise<string>>();

function load(key: string) {
  const pending = inflight.get(key);
  if (pending) {
    return pending;
  }

  const promise = fetchRecord(key).finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise;
}`;

function laneStyle(id: number): CSSProperties {
  const lane = ((id - 1) % 8) + 1;
  return { "--lane": `var(--lane-${lane})` } as CSSProperties;
}

function statusMessage(state: PoolState): string {
  const count = state.transports.length;
  const phrase = count === 1 ? "1 transport request" : `${count} transport requests`;
  const pending = state.transports.filter((record) => record.phase === "pending");
  const only = pending.length === 1 ? pending[0] : undefined;
  const lead =
    only && only.consumers.length === 2 ? `2 consumers, 1 request. ${phrase}` : phrase;
  return `${lead}. This is a simulation.`;
}

function consumerName(id: ConsumerId): string {
  return id === "a" ? "A" : "B";
}

function transportLine(record: TransportSnapshot): string {
  const names =
    record.consumers.length === 0
      ? "no consumers"
      : `${record.consumers.length} ${
          record.consumers.length === 1 ? "consumer" : "consumers"
        }: ${record.consumers.map(consumerName).join(", ")}`;
  return `#${record.id} ${record.key} ${record.phase} ${names}`;
}

function consumerLine(label: string, slot: ConsumerSnapshot): string {
  const key = slot.key ? ` ${slot.key}` : "";
  const value = slot.value ? slot.value : "no value";
  return `${label}${key} ${slot.phase} ${value}`;
}

function TransportItems({ records }: { records: readonly TransportSnapshot[] }) {
  if (records.length === 0) {
    return <p className="dedupe-empty">No transports yet.</p>;
  }

  return (
    <ol className="dedupe-transports">
      {records.map((record) => (
        <li
          key={record.id}
          className="dedupe-transport"
          data-phase={record.phase}
          style={laneStyle(record.id)}
        >
          {transportLine(record)}
        </li>
      ))}
    </ol>
  );
}

function ConsumerPanel({
  name,
  inputId,
  inputLabel,
  value,
  onChange,
  onRequest,
  onDetach,
  slot,
}: {
  name: string;
  inputId: string;
  inputLabel: string;
  value: string;
  onChange: (value: string) => void;
  onRequest: () => void;
  onDetach: () => void;
  slot: ConsumerSnapshot;
}) {
  return (
    <section className="dedupe-consumer" aria-label={name}>
      <h3>{name}</h3>
      <div className="dedupe-key">
        <label htmlFor={inputId}>{inputLabel}</label>
        <input
          id={inputId}
          value={value}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      </div>
      <div className="dedupe-actions">
        <button type="button" onClick={onRequest}>
          Request
        </button>
        <button type="button" onClick={onDetach}>
          Detach
        </button>
      </div>
      <p className="dedupe-phase">
        Phase {slot.phase}
        {slot.key ? ` for ${slot.key}` : ""}
      </p>
      <p className="dedupe-value">{slot.value ? slot.value : "No value yet."}</p>
      {slot.error ? <p className="dedupe-error">{slot.error}</p> : null}
    </section>
  );
}

export function DeduplicationLab({
  clock,
  transport,
}: {
  clock?: Clock;
  transport?: Transport;
}) {
  const [mode, setMode] = useState<DedupMode>("shared");
  const [keyA, setKeyA] = useState("atlas");
  const [keyB, setKeyB] = useState("atlas");
  const [snapshot, setSnapshot] = useState<PoolState | null>(null);
  const [session] = useState(() => {
    const activeClock = clock ?? createWallClock();
    const activeTransport = transport ?? createSimulatedTransport(activeClock);
    let pool: InflightPool;
    pool = createInflightPool({
      transport: activeTransport,
      mode: "shared",
      onChange: () => {
        setSnapshot(pool.getState());
      },
    });
    return { clock: activeClock, pool };
  });
  const { clock: activeClock, pool } = session;
  pool.setMode(mode);
  const state = snapshot ?? pool.getState();
  const copy = describeDedup(state);

  function requestConsumer(consumer: ConsumerId) {
    pool.request(consumer, consumer === "a" ? keyA : keyB);
  }

  function runSameKey() {
    setKeyA("atlas");
    setKeyB("atlas");
    pool.request("a", "atlas");
    pool.request("b", "atlas");
  }

  function runDifferentKeys() {
    setKeyA("atlas");
    setKeyB("borealis");
    pool.request("a", "atlas");
    pool.request("b", "borealis");
  }

  function runDetachA() {
    setKeyA("atlas");
    setKeyB("atlas");
    pool.request("a", "atlas");
    pool.request("b", "atlas");
    pool.detach("a");
  }

  function runFailThenRetry() {
    setKeyA("atlas");
    setKeyB("atlas");
    pool.request("a", "atlas", { fail: true });
    pool.request("b", "atlas", { fail: true });
    // Registered after the failed transport's timer, so the clock settles
    // that attempt before this pair starts a new request.
    activeClock.schedule(() => {
      pool.request("a", "atlas", { fail: false });
      pool.request("b", "atlas", { fail: false });
    }, simulatedDelayMs);
  }

  function runClear() {
    pool.reset();
    setKeyA("atlas");
    setKeyB("atlas");
  }

  return (
    <LabSplit
      className="dedupe-lab"
      labelledBy="dedupe-lab-title"
      sidebar={
        <>
          <p className="back-link">
            <a href="#labs">Back to labs</a>
          </p>
          <h2 id="dedupe-lab-title">Request Deduplication</h2>
          <div className="dedupe-intro">
            <p>
              Request deduplication means several consumers can share one pending
              request for the same key. An in-flight map remembers work that has
              started and has not finished. When that work settles, the key comes
              out of the map, whether the transport resolved or rejected. The next
              request starts a new transport call. This example keeps no result cache.
            </p>
            <p>
              Two consumers make the sharing visible. One consumer cannot show the
              difference between starting work and joining it. Consumer A and
              consumer B can ask for the same key. In shared mode the second
              request adds a subscriber and does not call the transport. In
              independent mode each request calls the transport, even when the key
              matches. A different key never shares that transport. If a consumer
              asks for a new key, it leaves the previous one first, and that
              transport aborts only when nobody is still subscribed.
            </p>
          </div>
          <section aria-label="Why this matters">
            <h3>Why this matters</h3>
            <p>
              A duplicate in-flight request wastes work, and the two responses can
              disagree about what the screen should show. Cancelling as soon as any
              consumer leaves can abort a request another consumer still needs.
              Keeping the finished value would answer the next caller without a new
              transport. That is a cache, and it is a separate choice from sharing
              work that is still pending.
            </p>
          </section>
          <section aria-label="How to handle it">
            <h3>How to handle it</h3>
            <p>
              Keep a map from the key to the pending promise. If the key is already
              there, hand back that promise. Delete the key when the promise
              settles, including when it rejects, so the next caller starts new
              work. Remember who subscribed, and abort the transport only when that
              set becomes empty.
            </p>
            <pre className="ui-code">
              <code>{inFlightSample}</code>
            </pre>
            <p>
              This simulation aborts only its own timer when nobody is still
              subscribed. It does not keep the finished value.
            </p>
          </section>
          <section aria-label="Not in this example">
            <h3>Not in this example</h3>
            <ul className="dedupe-related ui-stack">
              <li>
                <strong>Result caching and TTL</strong>
                <p>
                  A cache would answer a later caller with the finished value, and a
                  TTL would decide how long that answer stays. This example deletes
                  the key when the request settles.
                </p>
              </li>
              <li>
                <strong>Debouncing</strong>
                <p>
                  Waiting for a pause changes when a request starts. It does not let
                  two consumers share one that is already in flight.
                </p>
              </li>
              <li>
                <strong>Cancellation of a whole page of unrelated requests</strong>
                <p>
                  Leaving one key aborts that transport only when its subscribers
                  are gone. Other keys keep running.
                </p>
              </li>
              <li>
                <strong>Retries</strong>
                <p>
                  A later attempt is a new request. This example does not choose how
                  many times to try, or how long to wait between tries.
                </p>
              </li>
            </ul>
          </section>
        </>
      }
    >
      <ScenarioBar
        labelId="dedupe-scenarios-label"
        advancedPanelId="dedupe-advanced-panel"
        advanced={
          <SegmentedControl<DedupMode>
            label="Mode"
            labelId="dedupe-mode-label"
            value={mode}
            onChange={setMode}
            options={[
              {
                value: "independent",
                label: "Independent",
                tipId: "dedupe-tip-independent",
                tip: "Every consumer request calls the transport, even when the key matches.",
              },
              {
                value: "shared",
                label: "Shared",
                tipId: "dedupe-tip-shared",
                tip: "A key that is already in flight adds the consumer and does not call the transport again.",
              },
            ]}
          />
        }
      >
        <TooltipButton
          variant="primary"
          label="Same key"
          tipId="dedupe-tip-same"
          tip="Sets both keys to atlas and requests for A, then B, using the selected mode."
          onClick={runSameKey}
        />
        <TooltipButton
          variant="primary"
          label="Different keys"
          tipId="dedupe-tip-different"
          tip="Requests atlas for A and borealis for B."
          onClick={runDifferentKeys}
        />
        <TooltipButton
          variant="primary"
          label="Detach A"
          tipId="dedupe-tip-detach"
          tip="Both request atlas, then A detaches. B stays subscribed, so the transport keeps running."
          onClick={runDetachA}
        />
        <TooltipButton
          variant="primary"
          label="Fail then retry"
          tipId="dedupe-tip-retry"
          tip="Both request atlas with a failure. When that attempt settles, both request atlas again."
          onClick={runFailThenRetry}
        />
        <TooltipButton
          variant="outline"
          label="Clear"
          tipId="dedupe-tip-clear"
          tip="Detaches both consumers. A transport aborts only when that removes its last subscriber."
          onClick={runClear}
        />
      </ScenarioBar>

      <ExampleFrame label="Consumers">
        <div className="dedupe-consumers">
          <ConsumerPanel
            name="Consumer A"
            inputId="dedupe-key-a"
            inputLabel="Key for A"
            value={keyA}
            onChange={setKeyA}
            onRequest={() => {
              requestConsumer("a");
            }}
            onDetach={() => {
              pool.detach("a");
            }}
            slot={state.consumers.a}
          />
          <ConsumerPanel
            name="Consumer B"
            inputId="dedupe-key-b"
            inputLabel="Key for B"
            value={keyB}
            onChange={setKeyB}
            onRequest={() => {
              requestConsumer("b");
            }}
            onDetach={() => {
              pool.detach("b");
            }}
            slot={state.consumers.b}
          />
        </div>
        <p className="dedupe-status" role="status">
          {statusMessage(state)}
        </p>
        <section className="dedupe-transport-list" aria-label="Transport list">
          <h3>Transports</h3>
          <TransportItems records={state.transports} />
        </section>
      </ExampleFrame>

      <Explanation
        titleId="dedupe-explanation-title"
        happened={copy.happened}
        readout={[
          { term: "Consumers", detail: copy.consumers },
          { term: "Transports", detail: copy.transports },
          { term: "In flight", detail: copy.inflight },
        ]}
      >
        <div className="dedupe-record">
          <section aria-label="Consumer rows">
            <h3>Consumers</h3>
            <ol className="dedupe-rows">
              <li>{consumerLine("A", state.consumers.a)}</li>
              <li>{consumerLine("B", state.consumers.b)}</li>
            </ol>
          </section>
          <section aria-label="Transport rows">
            <h3>Transports</h3>
            <TransportItems records={state.transports} />
          </section>
        </div>
      </Explanation>
    </LabSplit>
  );
}
