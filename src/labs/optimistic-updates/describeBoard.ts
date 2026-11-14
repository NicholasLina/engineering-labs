import {
  columnLabel,
  type Attempt,
  type ColumnId,
  type Strategy,
  type Task,
  type VisibleTask,
} from "./board.ts";
import type { SaveSpan } from "./timeline.ts";
import type { Intent, SaveEventName, SaveLogEntry } from "./useBoardSession.ts";

export type BoardKind = "idle" | "cleared" | "success" | "slow" | "failed" | "conflict" | "manual";

export type BoardCopy = {
  happened: string;
  board: string;
  server: string;
  recovery: string;
};

export type BoardSnapshot = {
  kind: BoardKind;
  strategy: Strategy;
  visible: readonly VisibleTask[];
  confirmed: readonly Task[];
  serverTasks: readonly Task[];
  attempts: readonly Attempt[];
  desired: readonly Intent[];
  log: readonly SaveLogEntry[];
  requests: readonly SaveSpan[];
};

const idleCopy: BoardCopy = {
  happened: "Nothing has been saved yet. Run a scenario, or move a card.",
  board: "The columns show the confirmed cards. No save is pending.",
  server: "The server matches those cards. Each task starts at revision 1.",
  recovery: "Retry, Keep mine, and Use server appear on a card after a rejection or a conflict.",
};

const clearedCopy: BoardCopy = {
  happened: "Clear restored the initial board and server. A save that was already running cannot write.",
  board: "Every card is in its initial column and marked Confirmed.",
  server: "The server list was restored with the board. Each revision is 1.",
  recovery: "There is nothing to retry or resolve.",
};

export function eventLabel(event: SaveEventName): string {
  if (event === "started") {
    return "Pending";
  }
  if (event === "retried") {
    return "Retry";
  }
  if (event === "kept-mine") {
    return "Keep mine";
  }
  if (event === "used-server") {
    return "Use server";
  }
  if (event === "confirmed") {
    return "Confirmed";
  }
  if (event === "rejected") {
    return "Rejected";
  }
  if (event === "rolled-back") {
    return "Rolled back";
  }
  if (event === "conflict") {
    return "Conflict";
  }
  return "Ignored";
}

function named(tasks: readonly { id: string; title: string }[], taskId: string): string {
  return tasks.find((task) => task.id === taskId)?.title ?? taskId;
}

function place(title: string, column: ColumnId, revision?: number): string {
  const located = `${title} in ${columnLabel(column)}`;
  return revision === undefined ? located : `${located} at revision ${revision}`;
}

function delayOf(snapshot: BoardSnapshot, operationId: number, fallback: number | undefined): number {
  const span = snapshot.requests.find((request) => request.id === operationId);
  if (span) {
    return span.delayMs;
  }
  return fallback ?? 0;
}

function otherPending(snapshot: BoardSnapshot, taskId: string): string | undefined {
  const names = snapshot.attempts
    .filter((attempt) => attempt.taskId !== taskId && attempt.phase === "inflight")
    .map((attempt) => named(snapshot.visible, attempt.taskId));
  if (names.length === 0) {
    return undefined;
  }
  const listed = names.join(" and ");
  const verb = names.length === 1 ? "is" : "are";
  const pronoun = names.length === 1 ? "that card" : "those cards";
  return `${listed} ${verb} still pending, and this result will not move ${pronoun}.`;
}

function withOther(sentence: string, other: string | undefined): string {
  return other ? `${sentence} ${other}` : sentence;
}

