import { expect, test } from "vitest";
import { labs } from "./registry.ts";

test("every lab has a unique slug", () => {
  const slugs = labs.map((lab) => lab.slug);

  expect(new Set(slugs).size).toBe(slugs.length);
});
