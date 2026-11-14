import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import {
  ExampleFrame,
  Explanation,
  LabSplit,
  ScenarioBar,
  SegmentedControl,
  SwitchControl,
  TooltipButton,
} from "../../ui/index.ts";
import {
  columnLabel,
  columns,
  conflictDelayMs,
  failDelayMs,
  fastDelayMs,
  slowDelayMs,
  type CardMark,
  type ColumnId,
  type Strategy,
} from "./board.ts";
import { describeBoard, eventLabel, type BoardKind } from "./describeBoard.ts";
import type { BoardServer } from "./server.ts";
import { createBoardServer } from "./server.ts";
import { buildSaveTimeline, outcomeLabel, saveLaneColor, type SaveBar } from "./timeline.ts";
import { useBoardSession, type MoveOptions } from "./useBoardSession.ts";
import "./optimistic-updates.css";

const manualDelayTip =
  "This delay applies to a manual move, Retry, and Keep mine. The scenario buttons use their own scheduled delays.";

function barLabel(bar: SaveBar): string {
  return `#${bar.id} ${bar.title}, ${bar.delayMs} ms, ${outcomeLabel(bar.outcome)}`;
}

function laneStyle(id: number): CSSProperties {
  return { "--lane": saveLaneColor(id) } as CSSProperties;
}

function markLabel(mark: CardMark): string {
  if (mark === "pending") {
    return "Pending";
  }
  if (mark === "rolled-back") {
    return "Rolled back";
  }
  if (mark === "conflict") {
    return "Conflict";
  }
  return "Confirmed";
}

