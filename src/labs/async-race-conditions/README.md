# Race Condition

## Problem

A race condition is a bug where the outcome depends on timing the program does not control. Overlapping operations can finish in a different order from the one they started in, and whichever finishes last can decide the result.

Search-as-you-type is that situation. Each change to the box starts a search without waiting for the previous one to finish. Those searches overlap, and latency decides which response arrives last. If every arrival writes the UI, a slow answer for an older query can replace the newer results. The input can still show the newer text while the list belongs to the older one. An older rejection can also wipe a newer success and show `Search failed` for a query that succeeded. The screen looks consistent and is wrong. The bug appears when the older request is the slower one, so it is intermittent and easy to miss on a fast network.

Two different mechanisms address that failure. Cancellation retires the obsolete request. A stale-response check refuses the write if the response arrives anyway. Request identity is how the UI tells those responses apart: each search gets a monotonic id, and "latest" means the highest id issued so far, not whichever promise is still running.

## Interactive Demonstration

Open Race Condition from the gallery. The card shows a lighthouse lit blue, messenger 2 waiting at the door, and messenger 1 still on the long route with an amber card. The lab opens on a guided lesson. The sidebar, scenario buttons, request log, timeline, and explanation are not on the page. The lesson is one card. The picture fills the wide column, with a strip under it that states the open channel and the light showing. The column beside it reads top to bottom: the chapter and how far through it you are, the step title, a short explanation, and one full-width action. Back and Restart the lesson sit under that action, and Back is absent on the first step. Skip to exploration, above the card, opens the full lab.

The strip is there from the first step. It reads None yet and Unlit until the story sets those values. When the light would send ships down the closed channel, that cell is tinted and says so.

The first chapter is the harbour. Ships follow the light: amber is the west channel, around the headland, and blue is the east channel, across the harbour. The keeper cannot see either channel, so a lookout at each one holds that channel's card, and the lamp stays unlit until the card is in hand. Tonight starts with the west channel open. While that boat is still out, a shoal closes the west channel and the keeper writes East over it. East's shorter route returns first and turns the lamp blue. The older west card is then at the door. A prediction is optional and does not advance the lesson. This keeper assumes the card that arrives answers the channel that is open now, because the first entry was written first, so the lamp turns amber and ships turn into the closed channel. The next step names that a race condition.

The second chapter states the number check, then replays the same night. The amber scene stays until Replay with this rule, which says the night is starting over. The east card matches the logbook and turns the lamp blue. The older west card still arrives and sits in Earlier reports, so it cannot send ships west. The lamp stays blue.

The third chapter is the same race in a read-only search box. The mock page takes the picture's place, each request is a numbered chip with its state, and the strip compares the text in the box with the results on screen. The mappings come one at a time: the text in the box is the open channel, sending a request asks for a card, the response is the card that comes back, the results are the light ships follow, and the envelope number is the request number. Apply every response shows results for `re` while the box says `rea`. Check the request number shows results for `rea` and does not display the older answer. A step delivers an answer only when its action says so. Explore the demo opens the full lab.

Exploration keeps the scenario buttons, Handling, timing, failure, timeline, request log, and explanation. Why this matters, How to handle it, and Related Concepts stay collapsed. Related Concepts names debouncing, real cancellation, cache lifetime, in-flight duplicates, and retries. Restart the lesson, in that sidebar, returns to the keeper. Out of order is seven steps, including its quiet opening. In order and Stale error are five. Same query is four. Show this in the lighthouse opens that variation and hides the scenario buttons and the explanation again. Skip to search demo, on a variation, returns to the search window.

See it in search, from a variation, runs that scenario in the current Handling mode. The default is Naive. The explanation maps the search box to the logbook, the results heading to the lamp, and the request rows to the envelopes, using the ids from that run. Typing or clearing leaves the bridge and uses the manual, cache, or clear explanation.

The search demo is the same session as before. Scenarios holds the runs and the Advanced controls. Hover tips stay in a reserved slot under the controls, including under Advanced when it is open. Starting a scenario clears the timeline and request list first. Each request is a lane. A numbered envelope leaves when the request is issued and travels for the scheduled delay, ending at a door. The lane colour identifies the request. It is not the signal colour. The outcome label changes when the request settles. A cache hit is a marker with no envelope.

