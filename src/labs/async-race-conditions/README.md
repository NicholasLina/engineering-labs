# Race Condition

## Problem

A race condition is a bug where the outcome depends on timing the program does not control. Overlapping operations can finish in a different order from the one they started in, and whichever finishes last can decide the result.

Search-as-you-type is that situation. Each change to the box starts a search without waiting for the previous one to finish. Those searches overlap, and latency decides which response arrives last. If every arrival writes the UI, a slow answer for an older query can replace the newer results. The input can still show the newer text while the list belongs to the older one. An older rejection can also wipe a newer success and show `Search failed` for a query that succeeded. The screen looks consistent and is wrong. The bug appears when the older request is the slower one, so it is intermittent and easy to miss on a fast network.

Two different mechanisms address that failure. Cancellation retires the obsolete request. A stale-response check refuses the write if the response arrives anyway. Request identity is how the UI tells those responses apart: each search gets a monotonic id, and "latest" means the highest id issued so far, not whichever promise is still running.

## Interactive Demonstration

Open Race Condition from the gallery. The card shows a lighthouse lit blue, messenger 2 waiting at the door, and messenger 1 still on the long route with an amber card. The lab opens on that harbour. The sidebar stays short. Why this matters, How to handle it, and Related Concepts stay collapsed. Related Concepts names debouncing, real cancellation, cache lifetime, in-flight duplicates, and retries.

The lighthouse shows the signal for the keeper's current channel. The colour comes from that channel's station: West is amber and East is blue. Each assignment change writes a dispatch number and sends a messenger for that station's card. A messenger can bring back the right card for an assignment that has already changed. The scene keeps three facts visible: the current assignment, the signal on the lamp, and which dispatch produced it. A failure is a paper slip. A messenger who has not returned is pending and does not change the lamp. A dark lamp means the keeper applied a failed report.

The harbour opens on step 1 of Out of order. The scenario buttons and the explanation stay hidden until Skip to search demo or See it in search. Out of order is six steps. In order and Stale error are four. Same query is three. Next, Back, and Replay move through that sequence. Back on the first step stays there. Replay returns to the first step and clears predictions. The steps do not wait on a timer. A variation opens from the search demo through Show this in the harbour, which hides the scenario buttons and the explanation again. Skip to search demo opens the search window with nothing issued.

See it in search runs the selected scenario in the current Handling mode. The default is Naive. The explanation maps the search box to the logbook, the results heading to the lamp, and the request rows to the envelopes, using the ids from that run. Show this in the harbour returns to the first step of that variation. Typing or clearing leaves the bridge and uses the manual, cache, or clear explanation.

The search demo is the same session as before. Scenarios holds the runs and the Advanced controls. Hover tips stay in a reserved slot under the controls, including under Advanced when it is open. Starting a scenario clears the timeline and request list first. Each request is a lane. A numbered envelope leaves when the request is issued and travels for the scheduled delay, ending at a door. The lane colour identifies the request. It is not the signal colour. The outcome label changes when the request settles. A cache hit is a marker with no envelope.

- Walk through Out of order, then choose See it in search. The lab searches `re` at 600 ms, then `rea` at 50 ms. In naive mode the heading becomes Results for "re" while the box still says `rea`. Both envelopes end resolved, and the log shows both requests resolving. Protected keeps Results for "rea". The older request is `cancel-requested`, then `ignored`, and its envelope still travels the full 600 ms because the simulated work finishes.
- In order searches `re` for 50 ms, then `rea` for 600 ms. The shorter trip can arrive first, so the naive harbour shows an amber lamp before East's card covers it. The search heading ends on `rea` because the last write happened to be the current assignment.
- Stale error uses the out-of-order timing and fails the slow `re` request. Pending is not a failure, so the blue lamp stays on while that messenger is out. Naive mode then applies the slip: the lamp goes dark, and the search page says `Search failed`. Protected ignores the slip and leaves `react` on screen.
- Same query searches `re` for 600 ms, then `re` again for 50 ms. Both cards are amber, so the lamp colour does not reveal which report was applied. The dispatch record and the request list do.
- Open Advanced, choose Fast or Slow, turn on Fail next when the next manual search should fail, and type a prefix. Fast and Slow do not change the scenario buttons. `re` matches several labels, `rea` matches `react`, and `zzz` matches nothing.
- Clearing the search box returns the explanation to the clear copy, advances an epoch in either mode, and removes the timeline and the request list. A response from the old epoch cannot write those back.
- Repeat a completed query. The timeline shows a cache-hit marker with no envelope, the log records `cache-hit`, and the lab does not start another search. A hit is not an ordering policy. In naive mode, a cache hit can still be overwritten if an older request finishes later.