export function OptimisticUpdatesLab({ server }: { server?: BoardServer }) {
  const [ownedServer] = useState(() => server ?? createBoardServer());
  const [strategy, setStrategy] = useState<Strategy>("optimistic");
  const [delayMs, setDelayMs] = useState(fastDelayMs);
  const [failNext, setFailNext] = useState(false);
  const [kind, setKind] = useState<BoardKind>("idle");
  const focusTarget = useRef<{ taskId: string; column: ColumnId } | null>(null);
  const session = useBoardSession({ server: ownedServer, strategy });
  const copy = describeBoard({
    kind,
    strategy,
    visible: session.visible,
    confirmed: session.confirmed,
    serverTasks: session.serverTasks,
    attempts: session.attempts,
    desired: session.desired,
    log: session.log,
    requests: session.requests,
  });
  const timeline = buildSaveTimeline(session.requests);

  useLayoutEffect(() => {
    const target = focusTarget.current;
    if (!target) {
      return;
    }
    focusTarget.current = null;
    document.getElementById(`move-${target.taskId}-${target.column}`)?.focus();
  });

  function moveTask(taskId: string, column: ColumnId) {
    const active = document.activeElement;
    if (
      active instanceof HTMLButtonElement &&
      active.dataset.taskId === taskId &&
      active.dataset.column === column
    ) {
      focusTarget.current = { taskId, column };
    }

    const confirmed = session.confirmed.find((task) => task.id === taskId);
    const blocked = session.attempts.some((attempt) => attempt.taskId === taskId);
    const willSend = confirmed !== undefined && column !== confirmed.column && !blocked;
    const options: MoveOptions = { delayMs, fail: willSend && failNext };
    if (willSend) {
      setFailNext(false);
    }
    setKind("manual");
    session.move(taskId, column, options);
  }

  function runSuccess(delay: number) {
    setKind(delay === slowDelayMs ? "slow" : "success");
    session.clear();
    session.move("brief", "doing", { delayMs: delay, fail: false });
  }

  function runFailure() {
    setKind("failed");
    session.clear();
    session.move("brief", "doing", { delayMs: failDelayMs, fail: true });
  }

  function runConflict() {
    setKind("conflict");
    session.clear();
    session.replaceOnServer("mock", "todo");
    session.move("mock", "done", { delayMs: conflictDelayMs, fail: false });
  }

  return (
    <LabSplit
      className="optimistic-lab"
      labelledBy="optimistic-lab-title"
      sidebar={
        <>
          <p className="back-link">
            <a href="#labs">Back to labs</a>
          </p>
          <h2 id="optimistic-lab-title">Optimistic Updates</h2>
          <div className="optimistic-intro">
            <p>
              An optimistic update changes the screen before the server has accepted
              the work. The screen is predicting that the save will succeed. A pending
              mark means the prediction is still open. Confirmed means the server
              stored the change.
            </p>
            <p>
              This board is that prediction. Each card has one status. Wait for save
              and Optimistic send the same request. The difference is when the card
              changes columns.
            </p>
          </div>
          <section aria-label="Why responsiveness matters">
            <h3>Why responsiveness matters</h3>
            <p>
              A save scheduled for 400 ms can feel stuck when the card waits where it
              is. A save scheduled for 1600 ms makes that wait easy to see. Moving the
              card immediately feels responsive, and the pending mark is what keeps
              that early move honest.
            </p>
          </section>
          <section aria-label="How to handle it">
            <h3>How to handle it</h3>
            <p>
              Show the predicted column, remember which save it belongs to, and undo
              that save if the server rejects it. Other cards keep their own confirmed
              and pending edits.
            </p>
            <pre className="ui-code">
              <code>{`function move(task, to) {
  const op = { id: ++nextId, to, base: task.revision };
  show(task, to);
  const result = await save(op);
  if (result.ok && isCurrent(op)) confirm(result.task);
  else if (isCurrent(op)) rollback(op);
}`}</code>
            </pre>
            <p>
              <strong>Conflict detection</strong> compares the revision this save was
              based on with the revision on the server. When they differ, the server
              returns its task and the card asks what to keep.
            </p>
            <pre className="ui-code">
              <code>{`if (server.revision !== baseRevision) {
  return { conflict: server.task };
}`}</code>
            </pre>
          </section>
          <section aria-label="Not in this example">
            <h3>Not in this example</h3>
            <ul className="optimistic-related ui-stack">
              <li>
                <strong>Dragging cards</strong>
                <p>Status changes are buttons, so the keyboard path stays on the card that moved.</p>
              </li>
              <li>
                <strong>Offline queues</strong>
                <p>Every save here is sent immediately. Nothing waits for the network to return.</p>
              </li>
              <li>
                <strong>Merging two editors</strong>
                <p>A conflict offers Keep mine or Use server. It does not combine two versions of the card.</p>
              </li>
              <li>
                <strong>An unknown delivery</strong>
                <p>Each save ends confirmed, rejected, or in conflict. The response always arrives.</p>
              </li>
            </ul>
          </section>
        </>
      }
    >
      <ScenarioBar
        labelId="optimistic-scenarios-label"
        advancedPanelId="optimistic-advanced-panel"
        advanced={
          <>
            <SegmentedControl<Strategy>
              label="Update"
              labelId="optimistic-strategy-label"
              value={strategy}
              onChange={setStrategy}
              options={[
                {
                  value: "wait",
                  label: "Wait for save",
                  tipId: "optimistic-tip-wait",
                  tip: "The card stays in its confirmed column and shows Pending. It moves when the server accepts the save.",
                },
                {
                  value: "optimistic",
                  label: "Optimistic",
                  tipId: "optimistic-tip-optimistic",
                  tip: "The card moves immediately and shows Pending until the save confirms, rolls back, or conflicts.",
                },
              ]}
            />
            <SegmentedControl<"fast" | "slow">
              label="Delay"
              labelId="optimistic-delay-label"
              value={delayMs === slowDelayMs ? "slow" : "fast"}
              onChange={(value) => {
                setDelayMs(value === "slow" ? slowDelayMs : fastDelayMs);
              }}
              options={[
                { value: "fast", label: "Fast", tipId: "optimistic-tip-fast", tip: manualDelayTip },
                { value: "slow", label: "Slow", tipId: "optimistic-tip-slow", tip: manualDelayTip },
              ]}
            />
            <div className="ui-tool">
              <span className="ui-tool-label" id="optimistic-fail-label">
                Failure
              </span>
              <SwitchControl
                label="Fail next"
                checked={failNext}
                tipId="optimistic-tip-fail"
                tip="Rejects the next manual move, then turns off. Scenario buttons, Retry, and Keep mine ignore it."
                onChange={setFailNext}
              />
            </div>
          </>
        }
      >
        <TooltipButton
          variant="primary"
          label="Successful save"
          tipId="optimistic-tip-success"
          tip="Moves Draft the brief from To do to In progress. The save is scheduled for 400 ms, then the server accepts it."
          onClick={() => {
            runSuccess(fastDelayMs);
          }}
        />
        <TooltipButton
          variant="primary"
          label="Slow save"
          tipId="optimistic-tip-slow-save"
          tip="Moves Draft the brief from To do to In progress. The save is scheduled for 1600 ms, then the server accepts it."
          onClick={() => {
            runSuccess(slowDelayMs);
          }}
        />
        <TooltipButton
          variant="primary"
          label="Failed save"
          tipId="optimistic-tip-failed"
          tip="Moves Draft the brief from To do to In progress. The save is scheduled for 700 ms, then the server rejects it."
          onClick={runFailure}
        />
        <TooltipButton
          variant="primary"
          label="Conflicting save"
          tipId="optimistic-tip-conflict"
          tip="Moves Review the mock toward Done, scheduled for 800 ms. The server first moves that task to To do, so the save conflicts."
          onClick={runConflict}
        />
        <TooltipButton
          variant="outline"
          label="Clear"
          tipId="optimistic-tip-clear"
          tip="Restores the initial board and server. A save that is still running cannot write after this."
          onClick={() => {
            setKind("cleared");
            session.clear();
          }}
        />
      </ScenarioBar>

      <ExampleFrame label="Board">
        <div className="board">
          {columns.map((column) => (
            <section key={column.id} className="board-column" aria-label={column.label}>
              <h3>{column.label}</h3>
              <ul>
                {session.visible
                  .filter((task) => task.column === column.id)
                  .map((task) => (
                    <li key={task.id}>
                      <article className="task-card" data-mark={task.mark} aria-labelledby={`task-${task.id}`}>
                        <h4 className="task-title" id={`task-${task.id}`}>
                          {task.title}
                        </h4>
                        <p className="task-mark">{markLabel(task.mark)}</p>
                        <div className="task-moves" role="group" aria-label={`Move ${task.title}`}>
                          {columns.map((target) => (
                            <button
                              key={target.id}
                              id={`move-${task.id}-${target.id}`}
                              type="button"
                              className="ui-button"
                              aria-pressed={task.column === target.id}
                              aria-label={`Move ${task.title} to ${target.label}`}
                              data-task-id={task.id}
                              data-column={target.id}
                              onClick={() => {
                                moveTask(task.id, target.id);
                              }}
                            >
                              {target.label}
                            </button>
                          ))}
                        </div>
                        {task.mark === "rolled-back" || task.mark === "conflict" ? (
                          <div className="task-recovery">
                            {task.mark === "rolled-back" ? (
                              <button
                                type="button"
                                className="ui-button"
                                onClick={() => {
                                  session.retry(task.id, { delayMs, fail: false });
                                }}
                              >
                                {`Retry ${task.title}`}
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className="ui-button"
                                  onClick={() => {
                                    session.keepMine(task.id, { delayMs, fail: false });
                                  }}
                                >
                                  {`Keep mine for ${task.title}`}
                                </button>
                                <button
                                  type="button"
                                  className="ui-button"
                                  onClick={() => {
                                    session.useServer(task.id);
                                  }}
                                >
                                  {`Use server for ${task.title}`}
                                </button>
                              </>
                            )}
                          </div>
                        ) : null}
                      </article>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      </ExampleFrame>

      <Explanation
        titleId="optimistic-explanation-title"
        happened={copy.happened}
        readout={[
          { term: "Board", detail: copy.board },
          { term: "Server", detail: copy.server },
          { term: "Recovery", detail: copy.recovery },
        ]}
      >
        <section aria-label="Server">
          <h3>Server</h3>
          <ul className="save-server ui-stack">
            {session.serverTasks.map((task) => (
              <li key={task.id}>
                {`${task.title} · ${columnLabel(task.column)} · revision ${task.revision}`}
              </li>
            ))}
          </ul>
        </section>
        <div className="save-record">
          <section aria-label="Timeline">
            <h3>Timeline</h3>
            {timeline.bars.length === 0 ? (
              <p>No saves yet.</p>
            ) : (
              <ol className="save-timeline">
                {timeline.bars.map((bar) => (
                  <li key={bar.id}>
                    <p className="save-caption">{barLabel(bar)}</p>
                    <div className="save-lane" data-outcome={bar.outcome} style={laneStyle(bar.id)}>
                      <span
                        className="save-bar"
                        data-outcome={bar.outcome}
                        style={{ left: `${bar.startPct}%`, width: `${bar.widthPct}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <section aria-label="Events">
            <h3>Events</h3>
            {session.log.length === 0 ? (
              <p>No saves yet.</p>
            ) : (
              <ol className="save-log ui-stack">
                {session.log.map((entry, index) => (
                  <li
                    key={`${entry.id}-${entry.event}-${index}`}
                    data-event={entry.event}
                    style={laneStyle(entry.id)}
                  >
                    {`#${entry.id} · ${entry.title} · ${eventLabel(entry.event)}`}
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
