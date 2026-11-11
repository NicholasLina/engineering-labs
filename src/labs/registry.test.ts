import { expect, test } from "vitest";
import { labs } from "./registry.ts";

test("every lab has a unique slug", () => {
  const slugs = labs.map((lab) => lab.slug);

  expect(new Set(slugs).size).toBe(slugs.length);
});

test("every lab has the gallery card fields", () => {
  for (const lab of labs) {
    expect(lab.title).not.toMatch(/\blab\b/i);
    expect(lab.summary.trim()).not.toBe("");
    expect(lab.concepts.length).toBeGreaterThan(0);
    expect(lab.thumbnail.trim()).not.toBe("");
  }
});
