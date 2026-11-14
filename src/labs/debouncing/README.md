# Debouncing

## Problem

Trailing-edge debounce waits until a burst of events pauses, then runs the action once. Each change cancels the previous timer and arms a new one. There is no request on the leading edge. The action runs after the latest change has been quiet for the whole interval.

Search-as-you-type is that situation. A burst of keystrokes can start a search on every letter, or it can wait and start once for the word the person actually typed. Waiting reduces how often a search starts. It does not decide which response may render. A search that already started can still finish after a newer one, and the slower response can belong to the older query.

Those are separate mechanisms. The timer chooses when work starts. A latest-id check, plus an epoch for clear and unmount, chooses which response may write. This example keeps that write gate for both Immediate and Debounced mode, so the visible difference is only when the search starts.

## Interactive Demonstration

The stage has the usual four parts. The sidebar defines trailing-edge debounce, shows a timer reset beside a latest-id check, and names real cancellation, cache lifetime, in-flight duplicates, and retries as plain text this example does not cover. Scenarios holds the runs, Clear, and Advanced. The search window is the page. Explanation describes the latest run from the session, then shows the keystrokes, the armed window, and the request log.

Advanced defaults to Immediate, an interval of 300 ms, and a response delay of 80 ms. Those three settings apply to typing in the search box. The scenario buttons use the selected strategy, and they do not use the Advanced interval or delay. Each scenario clears the run, then plays its events on the session clock.

- Rapid burst types `r`, `re`, `rea`, `reac`, and `react` at 0, 40, 80, 120, and 160 ms, with interval 300 ms and response delay 80 ms. Debounced mode arms one window and starts one search for `react` at 460 ms. Immediate mode starts five searches.
- Pauses types `re` at 0 ms and `rea` at 700 ms, with interval 300 ms and delay 80 ms. The gap is long enough for two searches: `re`, then `rea`.
- Clear pending types `re` at 0 ms and clears at 150 ms, inside a 300 ms window. The timer is cancelled. Advancing past 300 ms still starts nothing.
- Overlap types `re` at 0 ms and `rea` at 250 ms, with interval 200 ms and delay 500 ms. In Debounced mode the searches start at 200 ms and 450 ms. The `re` response is ignored. The results stay on `rea`. The same keystroke script in Immediate mode starts at 0 ms and 250 ms and also ignores the older response.
- Clear drops the query, the keystrokes, the log, and any armed timer immediately.
- Type or paste in the box to use the selected strategy, interval, and delay. An empty box clears the run and does not arm a timer.

The catalog is `react`, `redux`, `relay`, `rest`, and `rendering`. `re` matches all five. `rea` and `react` match `react`. The request rows use `--lane-1` through `--lane-8`, cycling by id. Times on the keystrokes and the log are milliseconds from the start of the current run.

## Technical Approach

`clock.ts` injects time. `createWallClock` uses `performance.now` and `setTimeout`. `createManualClock` starts at a given time, default 0, and `advance` fires due timers in `(time, id)` order. A callback may schedule another timer, and that timer fires in the same advance when it is still due. Cancel removes a timer.

`createDebounceScheduler` is a trailing-edge helper on that clock. `arm` cancels any pending fire and schedules one fire at `now + interval`. `pending` is `{ query, fireAt }` until the fire, which calls `onFire(query)` once and clears it. `cancel` drops the pending fire. The helper does not hide a `setTimeout` of its own.

`filterCatalog` is a case-insensitive prefix match. An empty query returns no rows. `createSimulatedSearch(clock)` resolves or rejects through `clock.schedule`. There is no abort signal. `fail` rejects `new Error("Search failed")`. The search settles even when the session will ignore it. The thenable runs its handlers inside the clock callback, so a manual `advance` applies the settlement before `advance` returns.

`useDebouncedSearch` gives every started search a monotonic id and keeps an epoch. Both strategies use the same write gate: mounted, the epoch still current, and the id still the latest id. An epoch change does not write results and does not append a log row, because clear already wiped the log. A matching epoch with a stale id appends `ignored` and leaves results and status alone. Log events are `started`, `resolved`, `ignored`, and `rejected`, capped at 50, as are keystrokes. The start count is the number of searches started in the run.

