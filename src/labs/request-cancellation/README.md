# Request Cancellation

## Problem

Stopping obsolete work and refusing an obsolete write are different jobs. Abort ends the local wait. An id check decides whether a response that arrives anyway may update the screen. A newer query can do one of those, or both.

Search-as-you-type is that situation. Each change can start a search while an older one is still running. If the older search is allowed to write, its rows replace the newer ones. If an abort is reported as a failure, the screen says `Search failed` for a query the visitor stopped. The screen can look settled and still be wrong.

The lifetime of a request is part of the evidence. The planned duration is the delay the search was given. The actual lifetime is the clock time from start to settlement. Those two numbers match when the work runs to completion. They do not match when the simulated timer is cleared early.

This page is a simulation. Aborting this simulated timer does not undo server work. Nothing here sends a request, and nothing here rolls back a write that a server already accepted.

## Interactive Demonstration

The card shows a timer cord cut short of its planned length. The experiment starts in Ignore mode, so the first Replace leaves the slow request running and then drops its write. The stage has the usual four parts. The sidebar defines the two jobs, shows an abort beside an id check, and names what this example leaves out. Scenarios holds Replace, Cancel early, Cancel late, Clear pending, and Advanced. The search window is the page under test. Explanation describes the latest run, then shows each request's planned duration and actual lifetime, and the outcome log.

- Run Replace. The lab searches `re` for 600 ms, then `rea` for 80 ms, in the selected mode. In Ignore mode both signals stay live. After 600 ms the `rea` results remain, `re` is `completed` and then `ignored`, and that slow request's lifetime is 600 ms, the same as its plan. `re` matches `react`, `redux`, `relay`, `rest`, and `rendering`. `rea` matches `react`.
- Choose Abort and guard and run Replace again. The first signal is aborted when `rea` starts. Its lifetime is 0 ms because the timer was cleared. Advancing past 600 ms does not put `re`'s matches on the heading. The `rea` results stay. The id check still runs: a result that arrives after the abort is ignored.
- Run Cancel early in Abort and guard. The lab searches `re` for 600 ms and cancels in the same turn. The log records `abort-requested` and `aborted`. The lifetime is 0 ms. There are no results, and the status does not say the search failed.
- Run Cancel late. The lab searches `re` for 0 ms and schedules cancel at 0 ms after that completion timer. One advance finishes the work first. The outcome stays `completed`. There is no `abort-requested` and no `aborted` row. Cancel of a request that has already settled is a no-op.
- Run Clear pending in Ignore mode. The epoch advances and the screen returns to idle. The timer is not aborted. When it later fires, it does not restore results or log rows. In Abort and guard, clear also aborts the signal.
- The Cancel button in the search window cancels the current request in the selected mode. It does not start a search. In Ignore mode it retires the id and leaves the timer running, so the later completion is `completed` and then `ignored`. In Abort and guard it aborts the signal.
- Open Advanced. Mode defaults to Ignore. Fail next applies to the next typed query only, then clears itself. Scenario buttons do not use it. A typed query waits 600 ms. A genuine failure says `Search failed` and is `failed`, not `aborted`.
- The status line says the transport is a simulation. Pending lifetimes display as running. Settled rows show the measured lifetime. Colors repeat `--lane-1` through `--lane-8`. Times on the rows are relative to the first request in the current list.

## Technical Approach

`createManualClock` and `createWallClock` live in this folder. `now()` reads the clock. `schedule` returns a cancel function. The manual clock's `advance(ms)` fires due timers in `(time, id)` order, including timers armed by a callback. Cancelling a timer removes it before it can run. The wall clock uses `performance.now` and `setTimeout`.

`createAbortableSearch(clock)` schedules one timer. If the signal is already aborted, it rejects immediately with `DOMException("The simulated transport was aborted", "AbortError")` and does not schedule. If the signal aborts before the timer fires, it clears that timer and rejects with the same exception. Advancing past the original delay does not resolve. If the timer fires, a later abort is ignored: the promise stays fulfilled, or, when `fail` is set, it rejects with `Error("Search failed")`. `isAbortError` is true only for a `DOMException` named `AbortError`.

The settlement notifies listeners inside the timer callback, before the manual clock moves to the next due timer. That is what makes Cancel late work on one `advance(0)`: the completion timer is registered first, so it settles the request before the cancel timer runs. The value returned from `then` is still a real promise, so `await` waits for a microtask. The race-condition simulator does the opposite on purpose: abort does not clear its delay, and the late response still arrives.

`useCancellationSession` keeps a monotonic id, an epoch, and the mode on a ref. A response may write only while the component is mounted, the epoch is unchanged, the id is still the latest id, and that id has not been retired. Ignore mode does not abort the previous signal. Abort mode aborts it, logs `abort-requested`, and logs `aborted` when the transport rejects with an abort. The lifetime is `endedAt - startedAt` on the injected clock, which is often 0 when the abort is synchronous.

A stale success or stale failure in the same epoch logs the work outcome (`completed` or `failed`) and then `ignored`. The results do not change. A current success sets status `success` or `empty` and write `applied`. A current failure sets status `error`, message `Search failed`, and outcome `failed`. An abort is not that failure. If the aborted request was the latest one and nothing older was applied, the screen returns to idle with no rows. If an older request was applied, those results come back.