- Walk through Out of order, then choose See it in search. The lab searches `re` at 600 ms, then `rea` at 50 ms. In naive mode the heading becomes Results for "re" while the box still says `rea`. Both envelopes end resolved, and the log shows both requests resolving. Protected keeps Results for "rea". The older request is `cancel-requested`, then `ignored`, and its envelope still travels the full 600 ms because the simulated work finishes.
- In order searches `re` for 50 ms, then `rea` for 600 ms. The shorter trip can arrive first, so the naive lighthouse shows an amber lamp before East's card covers it. The search heading ends on `rea` because the last write happened to be the open channel.
- Stale error uses the out-of-order timing and fails the slow `re` request. Pending is not a failure, so the blue lamp stays on while that messenger is out. Naive mode then applies the slip: the lamp goes dark, and the search page says `Search failed`. Protected ignores the slip and leaves `react` on screen.
- Same query searches `re` for 600 ms, then `re` again for 50 ms. Both cards are amber, so the lamp colour does not reveal which report was applied. The dispatch record and the request list do.
- Open Advanced, choose Fast or Slow, turn on Fail next when the next manual search should fail, and type a prefix. Fast and Slow do not change the scenario buttons. `re` matches several labels, `rea` matches `react`, and `zzz` matches nothing.
- Clearing the search box returns the explanation to the clear copy, advances an epoch in either mode, and removes the timeline and the request list. A response from the old epoch cannot write those back.
- Repeat a completed query. The timeline shows a cache-hit marker with no envelope, the log records `cache-hit`, and the lab does not start another search. A hit is not an ordering policy. In naive mode, a cache hit can still be overwritten if an older request finishes later.

The scenario buttons skip the cache read, so the delayed race can be repeated. They still store successes for a later typed query. The catalog is `react`, `redux`, `relay`, `rest`, `rendering`, `cache`, `cancellation`, `promise`, `proxy`, and `epoch`.

## Technical Approach

`scenarios.ts` is the only schedule. Out of order is `re` at 600 ms, then `rea` at 50 ms. In order swaps those delays. Stale error uses the out-of-order schedule and fails the first request. Same query is `re` at 600 ms, then `re` at 50 ms. `runScenario` and the harbour both read that table. Arrival order is the delay, then the id.

`settlementMayWrite` is the shared write rule: the session is mounted, the epoch matches, and either the mode is naive or the response id is the latest id. The session calls it when a response settles. The harbour calls it when the keeper acts, treating mounted and epoch as current. Exploration stories fold dispatch, arrival, and settlement beats. The guided harbour adds assign and depart, so the logbook can change before that messenger is drawn. Back renders an earlier fold. The protected replay is its own fold, so it does not silently repaint the amber lamp. Each step names a focus. The story does not model the cache or unmount.

The harbour is drawn on one `<canvas>`. `harbourPicture.ts` holds the geometry and the drawing: `sceneLayout` places the lighthouse, the two stations, the jetty, and the tray for a given size, `routePath` samples each messenger's route, and `drawHarbour` paints one picture from plain data. `harbourMotion.ts` moves the picture toward the current step: a boat's `travel` runs from its berth to the station and back, a boat only sails forward, and the lamp keeps its colour until the boat carrying the report has landed. `HarbourCanvas.tsx` sizes the canvas for the device pixel ratio, redraws on resize, and runs the frame loop only while something is moving. The canvas is hidden from assistive technology. The open channel and the light are stated in the strip under it and in the explanation, which are ordinary HTML, as is the search page. The list inside the canvas is its fallback content for a browser that cannot draw it.

The guided search uses the same session with promises that stay pending until the current step delivers them. Entering a step clears that session, resets its ids, and replays every cue up to the step. Leaving the step invalidates those promises. The timed simulator remains the exploration search.

`createSimulatedSearch` waits for an explicit delay, then returns prefix matches or the error `Search failed`. There is no network call. Aborting the signal does not cancel the delay, so an ignored envelope still travels its full scheduled length.

`useSearchSession` gives every search a monotonic id and an epoch. Clearing the query and unmount advance the epoch and abort in-flight requests in both modes. Protected mode also logs `cancel-requested` when a newer search retires an older one, and `ignored` when that retired search settles. Naive mode does not retire the previous id, so the older settlement still writes. Switching from naive to protected while a request is in flight also ignores that settlement, because the check reads the mode when the response arrives.

The session records one timeline span per request: the issue time from `performance.now()`, the configured `delayMs`, and an outcome. A cache hit has a delay of zero and draws a marker instead of an envelope. Settlement updates the outcome and leaves the geometry alone. `buildTimeline` scales those spans from the earliest start to the latest scheduled end. The same 50-row cap as the log applies. Clearing the query or starting a scenario removes both lists. A settlement from the cleared epoch does not write them back.

The cache key is the trimmed, lowercased query. Successful results are stored, including a success that was ignored as stale during the same epoch. Failures are not stored. A cleared or unmounted epoch does not keep the in-flight result for a later hit. The cache survives a mode switch and is discarded on unmount. A hit is applied immediately and does not call search.

