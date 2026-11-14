# Retries

## Problem

A read can fail for a reason that may not last. Another attempt can recover that read. The retry is valid only inside three limits at once: an attempt budget, a backoff schedule, and the logical request that is still current.

The budget is 3 total attempts, including the first try. That is at most two retries. The first attempt starts immediately. With jitter off, the wait before attempt 2 is 200 ms and the wait before attempt 3 is 400 ms. The schedule is capped at 800 ms, so a hypothetical fourth wait would be 800 ms. The session never schedules that fourth wait. After a third transient outcome, the load stops with `Transient failure.` A permanent outcome stops on that attempt, including in bounded backoff, with `Permanent failure.` The failure text does not say the permanent outcome was retried.

The logical request is a monotonic id. A retry timer belongs to the id that armed it. A newer query, Clear, or unmount cancels that timer and moves the id forward. The callback checks the id when the timer fires, before it starts the next attempt, and checks the id again before writing. A stale timer must not start an attempt or store an outcome.

Writes are out of this example. A repeated write can apply twice. Writes also need idempotency, so a repeat is the same operation.

## Interactive Demonstration

The example starts in No retry mode, with jitter off and Advanced collapsed. The load window is labeled Load. It has a Query box and a Load button. The status line shows the result or the error. The logical request id, the attempt list, and the waiting period sit with that run. Each logical request keeps one lane color. Explanation names the current request. An older query can remain in the attempt list without becoming the result on screen.

- Recover loads `alpha` with a transient outcome and then success. In No retry mode the status is `Transient failure.` after one attempt. Waiting 1000 ms does not add another attempt.
- Choose Bounded backoff under Advanced, then Recover. The first attempt is transient and the wait is 200 ms. After that wait the second attempt succeeds, the status is `Loaded alpha`, and there is no third attempt.
- Attempt limit loads `alpha` with three transient outcomes. Bounded backoff records the second attempt after 200 ms and the third after 400 ms, then stops with `Transient failure.` Another 800 ms does not add a fourth attempt.
- Permanent loads `alpha` with a permanent outcome. Bounded backoff stops on that single attempt with `Permanent failure.`
- Supersede starts `alpha` (transient, then success) and then `beta` (success) in the same click, before any timer. The status is `Loaded beta` immediately. After the old wait would have elapsed, `alpha` still has one attempt row and the status stays `Loaded beta`.
- Clear waiting starts `alpha` and clears in that same click. The example returns to idle with an empty attempt list. A later wait does not add a row. Clear does the same when a run is already visible.
- The script control offers Success, Transient then success, Always transient, and Permanent. Only the manual Load button reads it. Scenarios ignore it. Scenarios also ignore the jitter switch: they pass jitter off, and they use the selected mode.
- The jitter switch applies to Load. With Bounded backoff and Transient then success, the scheduled wait is a reproducible integer below the 200 ms full delay, because each logical request starts `mulberry32` at seed 1. Full jitter can be 0. Advancing 0 ms runs that retry when the wait is 0. Advancing the full 200 ms reaches `Loaded alpha` on the second attempt either way, and a third attempt does not start. Turning the switch on does not change the scenario waits. Recover stays at 200 ms.

The attempt list shows the attempt number, the classification (`success`, `transient`, or `permanent`), and the query. The waiting period shows the scheduled delay while a retry timer is armed.

## Technical Approach

`waitBeforeAttempt(nextAttempt, jitter, random)` is the schedule. With jitter off, the delay is `min(800, 200 * 2^(n-2))` for attempt `n` of 2 or more, and 0 for an attempt before that. Attempt 2 waits 200 ms, attempt 3 waits 400 ms, and attempt 4 would wait 800 ms because `200 * 2^2` meets the cap. `useRetryLoad` stops once 3 attempts have started, so it never asks for attempt 4.

Jitter uses `mulberry32` from this folder, seeded with 1. The example does not call `Math.random`. Each `start` creates a fresh generator from that seed, so the run repeats and a later request does not continue the previous draws. With jitter on, the wait is `Math.floor(random() * fullDelay)`: an integer from 0 through `fullDelay - 1`, or 0 when the full delay is 0. With jitter off, the random function is not called.

Outcomes are a script of `success`, `transient`, and `permanent`. The outcome is applied when the attempt starts. The only delay is the backoff. `success` stores `Loaded ${query}` and stops. `permanent` stops immediately. `transient` stops immediately in `none` mode. In `backoff` mode it schedules another attempt while fewer than 3 have started. An index past the end of the script counts as permanent, so a short script cannot keep scheduling.

The id is checked twice for a reason. The timer callback checks it before starting the next attempt. Otherwise a stale timer could consume the next outcome and arm another timer. The attempt then checks the id again immediately before writing. In this example the outcome is already known, so the two checks run back to back. A production read would await between them, and the current request can change during that wait. The write is the moment that must still belong to the id.

`start` cancels any armed timer, assigns a new logical id, resets the generator, and runs attempt 1. `clear` cancels the timer, bumps the id, and returns to idle with an empty attempt list. Unmount cancels and bumps the id and does not call setState. The attempt log keeps the latest 50 records.

The clock provides `now`, `schedule`, and `cancel`. The session uses it for backoff timers only. The page uses a wall clock. Tests use a manual clock. `advance` fires due callbacks in time order, and a timer scheduled by a callback fires in that same advance only when its due time is still inside the window. A delay of 0 waits until `advance(0)`. Cancel removes the timer before it can fire.

`describeRetries` is pure. Idle happened text is `No load has started yet.` The returned strings carry the logical id, the attempt count, the classification of the latest attempt, `waitMs`, and the final outcome. After a supersede, the happened text names the current query.

