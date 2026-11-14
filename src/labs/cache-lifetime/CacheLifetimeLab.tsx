import { useState, type CSSProperties } from "react";
import {
  ExampleFrame,
  Explanation,
  LabSplit,
  ScenarioBar,
  TooltipButton,
} from "../../ui/index.ts";
import { cacheCapacity, cacheTtl } from "./cache.ts";
import type { CacheEviction } from "./cache.ts";
import { describeCache } from "./describeCache.ts";
import { useLookup } from "./useLookup.ts";
import type { LookupLogEntry } from "./useLookup.ts";
import "./cache-lifetime-lab.css";

const recordLanes: Record<string, string> = {
  ada: "var(--lane-1)",
  bea: "var(--lane-2)",
  cam: "var(--lane-3)",
};

const sourceFields = [
  { key: "ada", label: "Ada" },
  { key: "bea", label: "Bea" },
  { key: "cam", label: "Cam" },
] as const;

const freshSample = `function fresh(storedAt, ttl, now) {
  return now < storedAt + ttl;
}`;

function laneStyle(key: string): CSSProperties | undefined {
  const lane = recordLanes[key];
  if (lane === undefined) {
    return undefined;
  }
  return { "--lane": lane } as CSSProperties;
}

function resultText(result: LookupLogEntry | null): string {
  if (result === null) {
    return "No lookup yet.";
  }
  if (result.kind === "hit") {
    return `Hit ${result.key}: ${result.value}`;
  }
  if (result.kind === "source") {
    return `Source ${result.key}: ${result.value}`;
  }
  return `Miss ${result.key}`;
}

function logLine(entry: LookupLogEntry): string {
  if (entry.value === null) {
    return `${entry.kind} · ${entry.key} · tick ${entry.at}`;
  }
  return `${entry.kind} · ${entry.key} · ${entry.value} · tick ${entry.at}`;
}

function evictionLine(eviction: CacheEviction): string {
  return `${eviction.reason} · ${eviction.key} · tick ${eviction.at}`;
}

