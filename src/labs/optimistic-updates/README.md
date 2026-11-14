# Optimistic Updates

## Problem

An optimistic update changes the screen before the server has accepted the work. The screen is predicting that the save will succeed. That prediction is what makes a slow save feel responsive. It is also what makes a wrong save visible: the card is already in the new column when the server rejects it or reports a newer revision.

A task board is that situation. Moving a card is one save. Waiting for the response leaves the card where the server last confirmed it, with a pending mark. Moving it immediately shows the visitor's intent, and the pending mark is what keeps that early move honest. Both strategies send the same request. The difference is when the column changes.

A rejection has to undo only the save that failed. A conflict has to say the server already stored something else, and the visitor has to choose which version to keep. If a second card was edited while the first save was in flight, that second edit has to survive.

## Interactive Demonstration

Open Optimistic Updates from the gallery. The card shows a kanban card that has already slid into the next column, with a round confirmation stamp still sitting in the previous one. The sidebar defines an optimistic update as a prediction of success, shows the move-then-confirm sequence, and shows the revision check that detects a conflict. It names dragging, offline queues, merging two editors, and an unknown delivery as issues this example does not cover. The experiment starts in optimistic mode. The stage has three sections. Scenarios holds the runs, Clear, and the Advanced controls. The board window is the page under test. Explanation describes the latest save, then shows the server list, the timeline, and the event list. The timeline draws each save when it is issued. The name sits in the caption. The left edge is the issue time. The length is the scheduled delay, shown in full immediately. Each save keeps one color, from `--lane-1` through `--lane-8`, on the bar and in the list. The outcome label changes when the save settles: Pending, Confirmed, Rejected, Rolled back, Conflict, or Ignored.

The board has To do, In progress, and Done. The four cards are Draft the brief, Label the samples, Review the mock, and Ship the notes. Each card has buttons named like "Move Draft the brief to In progress". The pressed button is the card's current column. After a move, focus stays on that same control in the card's new position.

- Run Successful save. The lab moves Draft the brief from To do to In progress. The save is scheduled for 400 ms. In optimistic mode the card moves immediately and shows Pending. The server list still shows To do at revision 1 until the save confirms, then In progress at revision 2. The explanation says the card moved before the server accepted it, then that the revision increased.
- Choose Wait for save and run the same scenario. The card stays in To do and shows Pending. It moves to In progress when the server confirms. The bar is the same 400 ms.
- Run Slow save. The same move is scheduled for 1600 ms. The pending mark stays up for that whole delay, so the wait is easy to see.
- Run Failed save. The same move is scheduled for 700 ms, then the server rejects it and leaves the revision unchanged. Optimistic mode returns only that card to To do and marks it Rolled back. Retry sends the same move again from the current revision. Wait for save never moves the card, and the mark still says Rolled back.
- Run Conflicting save. Review the mock is moved toward Done, scheduled for 800 ms. As that save is issued, the server moves Review the mock to To do and increments its revision. The save then conflicts. The card offers Keep mine and Use server. Keep mine writes the visitor's column onto the revision in the conflict response. Use server copies the server task into the confirmed board and clears the local choice.
- Open Advanced. Fast schedules a manual move, Retry, and Keep mine for 400 ms. Slow schedules them for 1600 ms. Fail next rejects only the next manual move, then turns off. Scenario buttons ignore it. Switching between Wait for save and Optimistic changes when the card moves and does not send a new request.
- Move a second card while a slow save is still pending. The first card's result does not move the second one. A second click on the same card updates the desired column and does not send another request. If the in-flight save confirms into a different column, one follow-up save is sent from the new revision.
- Clear restores the initial board and the initial server, empties the timeline and the event list, and advances a generation. A save that was already running resolves as Ignored and cannot write.

## Technical Approach

Three layers stay in memory. There is no network call.

`createBoardServer` keeps one revisioned task list. `save` waits the scheduled delay, then confirms, rejects, or conflicts. A confirm writes the requested column and increments that task's revision. A rejection leaves the task unchanged. A conflict is a revision that no longer matches the revision the save was based on, and the response includes the server's task. `reset` restores the initial list and bumps a generation. A save captured under an older generation resolves as Ignored and does not write.

