# Race Condition

## Problem

A race condition is a bug where the outcome depends on timing the program does not control. Overlapping operations can finish in a different order from the one they started in, and whichever finishes last can decide the result.

Search-as-you-type is that situation. Each change to the box starts a search without waiting for the previous one to finish. Those searches overlap, and latency decides which response arrives last. If every arrival writes the UI, a slow answer for an older query can replace the newer results. The input can still show the newer text while the list belongs to the older one. An older rejection can also wipe a newer success and show `Search failed` for a query that succeeded. The screen looks consistent and is wrong. The bug appears when the older request is the slower one, so it is intermittent and easy to miss on a fast network.

Two different mechanisms address that failure. Cancellation retires the obsolete request. A stale-response check refuses the write if the response arrives anyway. Request identity is how the UI tells those responses apart: each search gets a monotonic id, and "latest" means the highest id issued so far, not whichever promise is still running.

## Interactive Demonstration

Open Race Condition from the gallery. The card shows an earlier packet arriving in front of a later one. The experiment starts in naive mode. The timeline draws each request when it is issued. The left edge is the issue time. The length is the configured delay, shown in full immediately, so the overlap is visible before the response arrives. The outcome label changes when the request settles. The row text repeats the id, query, milliseconds, and outcome.

- Run the out-of-order scenario. The lab searches `re` with a 600 ms delay, then `rea` with a 50 ms delay, from the same start. The short bar ends while the long bar is still running. That gap is the race. In naive mode the `rea` results appear first, and the later `re` results replace them. The heading names `re` while the input still says `rea`. Both bars end as `resolved`, and the log shows both requests resolving.
- Choose Protected and run the same scenario. The bars have the same lengths. The newer request retires `re`, which the log records as `cancel-requested`. The long bar still occupies its full 600 ms, because the simulated work finishes, and its outcome becomes `ignored`. The `rea` results stay. The chart separates "the response arrived" from "the response was allowed to write." Cancellation retires the request. The id check decides whether that late settlement may write.
- Run the stale-error scenario. The slow `re` request fails after `rea` succeeds. Protected mode keeps the `rea` results and marks the long bar `ignored`. Naive mode replaces the success with the error and marks that bar `rejected`. A failure is subject to the same identity check as a success.
- Choose Fast or Slow, check Fail the next request when you want a failure, and type a prefix. `re` matches several labels, `rea` matches `react`, and `zzz` matches nothing.
- Clear returns the lab to idle and advances an epoch in either mode. The timeline keeps its bars, matching the log. A response from the old epoch cannot write, so a late arrival does not restore results.
- Repeat a completed query. The timeline shows a cache-hit marker with no duration, the log records `cache-hit`, and the lab does not start another search. A hit answers whether this query is already known. It is not an ordering policy. In naive mode, a cache hit can still be overwritten if an older request finishes later.

The scenario buttons skip the cache read, so the delayed race can be repeated. They still store successes for a later typed query. The catalog is `react`, `redux`, `relay`, `rest`, `rendering`, `cache`, `cancellation`, `promise`, `proxy`, and `epoch`.

## Technical Approach

`createSimulatedSearch` waits for an explicit delay, then returns prefix matches or the error `Search failed`. There is no network call. Aborting the signal does not cancel the delay, so an older request can still settle after a newer one. That is why an ignored bar still has its full scheduled length.

`useSearchSession` gives every search a monotonic id and an epoch. A response may update the UI only while the component is mounted and the epoch is unchanged. Clear and unmount advance the epoch and abort in-flight requests in both modes. Protected mode also requires the id to still be the latest id. It logs `cancel-requested` when a newer search retires an older one, and `ignored` when that retired search settles. Naive mode does not retire the previous id, so the older settlement still writes. Switching from naive to protected while a request is in flight also ignores that settlement, because the check reads the mode when the response arrives.

The session records one timeline span per request: the issue time from `performance.now()`, the configured `delayMs`, and an outcome. A cache hit has a delay of zero. Settlement updates the outcome and leaves the geometry alone. `buildTimeline` scales those spans from the earliest start to the latest scheduled end. The same 50-row cap as the log applies. Clear does not remove the spans.

The cache key is the trimmed, lowercased query. Successful results are stored, including a success that was ignored as stale during the same epoch. Failures are not stored. A cleared or unmounted epoch does not keep the in-flight result for a later hit. The cache survives a mode switch and is discarded on unmount. A hit is applied immediately and does not call search.

The gallery stores metadata in `src/labs/registry.ts` and maps the slug to the component in `src/labs/views.ts`. The page reads the URL hash, so this lab opens at `#async-race-conditions`.

## Trade-offs

The simulator finishes its delay after abort so the slow response stays visible and can be ignored. A production `fetch` usually rejects sooner. Cancelling the timer immediately would match that timing and would hide the late response this demo exists to show.

The id check decides whether a settlement may write. Abort marks the request as retired and gives the log a cancellation event. A response can still be ignored when it was not aborted, including after a switch from naive to protected mode while requests are in flight.

The timeline shows the scheduled delay, not the measured time until the promise settled. The full length is drawn when the request starts. A long idle gap before a later request shares that same axis, so every bar gets shorter. Each row still prints its scheduled milliseconds.

Debouncing is not part of the demo. Waiting for a typing pause would make the out-of-order scenario harder to reproduce. Debouncing reduces how often requests overlap. It does not decide which response may write.

A data library could provide query identity, cancellation, and a cache, and it would hide the gate this lab shows. Hash selection avoids a router dependency and works on GitHub Pages without a route fallback.

## Validation

Tests use deferred promises, fixed timestamps, or a fake timer advanced to the configured delay. They do not call the network or sleep for an arbitrary time.

- Catalog tests cover case, a narrower prefix, an unknown prefix, and an empty query.
- The simulator resolves after its delay even when the signal is already aborted, and a failed request rejects with `Search failed`.
- Timeline tests place a 600 ms bar and a 50 ms bar on one span, keep a later short request ending first, mark a cache hit as a zero-width marker, and leave the geometry unchanged when the outcome changes.
- Session tests show naive overwrite, protected preservation with `cancel-requested` and `ignored`, a stale failure in both modes, a current failure that is not cached, an empty result that is cached, clear, unmount, a cache hit, a stale success kept for a later query, a naive overwrite after a cache hit, and the 50-entry cap on the log and the timeline.
- Interaction tests render the lab with an injected search. They cover the on-page explanation of completion order, the stale write, and the difference between cancellation and the write gate. They also cover the out-of-order scenario in both modes, including bar width while both requests are pending and the later `ignored` outcome, the stale-error scenario, the empty state, the current failure, clear leaving the timeline in place, and a repeated query shown as a cache-hit marker.
- The gallery test opens the registered card, returns to the gallery, honors `#async-race-conditions` on load, and leaves an unknown hash on the gallery.

`pnpm check` is the gate: Oxlint, the test suite, and the production build.

## Production Considerations

Abort the previous `fetch` when the query changes, and still ignore a response whose id is no longer current. Abort is not instantaneous, and some clients cannot abort.

Debounce or throttle input separately. Keep the stale-response check either way.

Limit the cache by size and age, and invalidate it when the underlying data changes. Do not cache failures. Deduplicating an identical in-flight query is optional and is not a substitute for ordering.

Keep the request log and the timing chart in development. The chart in this demo is scheduled delay, not measured network time. Show idle, loading, empty, and error states in the interface. Advance the epoch and abort when the component unmounts so a late response cannot update it.