Immediate mode starts a search on every non-empty change. Debounced mode only arms the trailing timer. The search starts when that timer fires, with the query and the delay captured at arm time. `clear` and unmount increment the epoch and cancel the timer, so a previously scheduled fire does not start a search and a late response does not write. Empty input takes the same clear path and does not arm a timer. Status is idle, loading, success, empty, or error. Nothing is cached.

`describeDebounce` reads that session state. It does not know which button was clicked. Idle copy is `Nothing has been typed yet.` The other sentences come from the keystrokes, the armed flag, and the log.

`DebounceLab` is the view for slug `debouncing`. The default clock is the wall clock, and the default search uses that same clock. Scenario buttons reset the run, then schedule their script on the session clock.

## Trade-offs

The write gate does not change between strategies. A visitor can compare how often work starts without also comparing two different rules for which response may render. The cost is that Immediate mode will not demonstrate a naive last-write-wins bug. That bug belongs to the race example.

The simulator does not abort. An older search still finishes, and the log can show `ignored`. A production fetch usually rejects when it is aborted, which would hide the late response this example keeps on screen. Cancelling the debounce timer is not the same thing as cancelling the request.

Trailing edge only. A leading-edge request would start on the first keystroke and then wait, which is a different schedule. There is no cache, no shared in-flight request, no retry, and no control that fails a search from the page. A repeated query searches again.

Scenario scripts carry their own interval and delay so Advanced cannot quietly change a preset. Typed queries are the ones that follow Advanced.

The explanation counts started rows still in the log, which keeps 50 rows. The start-count line is every search started in the run. Once events fall off the log, those two numbers can differ. The clock times in the log are when the session recorded the event, measured from the run origin rather than from raw `performance.now()`.

## Validation

Tests use the manual clock or a deferred promise. They do not sleep for an arbitrary time, and they do not call the network.

- The manual clock fires timers in time-then-id order, omits a cancelled timer, and fires a timer that an earlier callback scheduled in the same advance when that timer is still due.
- The scheduler turns the burst `r` `re` `rea` `reac` `react` at 0, 40, 80, 120, and 160 ms with interval 300 into one fire at 460 ms for `react`. A pause fires `re` at 300 ms and `rea` at 1000 ms. Cancel at 150 ms prevents the 300 ms fire.
- Catalog tests cover case, a narrower prefix, an unknown prefix, and an empty query.
- The simulator resolves after its clock delay, rejects with `Search failed`, still settles an earlier search after a later one, and resolves an empty query to no rows.
- Session tests cover a debounced burst with one start for `react`, an immediate burst with five starts, two starts across a pause, clear at 150 ms with zero starts even after the window, debounced overlap that ignores `re` and keeps `rea`, the same overlap script in immediate mode, unmount of a scheduled fire and a late resolve, an empty input that does not arm a timer, a cleared epoch that adds no log row, a stale failure ignored beside a current failure, a repeated query that searches again, an empty success, and the 50-row cap.
- `describeDebounce` is tested for idle, an armed window with zero starts, a single applied search, and an ignored older response.
- Interaction tests render `DebounceLab` with a manual clock and the clock-backed search. They cover the idle explanation and the accessible name Search, a debounced burst that ends on one `react` result, an immediate burst with five starts, two starts across pauses, clear-pending with no start after 300 ms, debounced overlap that ignores `re` and shows `rea`, a burst that still uses the preset's 300 ms window and 80 ms delay after Advanced is set to 600 ms and 500 ms, and typing that follows the selected strategy.

`pnpm check` is the gate: Oxlint, the test suite, and the production build.

## Production Considerations

Debounce the input when you want fewer requests. Keep the stale-response check either way. A trailing timer and a latest-id gate answer different questions, and using only the timer leaves the late response free to write.

Cancel the debounce timer on clear and on unmount so a pending pause cannot start work after the screen is gone. Advance a generation as well, because a request that already started can still settle. Abort the underlying fetch when a newer query supersedes it, and still ignore a response whose id is no longer current. Abort is not instantaneous.

Decide cache size, age, and invalidation separately. Do not treat a shared in-flight request or a retry as a substitute for the write gate. A retry can deliver an older response after a newer one is already shown.

Keep the request log in development. Show idle, loading, empty, and error in the interface. The delays in this example are scripted. A production client should measure the network, not reuse these numbers as timeouts.
