import type { Clock } from "./clock.ts";
import { catalog, filterCatalog, type CatalogItem } from "./catalog.ts";

export const searchFailedMessage = "Search failed";

export type SearchParams = {
  query: string;
  delayMs: number;
  fail: boolean;
};

export type SearchFn = (params: SearchParams) => Promise<CatalogItem[]>;

type Outcome<T> =
  | { status: "fulfilled"; value: T }
  | { status: "rejected"; reason: unknown };

// Handlers run inside the clock callback, so advance() applies a result
// before it returns. A native promise would wait for a later microtask.
function scheduleResult<T>(clock: Clock, delayMs: number, settle: () => Outcome<T>): Promise<T> {
  let outcome: Outcome<T> | null = null;
  const waiters: Array<(result: Outcome<T>) => void> = [];

  clock.schedule(() => {
    const result = settle();
    outcome = result;
    const pending = waiters.splice(0);
    for (const waiter of pending) {
      waiter(result);
    }
  }, delayMs);

  const promise = {
    then(
      onFulfilled?: ((value: T) => unknown) | null,
      onRejected?: ((reason: unknown) => unknown) | null,
    ) {
      return new Promise((resolve, reject) => {
        const waiter = (result: Outcome<T>) => {
          try {
            if (result.status === "fulfilled") {
              resolve(onFulfilled ? onFulfilled(result.value) : result.value);
              return;
            }
            if (onRejected) {
              resolve(onRejected(result.reason));
              return;
            }
            reject(result.reason);
          } catch (error) {
            reject(error);
          }
        };
        if (outcome === null) {
          waiters.push(waiter);
          return;
        }
        waiter(outcome);
      });
    },
    catch(onRejected?: ((reason: unknown) => unknown) | null) {
      return promise.then(undefined, onRejected);
    },
  };

  return promise as unknown as Promise<T>;
}

export function createSimulatedSearch(
  clock: Clock,
  items: readonly CatalogItem[] = catalog,
): SearchFn {
  return (params) =>
    scheduleResult(clock, params.delayMs, () => {
      if (params.fail) {
        return { status: "rejected", reason: new Error(searchFailedMessage) };
      }
      return { status: "fulfilled", value: filterCatalog(items, params.query) };
    });
}
