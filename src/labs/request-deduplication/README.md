# Request Deduplication

## Problem

Several parts of a screen can ask for the same record while the first request is still running. Each call starts its own network request unless something lets them share the one already in flight. That duplicate work costs capacity, and the two responses can disagree about what to show.

Sharing a pending request is not a result cache. The in-flight map holds a key only until that request settles. On success or on failure the key is removed immediately. The next caller does not receive the finished value. It starts a new transport call. A cache would answer that later caller without going back to the transport, and it would need a lifetime, a size limit, and a way to drop entries when the underlying record changes. Those are separate decisions. This example does not keep the finished value.

Cancellation has an owner. The transport belongs to the set of consumers still waiting on that key, not to the consumer who happened to start it. Detaching one consumer removes that subscriber. The transport aborts only when the set becomes empty. One consumer leaving must not cancel work another consumer still needs. A consumer that has detached must not apply a result that arrives later.

Keys are isolated. Two keys never share a transport, even in shared mode. If a consumer asks for a different key, it leaves the previous key first. That previous transport aborts only when the leaving consumer was the last subscriber.

## Interactive Demonstration

The screen is two consumers, A and B, and a list of transport calls. The status line counts those calls and says this is a simulation. The default mode is shared, so the first preset can show two consumers and one request. Advanced starts collapsed. It offers Independent and Shared. The scenario buttons use the mode that is selected when they run.

The sidebar defines pending-request sharing, says why two consumers make it visible, and shows a short in-flight map. It states that this simulation aborts only its own timer when nobody is still subscribed, and that it does not keep the finished value. Result caching and TTL, debouncing, cancellation of a whole page of unrelated requests, and retries are named as plain text. They are not links.

- Same key sets both fields to `atlas` and requests for A, then B. In shared mode the status shows one transport request and both consumers stay pending. After 400 ms both show `Record atlas`, and the in-flight list is empty. Running Same key again starts a new transport, so the count becomes 2. The finished value was not reused.
- Independent, then Same key, starts two transports before either resolves. Each consumer has its own call even though the key matches.
- Different keys requests `atlas` for A and `borealis` for B. Shared mode still starts two transports.
- Detach A requests `atlas` for both, then detaches A. The transport keeps running because B is still subscribed. After 400 ms only B shows `Record atlas`. A is idle and does not show the value. The transport rows say the call settled. The status and those rows do not say it aborted.
- Fail then retry requests `atlas` for both with a failure, and schedules a second pair 400 ms later. The failed transport's timer is registered first, so the clock rejects that attempt and removes the key before the retry starts. The retry is a new transport and waits its own 400 ms. After that second step both consumers show `Record atlas`, the in-flight list is empty, and the transport count is 2: one failed, one settled.
- Clear detaches both consumers. A transport aborts when that detach removes its last subscriber. The row stays, with phase aborted, and neither consumer shows a later value. Clear does not erase the transport list, so the abort remains visible. Consumers return to idle.

Each consumer has a key field, Request, and Detach. The fields are named Key for A and Key for B. Request uses the current field. If that key differs from the one the consumer is already waiting on, the consumer leaves the previous key first. The explanation reads the pool state: what happened, then Consumers, Transports, and In flight, then a row for each consumer and each transport. Transport rows take their color from `--lane-1` through `--lane-8` by id.

There is no network call. The 400 ms wait is the simulated transport's delay on the clock.

## Technical Approach

`Clock` exposes `now` and `schedule(callback, delayMs)`, which returns a cancel function. `createWallClock` uses `Date.now` and `setTimeout`. `createManualClock` starts at 0. `advance(ms)` moves time forward and runs due timers in order of due time, breaking ties by registration order. A timer scheduled from inside a callback gets a later sequence, so at the same due time it runs after timers that were already registered. A cancelled timer does not run on a later advance.

`Transport` is `(params: { key, signal, fail }) => Promise<string>`. `createSimulatedTransport(clock)` waits 400 ms on that clock. It resolves `Record ${key}`, or rejects `new Error("Request failed")` when `fail` is true. Abort removes the timer and rejects with a `DOMException` whose name is `AbortError`. A later `advance` does not resolve the aborted call. Settlement runs in the timer callback, before the clock runs the next timer due at the same instant. That is why Fail then retry cannot join the request it is replacing. This is a timer simulation, not a fetch.

`createInflightPool({ transport, mode })` serves only consumers `"a"` and `"b"`. `request(consumer, key, options?)` starts or joins work. `detach(consumer)` removes that subscriber. `reset()` detaches both. `getState()` returns the consumers, the transport records, and `inflightKeys`. It does not keep a map of completed values.

In shared mode, a pending key adds the consumer to that flight and does not call the transport. A consumer that is already pending on that same key is left as it is. In independent mode every request calls the transport, including a second consumer asking for the same key. A different key is always a different flight.

Each flight has an `AbortController` and a subscriber map from consumer to a generation number. Detach, and a request that leaves a key, increments that consumer's generation and deletes the subscriber. The controller aborts only when the set becomes empty. When the transport settles, the key is removed from the in-flight list before any consumer is updated. The value or the error is written only to subscribers whose generation still matches and whose phase is still pending. An abort rejection does not mark the transport failed. A late resolve after abort does not write either consumer.

Transport ids start at 1 and increase. Phases are `pending`, `settled`, `failed`, and `aborted`. After a failure the in-flight list is empty, and the next request uses a new id. `inflightKeys` has one entry per pending flight, so two independent calls for the same key list that key twice until each settles.