export function describeBoard(snapshot: BoardSnapshot): BoardCopy {
  const latest = snapshot.log.at(-1);
  if (!latest || (snapshot.log.length === 0 && snapshot.attempts.length === 0)) {
    return snapshot.kind === "cleared" ? clearedCopy : idleCopy;
  }

  const attempt = snapshot.attempts.find((entry) => entry.taskId === latest.taskId);
  const visible = snapshot.visible.find((task) => task.id === latest.taskId);
  const confirmed = snapshot.confirmed.find((task) => task.id === latest.taskId);
  const serverTask = snapshot.serverTasks.find((task) => task.id === latest.taskId);
  const intent = snapshot.desired.find((entry) => entry.taskId === latest.taskId);
  const title = visible?.title ?? confirmed?.title ?? serverTask?.title ?? latest.title;
  const delay = delayOf(snapshot, latest.id, attempt?.delayMs);
  const serverSentence = serverTask
    ? `The server lists ${place(title, serverTask.column, serverTask.revision)}.`
    : "The server list has no row for this card.";
  const other = otherPending(snapshot, latest.taskId);

  if (latest.event === "used-server" && confirmed && serverTask) {
    return {
      happened: `Use server adopted the server's ${title}: ${columnLabel(serverTask.column)}, revision ${serverTask.revision}. The local choice was cleared.`,
      board: `${title} is in ${columnLabel(visible?.column ?? confirmed.column)} and marked Confirmed.`,
      server: serverSentence,
      recovery: "There is nothing left to resolve on this card.",
    };
  }

  if (attempt?.phase === "inflight" && serverTask && serverTask.revision !== attempt.baseRevision) {
    const moved =
      snapshot.strategy === "optimistic"
        ? `${title} moved to ${columnLabel(visible?.column ?? attempt.toColumn)} immediately.`
        : `${title} stays in ${columnLabel(visible?.column ?? confirmed?.column ?? attempt.toColumn)}.`;
    return {
      happened: `${moved} The save to ${columnLabel(attempt.toColumn)} is scheduled to wait ${delay} ms. The server already lists ${place(title, serverTask.column, serverTask.revision)}, and this save is based on revision ${attempt.baseRevision}.`,
      board:
        snapshot.strategy === "optimistic"
          ? `${title} is in ${columnLabel(visible?.column ?? attempt.toColumn)} and marked Pending. That column is the prediction.`
          : `${title} is marked Pending in ${columnLabel(visible?.column ?? confirmed?.column ?? "todo")}.`,
      server: serverSentence,
      recovery: withOther(
        "When this save settles, the card will offer Keep mine and Use server.",
        other,
      ),
    };
  }

  if (attempt?.phase === "inflight") {
    const destination = columnLabel(attempt.toColumn);
    if (latest.event === "retried") {
      return {
        happened: `Retry is saving ${title} to ${destination} from revision ${attempt.baseRevision}. It is scheduled to wait ${delay} ms. The server has not accepted it yet.`,
        board:
          snapshot.strategy === "optimistic"
            ? `${title} is in ${columnLabel(visible?.column ?? attempt.toColumn)} and marked Pending.`
            : `${title} stays in ${columnLabel(visible?.column ?? confirmed?.column ?? "todo")} and is marked Pending until the retry is accepted.`,
        server: serverSentence,
        recovery: withOther("This retry is the explicit second attempt.", other),
      };
    }
    if (latest.event === "kept-mine") {
      return {
        happened: `Keep mine is saving ${title} to ${destination} from revision ${attempt.baseRevision}. It is scheduled to wait ${delay} ms. The server has not accepted that write yet.`,
        board: `${title} is in ${columnLabel(visible?.column ?? attempt.toColumn)} and marked Pending.`,
        server: serverSentence,
        recovery: withOther("Use server is no longer offered. This write is the Keep mine choice.", other),
      };
    }
    if (snapshot.strategy === "optimistic") {
      return {
        happened: `${title} moved to ${columnLabel(visible?.column ?? attempt.toColumn)} immediately. The save is still pending. It is scheduled to wait ${delay} ms, and the server has not accepted it.`,
        board: `${title} is in ${columnLabel(visible?.column ?? attempt.toColumn)} and marked Pending. That column is the prediction.`,
        server: serverSentence,
        recovery: withOther("If this save is rejected, only this card rolls back.", other),
      };
    }
    return {
      happened: `${title} stays in ${columnLabel(visible?.column ?? confirmed?.column ?? "todo")}. The save to ${destination} is pending. It is scheduled to wait ${delay} ms. The card moves when the server accepts it.`,
      board: `${title} is marked Pending in its confirmed column, ${columnLabel(confirmed?.column ?? visible?.column ?? "todo")}.`,
      server: serverSentence,
      recovery: withOther(
        "If this save is rejected, the card stays where the server last confirmed it.",
        other,
      ),
    };
  }

  if (attempt?.phase === "rejected" || latest.event === "rolled-back") {
    const failedColumn = attempt ? columnLabel(attempt.toColumn) : columnLabel(latest.column);
    const nextColumn = intent?.column ?? attempt?.toColumn ?? latest.column;
    const returned =
      visible && confirmed && visible.column === confirmed.column
        ? `${title} returned to ${columnLabel(confirmed.column)}.`
        : `${title} shows ${columnLabel(visible?.column ?? nextColumn)}. That is the later choice. The rejected move was to ${failedColumn}.`;
    const retryTarget = columnLabel(nextColumn);
    const revision = confirmed?.revision ?? attempt?.baseRevision ?? 1;
    const retry =
      confirmed && nextColumn === confirmed.column
        ? `Retry clears the rollback. ${title} is already in ${retryTarget} on the server.`
        : `Retry sends ${title} to ${retryTarget} again, from revision ${revision}.`;
    return {
      happened: `The server rejected the move of ${title} to ${failedColumn}. The save was scheduled to wait ${delay} ms. ${returned}`,
      board: `${title} is in ${columnLabel(visible?.column ?? confirmed?.column ?? latest.column)} and marked Rolled back.`,
      server: serverSentence,
      recovery: withOther(retry, other),
    };
  }

  if (attempt?.phase === "conflict" && attempt.serverTask) {
    const wanted = columnLabel(intent?.column ?? attempt.toColumn);
    const serverColumn = columnLabel(attempt.serverTask.column);
    const staying =
      snapshot.strategy === "optimistic"
        ? `The card stays in ${columnLabel(visible?.column ?? attempt.toColumn)} so that choice is still on screen.`
        : `The card stays in ${columnLabel(visible?.column ?? confirmed?.column ?? "todo")}, its confirmed column.`;
    return {
      happened: `The save of ${title} to ${columnLabel(attempt.toColumn)} conflicted. The server already had that card in ${serverColumn} at revision ${attempt.serverTask.revision}. ${staying}`,
      board: `${title} is in ${columnLabel(visible?.column ?? confirmed?.column ?? attempt.toColumn)} and marked Conflict.`,
      server: `The server lists ${place(title, attempt.serverTask.column, attempt.serverTask.revision)}.`,
      recovery: withOther(
        `Keep mine writes ${wanted} onto revision ${attempt.serverTask.revision}. Use server moves the card to ${serverColumn} and drops the local choice.`,
        other,
      ),
    };
  }

  if (latest.event === "confirmed" && confirmed) {
    return {
      happened: `The server accepted ${title} in ${columnLabel(confirmed.column)}. The revision is now ${confirmed.revision}. The card is confirmed.`,
      board: `The visible column and the confirmed column are both ${columnLabel(visible?.column ?? confirmed.column)}.`,
      server: serverSentence,
      recovery: withOther("This save is done. There is nothing to retry.", other),
    };
  }

  return {
    happened: `${title} is ${eventLabel(latest.event).toLowerCase()}.`,
    board: `${title} is in ${columnLabel(visible?.column ?? latest.column)}.`,
    server: serverSentence,
    recovery: "Read the card for Retry, Keep mine, or Use server.",
  };
}
