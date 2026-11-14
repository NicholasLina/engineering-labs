import { expect, test } from "vitest";
import { labs } from "./registry.ts";
import { labViews } from "./views.ts";

test("every lab has a unique slug", () => {
  const slugs = labs.map((lab) => lab.slug);

  expect(new Set(slugs).size).toBe(slugs.length);
});

test("every lab has the gallery card fields", () => {
  for (const lab of labs) {
    expect(lab.title).not.toMatch(/\blab\b/i);
    expect(lab.summary.trim()).not.toBe("");
    expect(lab.concepts.length).toBeGreaterThanOrEqual(2);
    expect(lab.concepts.length).toBeLessThanOrEqual(4);
    expect(lab.thumbnail.trim()).not.toBe("");
  }
});

test("every registry slug has one view and every view is registered", () => {
  expect(Object.keys(labViews).sort()).toEqual(labs.map((lab) => lab.slug).sort());
});