`useBoardSession` keeps the last server snapshot the client accepted, one attempt per task, and that task's desired column. The attempt records the operation id, the column it asked for, the base revision, the scheduled delay, and a phase of `inflight`, `rejected`, or `conflict`. A response may update React state only while the component is mounted, the client generation matches, and the operation id is still that task's attempt. Clear, every preset, and unmount advance the generation. Switching strategy only changes the projection.

`projectBoard` decides the visible column. Wait for save shows the confirmed column for every phase. Optimistic mode shows the desired column while the attempt is in flight or in conflict. A rejection whose desired column is still the failed column returns the card to the confirmed column. A newer desired column stays.

The session records one timeline span per save: the issue time from `performance.now()`, the scheduled delay, and an outcome. Settlement updates the outcome and leaves the geometry alone. `buildSaveTimeline` scales those spans from the earliest start to the latest scheduled end. The log and the timeline keep the latest 50 entries. Clear removes both lists.

`describeBoard` reads the strategy, the latest event, the attempt phase, the scheduled delay, and whether the visible column matches the confirmed column. The explanation, the server readout, and the timeline are rendered from that state. Timing sentences use the scheduled delay.

The gallery stores metadata in `src/labs/registry.ts` and maps the slug to the component in `src/labs/views.ts`. The page reads the URL hash, so this experiment opens at `#optimistic-updates`.

## Trade-offs

Each task has one in-flight save. A second move updates the desired column and waits. On confirm, one follow-up is sent if the desired column is newer. A rejection does not send that follow-up by itself. Retry is the explicit second attempt. One current intent makes the rollback one effect, and a late response has one id to match. A queue of overlapping writes to the same task would make "which effect rolls back" harder to see, and this board does not need it.

The timeline shows the scheduled delay, not the measured time until the promise settled. The full length is drawn when the save starts. A long idle gap before a later save shares that same axis, so every bar gets shorter. The caption still prints the scheduled milliseconds.

Conflict recovery is a choice, not a merge. Keep mine writes the desired column onto the revision in the conflict response. Use server adopts the server task. The example does not combine two versions of the card, and it does not retry a conflict on its own.

The simulator always answers. A production save can time out or leave delivery unknown. Those endings are left out so every bar settles as confirmed, rejected, or conflict. Hash selection avoids a router dependency and works on GitHub Pages without a route fallback.

## Validation

Tests use deferred saves or a fake timer advanced to the scheduled delay. They do not call the network or sleep for an arbitrary time.

- Board tests cover wait mode staying in the confirmed column, an optimistic move before confirm, a rejection that returns only that card, a newer desired column that survives the rejection, and a conflict that keeps the desired column only in optimistic mode.
- Server tests cover a confirm that waits its delay and bumps one revision, a rejection that leaves the task unchanged, a conflict when the revision has already moved, an ignored save captured before reset, and two tasks confirming without sharing a revision.
- Timeline tests place bars by scheduled delay, keep the geometry when the outcome changes, and read lane colors from `--lane-1` through `--lane-8`.
- Session tests show a second task surviving a rollback, a newer desired column surviving an older rejection, one follow-up after confirm, Keep mine and Use server, clear and unmount dropping a late save, and the 50-entry cap.
- Interaction tests render the board with an injected server. They cover both strategies on a successful save and a slow save, failed rollback and retry, an independent manual edit during a slow save, both conflict choices, clear during a pending save, Fail next on one manual move, keyboard activation with focus on the moved control, and the explanation, server readout, and timeline for pending, confirmed, rollback, conflict, and clear.
- The gallery test opens `#optimistic-updates` and returns with the back link.

`pnpm check` is the gate: Oxlint, the test suite, and the production build.

## Production Considerations

Send the save when the visitor asks, and keep the predicted column tied to that operation id. Roll back only that id. A second edit to the same record can coalesce into one desired value, as it does here, or queue. Coalescing is easier to undo. A queue is needed when every intermediate write must be delivered.

Compare revisions, or another version token, on the server. Return the current record with the conflict so the client can offer the two versions. Do not apply the local write automatically onto a revision the client has not seen.

Ignore a response whose operation id is no longer current, and ignore one from a session that has been cleared or unmounted. A timeout and an unknown delivery need their own endings. This example always receives a response.

Keep the request log and the timing chart in development. The chart in this demo is scheduled delay, not measured network time. Show pending, confirmed, rolled back, and conflict on the card. Move focus with the card when the control that was activated is the one that changed columns.
