import { catalog, filterCatalog, type CatalogItem } from "./catalog.ts";
import type { Clock } from "./clock.ts";

export const searchFailedMessage = "Search failed";

/** Typed queries use this delay. Scenario buttons pass their own delays. */
export const manualSearchDelayMs = 600;

export type SearchParams = {
  query: string;
  signal: AbortSignal;
  delayMs: number;
  fail: boolean;
};

export type SearchFn = (params: SearchParams) => Promise<CatalogItem[]>;

const abortMessage = "The simulated transport was aborted";

function abortException(): DOMException {
  return new DOMException(abortMessage, "AbortError");
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

// Direct listeners run inside the timer callback, before a manual clock moves
// on to the next due timer. A native Promise reaction would wait for a
// microtask, so a delay-0 cancel registered after this search would run
// first. `then` still returns a real Promise for callers that `await`.
class Settlement<T> implements PromiseLike<T> {
  #status: "pending" | "fulfilled" | "rejected" = "pending";
  #value: T | undefined;
  #reason: unknown;
  #fulfillments: Array<(value: T) => void> = [];
  #rejections: Array<(reason: unknown) => void> = [];

  then<TResult1 = T, TResult2 = never>(
    onFulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return new Promise((resolve, reject) => {
      const fulfill = (value: T) => {
        try {
          if (onFulfilled) {
            resolve(onFulfilled(value));
            return;
          }
          resolve(value as unknown as TResult1);
        } catch (error) {
          reject(error);
        }
      };
      const fail = (reason: unknown) => {
        try {
          if (onRejected) {
            resolve(onRejected(reason));
            return;
          }
          reject(reason);
        } catch (error) {
          reject(error);
        }
      };

      if (this.#status === "fulfilled") {
        queueMicrotask(() => {
          fulfill(this.#value as T);
        });
        return;
      }
      if (this.#status === "rejected") {
        queueMicrotask(() => {
          fail(this.#reason);
        });
        return;
      }
      this.#fulfillments.push(fulfill);
      this.#rejections.push(fail);
    });
  }

  catch<TResult = never>(
    onRejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<T | TResult> {
    return this.then(undefined, onRejected);
  }

  finally(onFinally?: (() => void) | null): Promise<T> {
    return this.then(
      (value) => {
        onFinally?.();
        return value;
      },
      (reason) => {
        onFinally?.();
        throw reason;
      },
    );
  }

  succeed(value: T) {
    if (this.#status !== "pending") {
      return;
    }
    this.#status = "fulfilled";
    this.#value = value;
    const waiters = this.#fulfillments.splice(0);
    this.#rejections = [];
    for (const waiter of waiters) {
      waiter(value);
    }
  }

  fail(reason: unknown) {
    if (this.#status !== "pending") {
      return;
    }
    this.#status = "rejected";
    this.#reason = reason;
    const waiters = this.#rejections.splice(0);
    this.#fulfillments = [];
    for (const waiter of waiters) {
      waiter(reason);
    }
  }
}

function asPromise<T>(settlement: Settlement<T>): Promise<T> {
  return settlement as unknown as Promise<T>;
}

export function createAbortableSearch(
  clock: Clock,
  items: readonly CatalogItem[] = catalog,
): SearchFn {
  return (params) => {
    const settlement = new Settlement<CatalogItem[]>();
    if (params.signal.aborted) {
      settlement.fail(abortException());
      return asPromise(settlement);
    }

    let settled = false;
    let cancelTimer: (() => void) | undefined;
    const onAbort = () => {
      if (settled) {
        return;
      }
      settled = true;
      cancelTimer?.();
      params.signal.removeEventListener("abort", onAbort);
      settlement.fail(abortException());
    };

    cancelTimer = clock.schedule(() => {
      if (settled) {
        return;
      }
      settled = true;
      params.signal.removeEventListener("abort", onAbort);
      if (params.fail) {
        settlement.fail(new Error(searchFailedMessage));
        return;
      }
      settlement.succeed(filterCatalog(items, params.query));
    }, params.delayMs);

    params.signal.addEventListener("abort", onAbort);
    return asPromise(settlement);
  };
}
