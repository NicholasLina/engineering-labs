export type CatalogItem = {
  id: string;
  label: string;
};

export const catalog: readonly CatalogItem[] = [
  { id: "react", label: "react" },
  { id: "redux", label: "redux" },
  { id: "relay", label: "relay" },
  { id: "rest", label: "rest" },
  { id: "rendering", label: "rendering" },
  { id: "cache", label: "cache" },
  { id: "cancellation", label: "cancellation" },
  { id: "promise", label: "promise" },
  { id: "proxy", label: "proxy" },
  { id: "epoch", label: "epoch" },
];

export function filterCatalog(
  items: readonly CatalogItem[],
  query: string,
): CatalogItem[] {
  const prefix = query.trim().toLowerCase();
  if (prefix.length === 0) {
    return [];
  }

  return items.filter((item) => item.label.toLowerCase().startsWith(prefix));
}
