import { expect, test } from "vitest";
import { catalog, filterCatalog } from "./catalog.ts";

test("matches a prefix without regard to case or surrounding spaces", () => {
  expect(filterCatalog(catalog, "  RE").map((item) => item.label)).toEqual([
    "react",
    "redux",
    "relay",
    "rest",
    "rendering",
  ]);
});

test("a longer prefix narrows the matches", () => {
  expect(filterCatalog(catalog, "rea").map((item) => item.label)).toEqual([
    "react",
  ]);
});

test("an unknown prefix has no matches", () => {
  expect(filterCatalog(catalog, "zzz")).toEqual([]);
});

test("an empty query has no matches", () => {
  expect(filterCatalog(catalog, "   ")).toEqual([]);
});