While a scenario is on screen, the explanation comes from the live request ids, the Handling mode, and the results query. Typing or clearing changes the explanation kind, so that bridge goes away.

The gallery stores metadata in `src/labs/registry.ts` and maps the slug to the component in `src/labs/views.ts`. The page reads the URL hash, so this lab opens at `#async-race-conditions`.

## Trade-offs

The lighthouse routes are pictorial. The long route goes around the headland and the short route crosses the harbour. The timeline keeps the real 50:600 scale.

The guided lesson does not play on a timer. Back restores the assignment, the lamp, the messengers, and a prediction by folding from the start. The exploration search still waits 50 ms and 600 ms. On a desktop the picture, explanation, and action sit in one card, and the card is the same height on every step, so the action stays where it was. Two actions have labels that wrap to two lines. Those buttons grow upward and keep their bottom edge. Below 56rem the card stacks: title, picture, strip, explanation, action. The text stays at reading size there, so the card's height follows its content and the page can scroll.

A canvas has no elements to style, inspect, or query, so the scene's layout and motion are pure functions with their own tests, and the component test reads the drawing calls. Text on the canvas is drawn at the canvas's scale and does not follow the browser's text-size setting. The strip and the explanation do. The picture keeps a night palette in both colour schemes.

Reduced motion paints each step's final picture at once. A step can still leave a messenger mid-route, because that position comes from the step. Going back also paints at once, because a boat never sails backward. On the timeline, a travelling envelope snaps to the door, which is the scheduled end of the trip. Advancing the lesson moves focus to the step title. Arrow keys move the lesson only while focus is on its action group.

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
- Interaction tests render the lab with an injected search. The guided lesson checks step ids and outcomes: no card before a messenger arrives, an amber lamp while the assignment is East, Back restoring the blue lamp, a skipped prediction still reaching amber, and the older card in Earlier reports while the lamp stays blue. Restart returns to the keeper. The lesson has no separator, scenario toolbar, or explanation. Exploration has them. Guided search ends the naive run on results for `re` while the box reads `rea`, ends the protected run on results for `rea`, resolves a promise only on a delivery step, and ignores request 1, matching the shared schedule. Advancing moves focus to the step title. Arrow keys and reduced motion are covered. The strip reads None yet and Unlit on the first step, flags the amber light as sending ships west, and clears that flag in the checked replay. The card names the chapter and the place in it, and the next action is the first button in its group. The search strip flags results for `re` while the box says `rea`, and the request chips read On its way, Arrived, and Arrived, not displayed. Each exploration variation also opens before anyone is sent. The search tests still cover both modes, path width while both requests are pending, a numbered pending envelope, a numbered ignored envelope, a cache-hit marker with no envelope, the empty state, the current failure, and clear removing the timeline and the request list.
- Picture tests check that each route stays inside the canvas at 800×450 and 460×368 and that the long route is the longer one. Motion tests check that a departing boat stops part-way with no report showing, that the lamp changes only after its boat lands, that going back does not animate, and that a set-aside boat ends in the tray. Drawing tests record the logbook text, the envelope numbers, the tray label, and the amber and blue lamp fills.
- The gallery test opens the registered card, returns to the gallery, honors `#async-race-conditions` on load, and leaves an unknown hash on the gallery.

`pnpm check` is the gate: Oxlint, the test suite, and the production build.

A pass in headless Chrome stepped through all 31 lesson steps at 1440×900, 1280×800, 1024×768, and 390×844. At the three desktop sizes the card was one height on every step (533px, 533px, and 528px), the page did not scroll, and the action's bottom edge did not move. At 390×844 the card was between 739px and 926px tall and the page scrolled. Explanation text measured 16.8px at 1280×800 and at 390×844. Light and dark were both checked on the amber step and on the search mismatch.

From the keyboard, Tab reached Back to labs, Skip to exploration, and then the action. Enter and the right arrow advanced the lesson and moved focus to the step title with a visible outline. The next Tab returned to the action. The left arrow, from Back, went back a step.

With reduced motion, the canvas pixels 50 ms after sending messenger #1 matched the pixels two seconds later. With motion allowed they differed at 50 ms and ended on the same picture.

## Production Considerations

Abort the previous `fetch` when the query changes, and still ignore a response whose id is no longer current. Abort is not instantaneous, and some clients cannot abort.

Debounce or throttle input separately. Keep the stale-response check either way.

Limit the cache by size and age, and invalidate it when the underlying data changes. Do not cache failures. Deduplicating an identical in-flight query is optional and is not a substitute for ordering.

Keep the request log and the timing track in development. The track in this demo is scheduled delay, not measured network time. Show idle, loading, empty, and error states in the interface. Advance the epoch and abort when the component unmounts so a late response cannot update it.
