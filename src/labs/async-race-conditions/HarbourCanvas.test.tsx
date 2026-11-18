import { render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { HarbourCanvas } from "./HarbourCanvas.tsx";
import { frameFor, guidedHarbour, guidedStepIndex } from "./harbour.ts";
import type { SceneRoute } from "./harbourPicture.ts";

const routes: SceneRoute[] = [
  { id: 1, channel: "west", kind: "long", slot: 0 },
  { id: 2, channel: "east", kind: "short", slot: 1 },
];

function guided(id: string) {
  return frameFor(guidedHarbour, guidedStepIndex(id));
}

/** A drawing surface that remembers the words it was asked to paint. */
function paintedWords() {
  let words: string[] = [];
  const gradient = { addColorStop: () => {} };
  const target: Record<string, unknown> = {
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    clearRect: () => {
      words = [];
    },
    fillText: (text: string) => {
      words.push(text);
    },
  };
  const ctx = new Proxy(target, {
    get(store, key: string) {
      return key in store ? store[key] : () => {};
    },
    set(store, key: string, value: unknown) {
      store[key] = value;
      return true;
    },
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
  return () => words;
}

afterEach(() => {
  vi.restoreAllMocks();
});

test("with reduced motion the canvas repaints each step at rest", () => {
  const words = paintedWords();
  const { rerender } = render(
    <HarbourCanvas frame={guided("meet-keeper")} routes={routes} focus={null} reducedMotion />,
  );
  expect(words()).toContain("—");
  expect(words()).not.toContain("1");

  rerender(
    <HarbourCanvas frame={guided("east-applied")} routes={routes} focus={{ target: "lamp" }} reducedMotion />,
  );
  expect(words()).toContain("#2 · East");
  expect(words()).toContain("1");
  expect(words()).toContain("2");

  rerender(
    <HarbourCanvas
      frame={guided("replay-west-set-aside")}
      routes={routes}
      focus={{ target: "messenger", id: 1 }}
      reducedMotion
    />,
  );
  expect(words()).toContain("Earlier reports");
});

test("the canvas is scenery, and its fallback content carries the same state", () => {
  const { container } = render(
    <HarbourCanvas frame={guided("predict-late")} routes={routes} focus={null} reducedMotion={false} />,
  );
  const canvas = container.querySelector("canvas");

  expect(canvas).toHaveAttribute("aria-hidden", "true");
  expect(canvas).toHaveAttribute("data-signal", "blue");
  expect(canvas?.querySelector("[data-messenger='1']")).toHaveAttribute("data-card", "amber");
  expect(canvas?.querySelector("[data-messenger='1']")).toHaveAttribute("data-progress", "door");
  expect(canvas?.querySelector("[data-station='west']")).toHaveTextContent(
    "West channel. Amber sends ships this way.",
  );
});