`RetryLab` is the view. The gallery slug for the example is `retries`. The shared frame supplies the sidebar, the scenario toolbar, the Load window, and the explanation. Default mode is `none`. Advanced holds the mode, the jitter switch, and the script. Lane color cycles `--lane-1` through `--lane-8` by logical id.

## Trade-offs

The outcomes are scripted so the schedule can be repeated on demand. A real response would add latency of its own, and the second id check would sit after that latency.

Full jitter can be 0, which runs the next attempt on `advance(0)`. That is the formula used here. Scenarios pass jitter off so Recover, Attempt limit, and Permanent stay on 200 ms and 400 ms. The jitter switch applies to Load, and each load starts again from seed 1. A production draw would not be reproducible from a fixed seed.

The cap is part of `waitBeforeAttempt`, including for an attempt the session refuses to make. Putting an 800 ms wait on screen would mean a fourth try, which the budget excludes.

Cancel and the id check are both kept. Cancel covers the timer that is still in the clock. The id check covers a callback that runs anyway. The second check is the line that stores state, so the write does not rely on the earlier decision to start.

The attempt list keeps superseded rows until Clear. The old attempt stays visible. Explanation names the request that is allowed to own the screen.

Debouncing, cache lifetime, and in-flight duplicates are named in the sidebar and left out of the run. Each one changes when a read starts or how a stored response is reused. The attempt budget and the logical id are what decide a retry.

## Validation

`pnpm check` is the gate: Oxlint, the Vitest suite, and the production build. These tests drive the manual clock. They do not sleep, and they do not call `Math.random`.

- Backoff: attempt 2 waits 200 ms, attempt 3 waits 400 ms, and a hypothetical attempt 4 or 5 is capped at 800 ms. Jitter off does not call `random`. Two fresh `mulberry32(1)` generators produce the same integer wait, inside `0 .. delay-1`, and a 0 ms delay stays 0.
- Clock: `advance` fires in due order, equal times fire in schedule order, a follow-up fires in the same advance only when it is due, and cancel prevents the callback. A 0 ms timer waits for `advance(0)`. The wall clock uses the host timer, and cancel prevents that callback too.
- Session, backoff and `[transient, success]` for `alpha`: one attempt, status waiting, `waitMs` 200. `advance(199)` stays at one attempt. `advance(1)` succeeds with `Loaded alpha` and does not start a third attempt.
- Session, three transient outcomes: `advance(200)` then `advance(400)` yields 3 attempts and `Transient failure.` `advance(800)` does not add a fourth.
- Session, permanent in backoff mode: one attempt, `Permanent failure.`, and `advance(200)` does not add an attempt.
- Session, mode none and `[transient, success]`: one attempt, `Transient failure.`, no wait.
- Session, supersede: `alpha` then `beta` in the same turn, without advancing. The result is `Loaded beta`. `advance(1000)` does not give `alpha` a second attempt.
- Session, clear while waiting, including clear in the same turn as start: the log length is 0 and the status is idle. `advance(1000)` does not add an attempt.
- Session, unmount while waiting: advancing the clock does not throw.
- Session, jitter: two fresh runs with seed 1 schedule the same `waitMs` for the retries, and the first of those waits is below 200 ms.
- Session, the attempt log keeps the latest 50 records.
- Explanation: idle text is `No load has started yet.` A waiting retry includes the logical id, the transient classification, and 200 ms. A permanent stop names that failure and does not say it was retried. A superseded happened string names `beta` and does not name `alpha`.
- Interaction: idle copy, Advanced collapsed, and the Query field's accessible name. The sidebar states the 3-attempt budget and the 200 ms then 400 ms waits. The related topics are text, not links.
- Interaction, mode none and Recover: one transient failure, and `advance(1000)` is still one attempt.
- Interaction, Bounded backoff and Recover: `advance(200)` shows `Loaded alpha` and two attempts.
- Interaction, Attempt limit: 3 attempts and `Transient failure.` after `advance(200)` and `advance(400)`.
- Interaction, Permanent in backoff mode: one attempt and `Permanent failure.`
- Interaction, Supersede: the status is `Loaded beta` before any advance, and after `advance(1000)` it is still `Loaded beta` with one `alpha` row.
- Interaction, Clear waiting: idle after the click, and idle after `advance(1000)`.
- Interaction, jitter switch on, Bounded backoff, and Recover: the scheduled wait is finite, the same after a remount, and within 0 through 200 ms. The run reaches two attempts and `Loaded alpha` without a third. The manual Load path, with the switch on, schedules a wait below the 200 ms full delay and repeats that same wait on a fresh mount.

## Production Considerations

Retry a read that failed for a transient reason. Keep an attempt budget and a budget of elapsed time. Map permanent failures, including most client errors, so they stop on that attempt. This example uses the scripted outcome as the whole classification.

Cap the backoff. Full jitter spreads retries, and the formula here can return 0. Seed the generator only when a demo must repeat. The 200 ms wait, the 400 ms wait, and the 800 ms cap are the schedule this example shows.

Check the logical id when a retry timer fires, and check it again when the response is about to write. Cancel the timer when the query changes, on clear, and on unmount. A callback can already be running when cancel is called, which is why the id is checked again before the write.

Do not reuse this read policy for writes. A write that is sent again can apply twice. Writes also need an idempotency key the server can recognize.

Debounce input on its own. Bound a cache by size and age, and drop entries when the underlying data changes. Sharing one in-flight read across identical callers is optional. None of those decides the attempt budget or which logical id may write.

Keep an attempt log in development. This one keeps 50 rows. The waiting bar is the scheduled backoff, not measured network time.
