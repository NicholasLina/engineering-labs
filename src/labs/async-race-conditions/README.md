# Race Condition

## Problem

An autocomplete request can finish after a newer request and overwrite the results on screen. The visitor is then looking at one query while the list belongs to another. Cancelling the obsolete request and refusing to apply a stale response address different parts of that failure.

## Interactive Demonstration

Open Race Condition from the gallery. The card shows an earlier packet arriving in front of a later one. The experiment starts in naive mode.

- Run the out-of-order scenario. The lab searches `re` with a 600 ms delay, then `rea` with a 50 ms delay. In naive mode the `rea` results appear first, and the later `re` results replace them. The heading names `re` while the input still says `rea`. The log shows both requests resolving.
- Choose Protected and run the same scenario. The `rea` results stay. The log shows `cancel-requested` for `re`, then `ignored` when that response finishes. The scenario always performs those two delayed searches, even when the same queries are already cached.
- Run the stale-error scenario. The slow `re` request fails after `rea` succeeds. Protected mode keeps the `rea` results. Naive mode replaces them with the error.
- Choose Fast or Slow, check Fail the next request when you want a failure, and type a prefix. `re` matches several labels, `rea` matches `react`, and `zzz` matches nothing.
- Clear returns the lab to idle. A response that arrives afterward does not restore results.
- Repeat a completed query. The log records `cache-hit` and the lab does not start another search. In naive mode, a cache hit can still be overwritten if an older request finishes later.

The catalog is `react`, `redux`, `relay`, `rest`, `rendering`, `cache`, `cancellation`, `promise`, `proxy`, and `epoch`.

## Technical Approach

`createSimulatedSearch` waits for an explicit delay, then returns prefix matches or the error `Search failed`. There is no network call. Aborting the signal does not cancel the delay, so an older request can still settle after a newer one.

`useSearchSession` gives every search a monotonic id and an epoch. A response may update the UI only while the component is mounted and the epoch is unchanged. Clear and unmount advance the epoch and abort in-flight requests in both modes. Protected mode also requires the id to still be the latest id. It logs `cancel-requested` when a newer search retires an older one, and `ignored` when that retired search settles. Naive mode does not retire the previous id, so the older settlement still writes.

The cache key is the trimmed, lowercased query. Successful results are stored, including a success that was ignored as stale during the same epoch. Failures are not stored. A cleared or unmounted epoch does not keep the in-flight result for a later hit. The cache survives a mode switch and is discarded on unmount. A hit is applied immediately, logs `cache-hit`, and does not call search. It does not by itself protect against an older naive response. The scenario buttons skip the cache read so the delayed race can be repeated; they still store successes for a later typed query.

The gallery stores metadata in `src/labs/registry.ts` and maps the slug to the component in `src/labs/views.ts`. The page reads the URL hash, so this lab opens at `#async-race-conditions`.

## Trade-offs

The simulator finishes its delay after abort so the slow response stays visible and can be ignored. A production `fetch` usually rejects sooner. Cancelling the timer immediately would match that timing and would hide the late response this demo exists to show.

The id check decides whether a settlement may write. Abort marks the request as retired and gives the log a cancellation event. A response can still be ignored when it was not aborted, including after a switch from naive to protected mode while requests are in flight.

Debouncing is not part of the demo. Waiting for a typing pause would make the out-of-order scenario harder to reproduce. Debouncing reduces how often requests overlap. It does not decide which response may write.

A data library could provide query identity, cancellation, and a cache, and it would hide the gate this lab shows. Hash selection avoids a router dependency and works on GitHub Pages without a route fallback.

## Validation

Tests use deferred promises or a fake timer advanced to the configured delay. They do not call the network or sleep for an arbitrary time.

- Catalog tests cover case, a narrower prefix, an unknown prefix, and an empty query.
- The simulator resolves after its delay even when the signal is already aborted, and a failed request rejects with `Search failed`.
- Session tests show naive overwrite, protected preservation with `cancel-requested` and `ignored`, a stale failure in both modes, a current failure that is not cached, an empty result that is cached, clear, unmount, a cache hit, a stale success kept for a later query, a naive overwrite after a cache hit, and the 50-entry log cap.
- Interaction tests render the lab with an injected search. They cover the out-of-order scenario in both modes, the stale-error scenario, the empty state, the current failure, clear, and a repeated cached query.
- The gallery test opens the registered card, returns to the gallery, honors `#async-race-conditions` on load, and leaves an unknown hash on the gallery.

`pnpm check` is the gate: Oxlint, the test suite, and the production build.

## Production Considerations

Abort the previous `fetch` when the query changes, and still ignore a response whose id is no longer current. Abort is not instantaneous, and some clients cannot abort.

Debounce or throttle input separately. Keep the stale-response check either way.

Limit the cache by size and age, and invalidate it when the underlying data changes. Do not cache failures. Deduplicating an identical in-flight query is optional and is not a substitute for ordering.

Keep the request log in development. Show idle, loading, empty, and error states in the interface. Advance the epoch and abort when the component unmounts so a late response cannot update it.
