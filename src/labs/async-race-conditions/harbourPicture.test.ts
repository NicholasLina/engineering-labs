import { expect, test } from "vitest";
import { frameFor, guidedHarbour, guidedStepIndex, harbourStory } from "./harbour.ts";
import {
  drawHarbour,
  homeSlot,
  mooringSlot,
  pathLength,
  routePath,
  sceneLayout,
  type HarbourPicture,
  type SceneRoute,
} from "./harbourPicture.ts";
import { awayTravel, sceneBoats, settledMotion, stepMotion } from "./harbourMotion.ts";

const west: SceneRoute = { id: 1, channel: "west", kind: "long", slot: 0 };
const east: SceneRoute = { id: 2, channel: "east", kind: "short", slot: 1 };
const lessonRoutes = [west, east];

const sizes = [
  { width: 800, height: 450 },
  { width: 460, height: 368 },
];

function guided(id: string) {
  return frameFor(guidedHarbour, guidedStepIndex(id));
}

/** Run the animation to rest and return the motion, plus every lamp it showed on the way. */
function settle(from: ReturnType<typeof settledMotion>, frame: ReturnType<typeof guided>) {
  let motion = from;
  const lamps: string[] = [];
  for (let guard = 0; guard < 600; guard += 1) {
    const next = stepMotion(motion, frame, 16);
    motion = next.motion;
    lamps.push(motion.lamp);
    if (!next.moving) {
      return { motion, lamps };
    }
  }
  throw new Error("The picture never came to rest.");
}

