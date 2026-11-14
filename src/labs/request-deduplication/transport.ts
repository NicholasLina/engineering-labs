import type { Clock } from "./clock.ts";

export const simulatedDelayMs = 400;

export type Transport = (params: {
  key: string;
  signal: AbortSignal;
  fail: boolean;
}) => Promise<string>;

type Handler<T> = {
  fulfill: (value: T) => void;
  reject: (error: unknown) => void;
};

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let outcome: { ok: true; value: T } | { ok: false; error: unknown } | undefined;
  const handlers: Handler<T>[] = [];

  function settle(next: { ok: true; value: T } | { ok: false; error: unknown }) {
    if (outcome) {
      return;
    }
    outcome = next;
    const pending = handlers.splice(0, handlers.length);
    for (const handler of pending) {
      if (next.ok) {
        handler.fulfill(next.value);
      } else {
        handler.reject(next.error);
      }
    }
  }

  const promise = {
    then(
      onFulfilled?: ((value: T) => unknown) | null,
      onRejected?: ((reason: unknown) => unknown) | null,
    ): Promise<unknown> {
      return new Promise((resolve, reject) => {
        const fulfill = (value: T) => {
          try {
            resolve(onFulfilled ? onFulfilled(value) : value);
          } catch (error) {
            reject(error);
          }
        };
        const fail = (error: unknown) => {
          try {
            if (onRejected) {
              resolve(onRejected(error));
            } else {
              reject(error);
            }
          } catch (caught) {
            reject(caught);
          }
        };

        if (!outcome) {
          handlers.push({ fulfill, reject: fail });
          return;
        }
        if (outcome.ok) {
          fulfill(outcome.value);
          return;
        }
        fail(outcome.error);
      });
    },
    catch(onRejected?: ((reason: unknown) => unknown) | null) {
      return this.then(undefined, onRejected);
    },
    finally(onFinally?: (() => void) | null) {
      return this.then(
        (value) => {
          onFinally?.();
          return value;
        },
        (error) => {
          onFinally?.();
          throw error;
        },
      );
    },
  };

  return {
    promise: promise as Promise<T>,
    resolve: (value) => {
      settle({ ok: true, value });
    },
    reject: (error) => {
      settle({ ok: false, error });
    },
  };
}

function abortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

export function createSimulatedTransport(clock: Clock): Transport {
  return ({ key, signal, fail }) => {
    const deferred = createDeferred<string>();

    if (signal.aborted) {
      deferred.reject(abortError());
      return deferred.promise;
    }

    let settled = false;
    const cancelTimer = clock.schedule(() => {
      if (settled) {
        return;
      }
      settled = true;
      signal.removeEventListener("abort", onAbort);
      if (fail) {
        deferred.reject(new Error("Request failed"));
        return;
      }
      deferred.resolve(`Record ${key}`);
    }, simulatedDelayMs);

    function onAbort() {
      if (settled) {
        return;
      }
      settled = true;
      cancelTimer();
      deferred.reject(abortError());
    }

    signal.addEventListener("abort", onAbort);
    return deferred.promise;
  };
}
