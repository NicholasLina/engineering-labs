import { catalog, filterCatalog, type CatalogItem } from "./catalog.ts";

export const searchFailedMessage = "Search failed";

export type SearchParams = {
  query: string;
  signal: AbortSignal;
  delayMs: number;
  fail: boolean;
};

export type SearchFn = (params: SearchParams) => Promise<CatalogItem[]>;

export function createSimulatedSearch(
  items: readonly CatalogItem[] = catalog,
): SearchFn {
  return (params) =>
    new Promise((resolve, reject) => {
      // Abort does not cancel this delay. The session decides whether the
      // finished response may update the UI, so an older request can still
      // settle after a newer one.
      setTimeout(() => {
        if (params.fail) {
          reject(new Error(searchFailedMessage));
          return;
        }

        resolve(filterCatalog(items, params.query));
      }, params.delayMs);
    });
}