function recorder() {
  const texts: string[] = [];
  const fills: string[] = [];
  const gradient = { addColorStop: (_offset: number, colour: string) => fills.push(colour) };
  const target: Record<string, unknown> = {
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    fillText: (text: string) => texts.push(text),
  };
  const ctx = new Proxy(target, {
    get(store, key: string) {
      return key in store ? store[key] : () => {};
    },
    set(store, key: string, value: unknown) {
      if (key === "fillStyle" && typeof value === "string") {
        fills.push(value);
      }
      store[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, texts, fills };
}

function picture(id: string, size = sizes[0]): { layout: ReturnType<typeof sceneLayout>; picture: HarbourPicture } {
  const frame = guided(id);
  const layout = sceneLayout(size?.width ?? 800, size?.height ?? 450);
  const motion = settledMotion(frame);
  return {
    layout,
    picture: {
      lamp: motion.lamp,
      lampFrom: motion.lampFrom,
      lampMix: motion.lampMix,
      logbook: frame.assignment === "No assignment" ? null : frame.assignment.replace(" channel", ""),
      routes: lessonRoutes,
      boats: sceneBoats(layout, lessonRoutes, frame, motion),
      moored: frame.setAside.length,
      focus: null,
    },
  };
}

test.each(sizes)("the long route is clearly longer and stays in the picture at $width wide", (size) => {
  const layout = sceneLayout(size.width, size.height);
  const long = routePath(layout, west, 2);
  const short = routePath(layout, { ...west, kind: "short" }, 2);

  expect(pathLength(long)).toBeGreaterThan(pathLength(short) * 1.5);
  expect(long[0]).toEqual(homeSlot(layout, 0, 2));
  expect(long.at(-1)).toEqual(layout.docks.west);
  expect(routePath(layout, east, 2).at(-1)).toEqual(layout.docks.east);

  for (const point of [...long, ...short, ...routePath(layout, east, 2)]) {
    expect(point.x).toBeGreaterThan(0);
    expect(point.x).toBeLessThan(size.width);
    expect(point.y).toBeLessThan(size.height - 4);
  }
  expect(layout.docks.west.x).toBeLessThan(homeSlot(layout, 0, 2).x - 40);
  expect(layout.docks.east.x).toBeGreaterThan(homeSlot(layout, 1, 2).x + 40);
  expect(mooringSlot(layout, 0, 1).y).toBeGreaterThan(layout.homeY + 50);
  expect(mooringSlot(layout, 0, 1).y).toBeLessThan(size.height - 20);
});

test("a departing messenger stops part of the way out with no report showing", () => {
  const layout = sceneLayout(800, 450);
  const away = guided("messenger-1-away");
  const { motion } = settle(settledMotion(guided("assign-west")), away);

  expect(motion.boats).toEqual([{ id: 1, travel: awayTravel, aside: 0 }]);
  const [boat] = sceneBoats(layout, lessonRoutes, away, motion);
  expect(boat?.revealed).toBe(false);
  expect(boat?.x).toBeLessThan(homeSlot(layout, 0, 2).x);
  expect(boat?.y).toBeGreaterThan(layout.homeY + 30);
});

test("the lamp keeps its colour until the report that changes it has arrived", () => {
  const applied = guided("east-applied");
  const start = settledMotion(guided("messenger-2-away"));

  const first = stepMotion(start, applied, 16);
  expect(first.moving).toBe(true);
  expect(first.motion.lamp).toBe("awaiting");

  const { motion, lamps } = settle(start, applied);
  expect(lamps[0]).toBe("awaiting");
  expect(motion.lamp).toBe("blue");
  expect(motion.lampMix).toBe(1);
  expect(motion.boats.find((boat) => boat.id === 2)).toEqual({ id: 2, travel: 2, aside: 0 });
  expect(motion.boats.find((boat) => boat.id === 1)?.travel).toBe(awayTravel);
});

test("going back places a messenger on its route again instead of sailing in reverse", () => {
  const away = guided("messenger-1-away");
  const next = stepMotion(settledMotion(guided("late-applied")), away, 16);

  expect(next.motion.boats).toEqual([{ id: 1, travel: awayTravel, aside: 0 }]);
});

test("a set-aside messenger returns with its report, then waits under Earlier reports", () => {
  const layout = sceneLayout(800, 450);
  const aside = guided("replay-west-set-aside");
  const { motion } = settle(settledMotion(guided("replay-east-applied")), aside);

  expect(motion.lamp).toBe("blue");
  const boats = sceneBoats(layout, lessonRoutes, aside, motion);
  const older = boats.find((boat) => boat.id === 1);
  expect(older).toMatchObject({ report: "amber", revealed: true, moored: true });
  expect({ x: older?.x, y: older?.y }).toEqual(mooringSlot(layout, 0, 1));
  expect(boats.find((boat) => boat.id === 2)).toMatchObject({
    ...homeSlot(layout, 1, 2),
    report: "blue",
    moored: false,
  });
});

test("a failed report is a slip, and resting matches the frame for every variation", () => {
  const story = harbourStory("error");
  if (!story) {
    throw new Error("Missing the stale error story.");
  }
  const last = frameFor(story, story.steps.length - 1);
  const rest = settledMotion(last);

  expect(last.messengers.find((messenger) => messenger.id === 1)?.report).toBe("slip");
  expect(stepMotion(rest, last, 16)).toEqual({ motion: rest, moving: false });
});

test.each(sizes)("the amber frame paints the lamp, the logbook, and both envelopes at $width wide", (size) => {
  const { ctx, texts, fills } = recorder();
  const amber = picture("late-applied", size);

  drawHarbour(ctx, amber.layout, amber.picture);

  expect(texts).toContain("#2 · East");
  expect(texts).toContain("1");
  expect(texts).toContain("2");
  expect(texts).toContain("West");
  expect(texts).toContain("East");
  expect(texts).toContain("west channel");
  expect(texts).toContain("east channel");
  expect(texts).not.toContain("Earlier reports");
  expect(fills.some((fill) => fill.includes("247, 168, 35"))).toBe(true);
});

test("an unlit lamp casts no beam, and the tray is drawn only when a report is set aside", () => {
  const quiet = recorder();
  const opening = picture("meet-keeper");
  drawHarbour(quiet.ctx, opening.layout, opening.picture);
  expect(quiet.texts).toContain("—");
  expect(quiet.texts).not.toContain("1");
  expect(quiet.fills.some((fill) => fill.startsWith("rgba(247, 168, 35") || fill.startsWith("rgba(78, 166, 255"))).toBe(false);

  const tray = recorder();
  const aside = picture("replay-west-set-aside");
  drawHarbour(tray.ctx, aside.layout, aside.picture);
  expect(tray.texts).toContain("Earlier reports");
  expect(tray.fills.some((fill) => fill.startsWith("rgba(78, 166, 255"))).toBe(true);
});