`cancel()` does nothing when the latest request is not in flight. In Abort mode it aborts that controller. In Ignore mode it retires the id and clears loading without aborting. `clear()` increments the epoch, drops the screen to idle, and clears the log. It aborts in-flight controllers only in Abort mode. Unmount uses the same epoch and abort policy and does not call `setState`. A completion from the old epoch does not append log rows. The log keeps the latest 50 entries.

`describeCancellation` is a pure function of that state. With no requests, the happened line is `Nothing has been requested yet.` The readout covers the search window, the planned-versus-actual lifetime, and the outcome log.

The catalog is `react`, `redux`, `relay`, `rest`, and `rendering`. The filter is a case-insensitive prefix. An empty query returns no rows.

## Trade-offs

Ignore is the default so the first Replace shows a full lifetime that is then refused. Abort and guard is the stricter mode: it also clears the timer. The id check remains in both modes, because an abort is not proof that no response will arrive.

Lab 1's race-condition simulator finishes its delay after abort so the late response stays visible. This simulation clears the timer and rejects, which matches a typical `fetch` abort more closely and makes the lifetime shorter than the plan. It still cannot show a server rolling back work it has already done. That effect is out of scope.

Listeners run inside the timer callback so two delay-0 timers settle in registration order. A native promise reaction would let the cancel timer run before the completion handler. Callers that `await` the search still see ordinary promise timing.

Debouncing is not part of the demo. Waiting for a typing pause would make Replace harder to start in one turn. It does not decide which response may write. There is no cache, no in-flight deduplication, and no retry. A typed query always waits 600 ms. Scenario buttons pass their own delays and do not use Fail next.

The request list is not capped. The log is. A long typing session can leave more request rows than log rows.

## Validation

Tests use the manual clock or a deferred promise. They do not call the network or sleep for an arbitrary time.

- Catalog tests cover case and surrounding spaces, a narrower prefix, an unknown prefix, and an empty query.
- Clock tests cover time-then-id order, a timer armed by a callback, cancel, and delay-0 registration order.
- Transport tests abort before the delay and then advance past it, and the promise stays rejected without the timer callback running. Abort after completion leaves the fulfilled value. `fail: true` rejects with `Search failed` and `isAbortError` is false. An already aborted signal rejects without scheduling. A normal delay resolves prefix matches. An empty query resolves to no rows. A supplied catalog is used.
- Description tests cover idle copy (`Nothing has been requested yet.`), an aborted request planned for 600 ms that ran for 0 ms, and an ignored completion whose lifetime matches its 600 ms plan, with both `completed` and `ignored` in the log readout.
- Session tests, on the manual clock and the real abortable transport unless noted, cover Ignore mode Replace (`re` at 600 ms, then `rea` at 80 ms): both signals stay live, `rea` remains, `re` is completed then ignored, and both lifetimes equal their planned delays. Abort mode Replace aborts the first signal, does not apply `re` after 600 ms, and leaves `rea` in place with the first outcome `aborted`. Cancel before the 600 ms timer logs `abort-requested` and `aborted`, with lifetime 0, and a later advance does not resolve. Cancel after a delay-0 completion leaves `completed` and does not log `abort-requested`. A delay-0 cancel registered after the completion timer also stays `completed`. Clear while pending in Ignore mode does not abort, and the later completion does not restore results. Clear while pending in Abort mode aborts the signal, and later time does not resolve into the UI. Unmount does not throw. The current `fail: true` shows `Search failed` and is not `aborted`. A stale failure in Ignore mode does not replace a newer success. Further session tests cover Ignore-mode cancel without abort, restoring an older applied result, a deferred resolve that arrives after abort and is still ignored, an empty match, a blank query, cancel with nothing in flight, and the 50-entry log cap.
- Interaction tests render the lab with the manual clock. They cover idle copy, the collapsed Advanced panel, and the search box name Search. Ignore plus Replace, after `advance(600)`, shows `rea`, a log with `completed` and `ignored`, and a slow lifetime of 600 ms. Abort and guard plus Replace leaves the first request `aborted` and does not show `re` as the results heading. Cancel early in Abort mode is aborted with no results. Cancel late stays `completed` with no aborted event. Clear pending in Ignore mode is still idle after the advance. Fail next on a manual query shows `Search failed` and not an abort.

`pnpm check` is the gate: Oxlint, the test suite, and the production build.

## Production Considerations

Abort the previous `fetch` when the query changes, and still ignore a response whose id is no longer current. Clear and unmount need an epoch as well as the id, because a response can still be the newest id from a screen that is gone. Abort is not instantaneous, and some clients cannot abort. A response can arrive after `abort()` has been called.

Do not treat an abort as `Search failed`. Show idle, loading, empty, and error as separate states. Record planned duration and actual lifetime only when the end time is known; a pending request is still running.

Debounce or throttle input separately. Keep the stale-response check either way. Limiting a cache, deduplicating identical in-flight queries, and retrying failures are separate policies. A retry can deliver an older response after a newer one has already been shown.

Abort does not reverse server-side effects. A request that already committed a change needs its own compensation. This simulation never starts that work, so it cannot demonstrate the rollback. Keep the outcome log in development. The lifetimes here are the injected clock, not measured network time.