`describeDedup` is a pure function of that state. With no transports and both consumers idle, `happened` is `No request has started yet.` Otherwise it includes the transport count as `1 transport request` or `N transport requests`.

The screen passes an optional clock and transport into the pool. The default clock is the wall clock, and the default transport is the simulation on that clock. Scenario buttons call the pool synchronously. Fail then retry is the exception: it also schedules the second pair on the same clock, after the failed transport's timer.

## Trade-offs

The map forgets a key as soon as the request settles, including failure. A later caller always pays for a new transport. That keeps pending work and a result cache from being the same feature. The cost is that a repeated key cannot be answered from the value a neighbor already received.

Abort clears the simulated timer. A production response can still arrive after abort, so the pool also ignores a settlement once the phase is aborted or the subscriber generation no longer matches. The race-condition experiment leaves its delay running so a late response stays visible. This one must not, or the next timer at the same time could observe a key that should already be gone.

The subscriber set, not the consumer who started the call, owns cancellation. Detaching A while B remains leaves the signal unaborted. The cost is a small amount of bookkeeping per key, and a joiner cannot change the `fail` flag of a request that has already started.

The sidebar sample is only the map: return the pending promise, and delete the key in `finally`. It does not show the subscriber set. The pool adds that set because abort-on-first-detach would cancel work the other consumer still needs.

Only two consumers are modeled. That is enough to show "one leaves, one remains" and "each has their own call". It is not a general fan-in of an arbitrary number of callers.

Clear leaves the transport log in place. The aborted or settled row stays so the last run is still readable. It does not return the explanation to the idle sentence.

Mode is read when a request starts. Switching from shared to independent does not split a flight that is already pending.

## Validation

Tests drive a manual clock or a scripted transport. They do not call the network, and they do not sleep for the simulated delay. `pnpm check` runs Oxlint, the test suite, and the production build.

- The manual clock fires an earlier timer before a later one, and same-time timers in registration order. A cancelled timer does not run when time advances past it, or on a later advance. The wall clock's `schedule` returns a cancel function that prevents the callback.
- The simulated transport resolves `Record atlas` at 400 ms and not at 399 ms. With `fail`, it rejects `Request failed`. Abort rejects `AbortError`, and a later advance does not resolve. An already aborted signal rejects without waiting.
- Shared `atlas` from A and B is one transport id. Both are pending. One resolve writes `Record atlas` to both, and `inflightKeys` is empty.
- Independent `atlas` from A and B is two transport ids.
- Shared `atlas` and `borealis` are two transport ids.
- A shared failure leaves `inflightKeys` empty and phase `failed`. The next request uses a new id. A finished value is not reused when the other consumer asks for the same key.
- A retry scheduled at the same 400 ms starts only after the failed transport has left the in-flight list. Another 400 ms resolves `Record atlas` for both, with two transport records.
- Detaching A while B remains does not abort the signal. The resolve writes B only. A stays idle with no value. Detaching B as well aborts the signal, sets phase `aborted`, and a late resolve writes neither consumer.
- A alone switching from `atlas` to `borealis` aborts `atlas` and starts a new transport. A late `atlas` result does not write A. If B is still on `atlas`, that switch does not abort it, and B still receives the value.
- Independent detach aborts that consumer's transport and not the other consumer's transport for the same key.
- `reset` aborts a shared in-flight transport when the second detach removes the last subscriber, and it aborts each key that loses its last subscriber. A late resolve does not write either consumer.
- `describeDedup` returns `No request has started yet.` for the idle state. Two pending consumers on one transport produce `happened` text that includes `1 transport request`. A failure with an empty in-flight list says the request failed and nothing is in flight, and includes `1 transport request`. Two transports produce `2 transport requests`.
- Interaction tests render the screen with the manual clock and the default transport on that clock. They cover the idle sentence, collapsed Advanced, and the accessible names Key for A and Key for B. Shared Same key shows one transport and both pending, then `Record atlas` for both and an empty in-flight list after `advance(400)`, then a second Same key makes the transport count 2. Independent Same key shows two transports before resolve. Different keys show two transports. Detach A, after resolve, shows the record only on B, and the status and transport rows do not say the transport aborted. Fail then retry shows two transports after the first `advance(400)`, with the first call failed, and `Record atlas` for both after the second `advance(400)`.

## Production Considerations

Give each logical request a key that includes every input that changes the response. Different keys must not share a transport. A missing scope, tenant, or header in the key will hand one consumer another consumer's payload.

Keep the in-flight entry only while the promise is pending. Delete it in `finally`, including rejection, so a failure does not stick and a success does not become an accidental cache. Put a result cache beside that map if a later caller should reuse a finished value. Give the cache a size limit, a TTL or an explicit invalidation, and do not cache failures unless a negative cache is a deliberate product choice.

Own cancellation with the subscriber set. Abort the shared `fetch` only when the last subscriber leaves, or when the page itself is going away. Aborting on the first unsubscribe will cancel a neighbor that is still mounted. A generation or subscription token should still ignore a settlement that arrives after a consumer has detached, because abort is not instantaneous on every client.

Debouncing changes when a request starts. It does not share one that is already in flight. Retrying is a new request after the failed attempt has left the map. It should not join the promise that just rejected, and it needs its own limit and backoff. Cancelling every request on a page because one key's last subscriber left is a different operation. Route changes want that wider cancel. A single key's detach does not.

This simulation aborts only its own timer. A real transport can still deliver bytes after abort. Ignore that settlement when the subscriber set or the generation says the consumer is gone. Do not keep the finished value in the in-flight map.