export function CacheLifetimeLab({ initialNow = 0 }: { initialNow?: number }) {
  const session = useLookup(initialNow);
  const [key, setKey] = useState("ada");
  const description = describeCache({
    now: session.now,
    log: session.log,
    entries: session.entries,
    evictions: session.evictions,
  });

  function firstHit() {
    session.reset();
    session.lookup("ada");
    session.lookup("ada");
  }

  function expire() {
    session.reset();
    session.lookup("ada");
    session.advance(4);
    session.lookup("ada");
    session.advance(1);
    session.lookup("ada");
  }

  function staleEdit() {
    session.reset();
    session.lookup("ada");
    session.setSource("ada", "Ada Lovelace (revised)");
    session.lookup("ada");
    session.invalidate("ada");
    session.lookup("ada");
  }

  function evict() {
    session.reset();
    session.lookup("ada");
    session.lookup("bea");
    session.lookup("cam");
  }

  function clear() {
    session.reset();
    setKey("ada");
  }

  return (
    <LabSplit
      className="cache-lab"
      labelledBy="cache-lab-title"
      sidebar={
        <>
          <p className="back-link">
            <a href="#labs">Back to labs</a>
          </p>
          <h2 id="cache-lab-title">Cache Lifetime</h2>
          <p>
            A stored record is fresh while now &lt; expiresAt and expired when now
            &gt;= expiresAt. Capacity is how many records the cache can hold.
            Invalidation removes a record on purpose, while that record would
            otherwise still be fresh.
          </p>
          <p>
            A directory lookup is that situation. The page stores a person&apos;s
            name so the next lookup can skip the source. Freshness, capacity, and
            invalidation decide whether that stored name comes back. The clock is
            a tick this page advances, so the same record can be fresh at tick 4
            and expired at tick 5.
          </p>
          <section aria-label="Why this matters">
            <h3>Why this matters</h3>
            <p>
              A stored name past its expiry is a value the source has already
              retired. Evicting a fresh name while an expired one stays makes the
              cache smaller than it looks. An edit that leaves the cached name in
              place shows the previous spelling on the next lookup.
            </p>
          </section>
          <section aria-label="How to handle it">
            <h3>How to handle it</h3>
            <p>
              Give each insert an absolute expiry. A later hit refreshes recency
              so capacity can drop the least-recent entry. The hit leaves storedAt
              and expiresAt unchanged.
            </p>
            <pre className="ui-code">
              <code>{freshSample}</code>
            </pre>
            <p>
              On insert, drop every entry with now &gt;= expiresAt before choosing
              a capacity victim. A new key that still finds the cache full evicts
              the lowest recency. Replacing a key that is already fresh resets
              that entry and leaves the other occupant in place. Invalidate when a
              source edit must show up on the next lookup.
            </p>
            <p>
              The policy in this example is TTL {cacheTtl}, capacity {cacheCapacity},
              hits do not extend TTL, and expired entries are dropped before LRU
              eviction.
            </p>
          </section>
          <section aria-label="Not in this example">
            <h3>Not in this example</h3>
            <ul className="ui-stack">
              <li>
                <strong>Background revalidation</strong>
                <p>
                  A production cache may refresh a record before a reader sees a
                  miss. This lookup reads the source when the entry is missing,
                  expired, or invalidated.
                </p>
              </li>
              <li>
                <strong>Debouncing</strong>
                <p>
                  Waiting for a pause between lookups changes how often the cache
                  is asked. Freshness, capacity, and invalidation stay separate
                  decisions.
                </p>
              </li>
              <li>
                <strong>Request cancellation</strong>
                <p>
                  These lookups finish in the turn that asks. There is no request
                  to abort.
                </p>
              </li>
              <li>
                <strong>In-flight duplicates</strong>
                <p>
                  Two lookups of one key stay independent. The second is a hit
                  while the entry is fresh, or another source read after it
                  expires.
                </p>
              </li>
              <li>
                <strong>Retries</strong>
                <p>A miss stays a miss. Nothing schedules another attempt.</p>
              </li>
            </ul>
          </section>
        </>
      }
    >
      <ScenarioBar labelId="cache-scenarios-label">
        <TooltipButton
          variant="primary"
          label="First hit"
          tipId="cache-tip-hit"
          tip="Resets, looks up ada, then looks up ada again. The second lookup is a hit."
          onClick={firstHit}
        />
        <TooltipButton
          variant="primary"
          label="Expire"
          tipId="cache-tip-expire"
          tip="Resets, looks up ada, advances to tick 4 for a hit, then to tick 5. That lookup reads the source."
          onClick={expire}
        />
        <TooltipButton
          variant="primary"
          label="Stale edit"
          tipId="cache-tip-stale"
          tip="Resets, looks up ada, revises the source, looks up again, invalidates ada, and looks up once more."
          onClick={staleEdit}
        />
        <TooltipButton
          variant="primary"
          label="Evict"
          tipId="cache-tip-evict"
          tip="Resets, then looks up ada, bea, and cam. Capacity keeps bea and cam."
          onClick={evict}
        />
        <TooltipButton
          variant="primary"
          label="Advance 1"
          tipId="cache-tip-advance"
          tip="Moves the clock forward one tick. Stored entries stay until a lookup or insert."
          onClick={() => {
            session.advance(1);
          }}
        />
        <TooltipButton
          variant="primary"
          label="Advance to expiry"
          tipId="cache-tip-expiry"
          tip="Moves the clock to the earliest expiresAt still stored. An empty cache leaves the clock alone."
          onClick={() => {
            session.advanceToExpiry();
          }}
        />
        <TooltipButton
          variant="outline"
          label="Clear"
          tipId="cache-tip-clear"
          tip="Restores the clock, cache, log, source records, and key."
          onClick={clear}
        />
      </ScenarioBar>

      <ExampleFrame label="Lookup">
        <div className="cache-lookup">
          <div className="cache-key">
            <label htmlFor="cache-key">Key</label>
            <input
              id="cache-key"
              type="text"
              value={key}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                setKey(event.target.value);
              }}
            />
          </div>
          <button
            type="button"
            className="ui-button ui-button-primary"
            onClick={() => {
              session.lookup(key);
            }}
          >
            Lookup
          </button>
        </div>
        <p className="ui-muted">Clock {session.now}</p>
        <p className="ui-muted" role="status">
          {resultText(session.result)}
        </p>
        <div className="cache-sources">
          {sourceFields.map((field) => (
            <label key={field.key} style={laneStyle(field.key)}>
              {field.label}
              <input
                type="text"
                value={session.source[field.key] ?? ""}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => {
                  session.setSource(field.key, event.target.value);
                }}
              />
            </label>
          ))}
        </div>
      </ExampleFrame>

      <Explanation
        titleId="cache-explanation-title"
        happened={description.happened}
        readout={[
          { term: "Clock", detail: description.clock },
          { term: "Lookup", detail: description.lookup },
          { term: "Cache", detail: description.cache },
        ]}
      >
        <section aria-label="Cache">
          <h3>Cache</h3>
          {session.entries.length === 0 ? (
            <p>The cache is empty.</p>
          ) : (
            <div className="cache-table-wrap">
              <table className="cache-table">
                <thead>
                  <tr>
                    <th scope="col">Key</th>
                    <th scope="col">Value</th>
                    <th scope="col">fresh/expired</th>
                    <th scope="col">storedAt</th>
                    <th scope="col">expiresAt</th>
                    <th scope="col">recency</th>
                  </tr>
                </thead>
                <tbody>
                  {session.entries.map((entry) => (
                    <tr key={entry.key} data-freshness={entry.freshness} style={laneStyle(entry.key)}>
                      <td>{entry.key}</td>
                      <td>{entry.value}</td>
                      <td>{entry.freshness}</td>
                      <td>{entry.storedAt}</td>
                      <td>{entry.expiresAt}</td>
                      <td>{entry.recency}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <div className="cache-split">
          <section aria-label="Evictions">
            <h3>Evictions</h3>
            {session.evictions.length === 0 ? (
              <p>No evictions yet.</p>
            ) : (
              <ol className="ui-stack">
                {session.evictions.map((eviction, index) => (
                  <li
                    key={`${eviction.at}-${eviction.reason}-${eviction.key}-${index}`}
                    style={laneStyle(eviction.key)}
                  >
                    {evictionLine(eviction)}
                  </li>
                ))}
              </ol>
            )}
          </section>
          <section aria-label="Lookup log">
            <h3>Lookup log</h3>
            {session.log.length === 0 ? (
              <p>No lookups yet.</p>
            ) : (
              <ol className="ui-stack">
                {session.log.map((entry, index) => (
                  <li key={`${entry.at}-${entry.kind}-${entry.key}-${index}`} style={laneStyle(entry.key)}>
                    {logLine(entry)}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </Explanation>
    </LabSplit>
  );
}