The scenario buttons skip the cache read, so the delayed race can be repeated. They still store successes for a later typed query. The catalog is `react`, `redux`, `relay`, `rest`, `rendering`, `cache`, `cancellation`, `promise`, `proxy`, and `epoch`.

## Technical Approach

`scenarios.ts` is the only schedule. Out of order is `re` at 600 ms, then `rea` at 50 ms. In order swaps those delays. Stale error uses the out-of-order schedule and fails the first request. Same query is `re` at 600 ms, then `re` at 50 ms. `runScenario` and the harbour both read that table. Arrival order is the delay, then the id.

`settlementMayWrite` is the shared write rule: the session is mounted, the epoch matches, and either the mode is naive or the response id is the latest id. The session calls it when a response settles. The harbour calls it when the keeper acts, treating mounted and epoch as current. The harbour state is a fold of dispatch, arrival, and settlement beats. Back renders an earlier fold. The protected ending is its own fold, so Back returns the naive scene. The story does not model the cache or unmount.

`createSimulatedSearch` waits for an explicit delay, then returns prefix matches or the error `Search failed`. There is no network call. Aborting the signal does not cancel the delay, so an ignored envelope still travels its full scheduled length.

`useSearchSession` gives every search a monotonic id and an epoch. Clearing the query and unmount advance the epoch and abort in-flight requests in both modes. Protected mode also logs `cancel-requested` when a newer search retires an older one, and `ignored` when that retired search settles. Naive mode does not retire the previous id, so the older settlement still writes. Switching from naive to protected while a request is in flight also ignores that settlement, because the check reads the mode when the response arrives.

The session records one timeline span per request: the issue time from `performance.now()`, the configured `delayMs`, and an outcome. A cache hit has a delay of zero and draws a marker instead of an envelope. Settlement updates the outcome and leaves the geometry alone. `buildTimeline` scales those spans from the earliest start to the latest scheduled end. The same 50-row cap as the log applies. Clearing the query or starting a scenario removes both lists. A settlement from the cleared epoch does not write them back.

The cache key is the trimmed, lowercased query. Successful results are stored, including a success that was ignored as stale during the same epoch. Failures are not stored. A cleared or unmounted epoch does not keep the in-flight result for a later hit. The cache survives a mode switch and is discarded on unmount. A hit is applied immediately and does not call search.

While a scenario is on screen, the explanation comes from the live request ids, the Handling mode, and the results query. Typing or clearing changes the explanation kind, so that bridge goes away.

The gallery stores metadata in `src/labs/registry.ts` and maps the slug to the component in `src/labs/views.ts`. The page reads the URL hash, so this lab opens at `#async-race-conditions`.

## Trade-offs

The harbour routes are pictorial. A 600 ms trip uses the full width and a 50 ms trip uses about a third of it, so the short route stays visible on a phone. The timeline keeps the real 50:600 scale.

The walkthrough does not play on a timer. Back can restore the lamp, the logbook, and the messengers without waiting out a delay. The search demo still waits 50 ms and 600 ms.

Reduced motion means different things in the two views. On the timeline, a travelling envelope snaps to the door, which is the scheduled end of the trip. In the walkthrough, a step can leave a messenger mid-route, because that position comes from the step.

The story describes cancellation as asking the messenger to turn back, and the log records `cancel-requested`. The simulator still lets that messenger arrive, so the keeper also checks the dispatch number. The same check applies to a card and to a failure slip. The story does not model the cache or a cleared screen. Those stay in the search demo, where the epoch blocks a late write.

The simulator finishes its delay after abort so the slow response stays visible and can be ignored. A production `fetch` usually rejects sooner. Cancelling the timer immediately would match that timing and would hide the late response this demo exists to show.

The id check decides whether a settlement may write. Abort marks the request as retired and gives the log a cancellation event. A response can still be ignored when it was not aborted, including after a switch from naive to protected mode while requests are in flight.

The timeline shows the scheduled delay, not the measured time until the promise settled. Each envelope's path length is drawn when the request starts, and the envelope animates along that path for `delayMs`. A long idle gap before a later request shares that same axis, so every path gets shorter. The lane label still prints its scheduled milliseconds.

Debouncing is not part of the demo. Waiting for a typing pause would make the out-of-order scenario harder to reproduce. Debouncing reduces how often requests overlap. It does not decide which response may write.

A data library could provide query identity, cancellation, and a cache, and it would hide the gate this lab shows. Hash selection avoids a router dependency and works on GitHub Pages without a route fallback.

## Validation

Tests use deferred promises, fixed timestamps, or a fake timer advanced to the configured delay. They do not call the network or sleep for an arbitrary time.

- Catalog tests cover case, a narrower prefix, an unknown prefix, and an empty query.
- The simulator resolves after its delay even when the signal is already aborted, and a failed request rejects with `Search failed`.
- Timeline tests place a 600 ms path and a 50 ms path on one span, keep a later short request ending first, mark a cache hit as a zero-width marker, and leave the geometry unchanged when the outcome changes.
- Schedule tests cover the four timings and `settlementMayWrite` for a stale success, a stale error, an unmounted session, and a changed epoch. Harbour tests check that each script's arrivals follow that schedule and that its naive and protected endings match the same predicate, including a pending slip that does not darken the lamp.
- Session tests show naive overwrite, protected preservation with `cancel-requested` and `ignored`, a stale failure in both modes, a current failure that is not cached, an empty result that is cached, clear, unmount, a cache hit, a stale success kept for a later query, a naive overwrite after a cache hit, and the 50-entry cap on the log and the timeline.
- Interaction tests render the lab with an injected search. They cover the harbour premise, the prediction pause, Back, Replay, keyboard steps, and reduced motion leaving a messenger on the route. They cover each variation's opening. See it in search runs the selected schedule, and the explanation names the box, the heading, and the request ids. Show this in the harbour returns to that variation. Typing and clearing leave the bridge. The search tests still cover both modes, path width while both requests are pending, a numbered pending envelope, a numbered ignored envelope, a cache-hit marker with no envelope, the empty state, the current failure, and clear removing the timeline and the request list.
- The gallery test opens the registered card, returns to the gallery, honors `#async-race-conditions` on load, and leaves an unknown hash on the gallery.

`pnpm check` is the gate: Oxlint, the test suite, and the production build.

## Production Considerations

Abort the previous `fetch` when the query changes, and still ignore a response whose id is no longer current. Abort is not instantaneous, and some clients cannot abort.

Debounce or throttle input separately. Keep the stale-response check either way.

Limit the cache by size and age, and invalidate it when the underlying data changes. Do not cache failures. Deduplicating an identical in-flight query is optional and is not a substitute for ordering.

Keep the request log and the timing track in development. The track in this demo is scheduled delay, not measured network time. Show idle, loading, empty, and error states in the interface. Advance the epoch and abort when the component unmounts so a late response cannot update it.
