import type { LampSignal } from "./harbour.ts";
import type { Channel } from "./scenarios.ts";

export type Point = { x: number; y: number };

export type RouteKind = "long" | "short";

export type Report = "amber" | "blue" | "slip";

/** One messenger's trip: which station, which way round, and which berth it leaves from. */
export type SceneRoute = {
  id: number;
  channel: Channel;
  kind: RouteKind;
  slot: number;
};

export type SceneBoat = {
  id: number;
  x: number;
  y: number;
  report: Report;
  /** The report is in the envelope, so its colour shows. */
  revealed: boolean;
  /** Waiting under Earlier reports. */
  moored: boolean;
};

export type SceneFocus =
  | { target: "lamp" }
  | { target: "logbook" }
  | { target: "boat"; id: number }
  | { target: "numbers"; id: number };

export type HarbourPicture = {
  lamp: LampSignal;
  lampFrom: LampSignal;
  /** 0 shows `lampFrom`, 1 shows `lamp`. */
  lampMix: number;
  logbook: string | null;
  routes: readonly SceneRoute[];
  boats: readonly SceneBoat[];
  /** How many boats wait under Earlier reports. 0 leaves that berth out. */
  moored: number;
  focus: SceneFocus | null;
};

export type SceneLayout = {
  width: number;
  height: number;
  compact: boolean;
  centre: number;
  horizon: number;
  islandTop: number;
  islandHalf: number;
  landWidth: number;
  lamp: Point;
  logbook: { x: number; y: number; width: number; height: number };
  keeper: Point;
  homeY: number;
  slotGap: number;
  docks: Record<Channel, Point>;
  mooring: Point;
};

const boatHalf = 21;
const jettyDrop = 40;
const mooringGap = 58;

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

/** Every position in the picture, for a drawing surface of this size. */
export function sceneLayout(width: number, height: number): SceneLayout {
  const compact = width < 620;
  const centre = width / 2;
  const horizon = Math.round(height * 0.47);
  const islandTop = horizon + Math.round((height - horizon) * 0.22);
  const islandHalf = compact ? 114 : 132;
  const landWidth = clamp(width * 0.2, 92, 168);
  const homeY = islandTop + jettyDrop + 16;
  const dockY = islandTop + 38;
  const boardWidth = compact ? 76 : 86;

  return {
    width,
    height,
    compact,
    centre,
    horizon,
    islandTop,
    islandHalf,
    landWidth,
    lamp: { x: centre, y: Math.max(Math.round(height * 0.2), 72) },
    logbook: {
      x: centre - islandHalf + 8,
      y: islandTop - 58,
      width: boardWidth,
      height: 44,
    },
    keeper: { x: centre + 48, y: islandTop },
    homeY,
    slotGap: compact ? 62 : 78,
    docks: {
      west: { x: landWidth + 14 + boatHalf + 4, y: dockY },
      east: { x: width - landWidth - 14 - boatHalf - 4, y: dockY },
    },
    mooring: { x: centre, y: Math.min(height - 30, homeY + 70) },
  };
}

function slotOffset(slot: number, slots: number, gap: number): number {
  return (slot - (slots - 1) / 2) * gap;
}

/** Where a messenger's boat ties up at the lighthouse. */
export function homeSlot(layout: SceneLayout, slot: number, slots: number): Point {
  return { x: layout.centre + slotOffset(slot, slots, layout.slotGap), y: layout.homeY };
}

/** Where a set-aside boat waits, under Earlier reports. */
export function mooringSlot(layout: SceneLayout, place: number, places: number): Point {
  return { x: layout.mooring.x + slotOffset(place, places, mooringGap), y: layout.mooring.y };
}

function cubic(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

const routeSamples = 48;

/**
 * The line a boat follows from its berth to a station. The short route crosses
 * directly. The long route swings out around the rocks at the bottom of the bay.
 */
export function routePath(layout: SceneLayout, route: SceneRoute, slots: number): Point[] {
  const start = homeSlot(layout, route.slot, slots);
  const end = layout.docks[route.channel];
  const outward = route.channel === "west" ? -1 : 1;
  let first: Point;
  let second: Point;

  if (route.kind === "long") {
    const low = layout.height + 12;
    first = { x: start.x + outward * 64, y: low };
    second = { x: end.x + outward * 26, y: low };
  } else {
    const sag = 10;
    first = { x: start.x + (end.x - start.x) / 3, y: start.y + (end.y - start.y) / 3 + sag };
    second = { x: start.x + ((end.x - start.x) * 2) / 3, y: start.y + ((end.y - start.y) * 2) / 3 + sag };
  }

  const points: Point[] = [];
  for (let index = 0; index <= routeSamples; index += 1) {
    points.push(cubic(start, first, second, end, index / routeSamples));
  }
  return points;
}

export function pathLength(points: readonly Point[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const next = points[index];
    if (previous && next) {
      total += Math.hypot(next.x - previous.x, next.y - previous.y);
    }
  }
  return total;
}

/** The point a share `t` of the way along a polyline, measured by length. */
export function pointAlong(points: readonly Point[], t: number): Point {
  const first = points[0];
  if (!first) {
    return { x: 0, y: 0 };
  }
  let remaining = clamp(t, 0, 1) * pathLength(points);
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const next = points[index];
    if (!previous || !next) {
      continue;
    }
    const length = Math.hypot(next.x - previous.x, next.y - previous.y);
    if (remaining <= length || index === points.length - 1) {
      const share = length === 0 ? 0 : Math.min(remaining / length, 1);
      return {
        x: previous.x + (next.x - previous.x) * share,
        y: previous.y + (next.y - previous.y) * share,
      };
    }
    remaining -= length;
  }
  return first;
}

const palette = {
  skyTop: "#15122e",
  skyLow: "#33305f",
  star: "#e4e2f5",
  moon: "#f1ead6",
  hill: "#262349",
  seaTop: "#1c4257",
  seaLow: "#0f2733",
  wave: "#4d7f96",
  land: "#1d1b38",
  landEdge: "#2b2850",
  rock: "#2a2748",
  tower: "#f5efe2",
  band: "#5b5a86",
  frame: "#1a1830",
  amber: "#f7a823",
  blue: "#4ea6ff",
  unlit: "#8f8fb0",
  out: "#07060f",
  paper: "#fbf6ea",
  paperEdge: "#d8cdb6",
  ink: "#1e1b33",
  inkSoft: "#75695a",
  wood: "#b58a5f",
  hull: "#efe2c8",
  hullTrim: "#8f6f4c",
  route: "#d5dcf0",
  label: "#eceaf8",
  focus: "#ffffff",
} as const;

function lampGlass(signal: LampSignal): string {
  if (signal === "amber") {
    return palette.amber;
  }
  if (signal === "blue") {
    return palette.blue;
  }
  if (signal === "dark") {
    return palette.out;
  }
  return palette.unlit;
}

function lampLight(signal: LampSignal): string | null {
  if (signal === "amber") {
    return palette.amber;
  }
  if (signal === "blue") {
    return palette.blue;
  }
  return null;
}

function reportColour(report: Report): string {
  if (report === "amber") {
    return palette.amber;
  }
  if (report === "blue") {
    return palette.blue;
  }
  return "#ffffff";
}

function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgba(hex: string, alpha: number): string {
  const [red, green, blue] = channels(hex);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function mix(from: string, to: string, share: number): string {
  const a = channels(from);
  const b = channels(to);
  const t = clamp(share, 0, 1);
  const blend = (index: 0 | 1 | 2) => Math.round(a[index] + (b[index] - a[index]) * t);
  return `rgb(${blend(0)}, ${blend(1)}, ${blend(2)})`;
}

type Ctx = CanvasRenderingContext2D;

function rounded(ctx: Ctx, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function type(ctx: Ctx, family: string, size: number, weight: number) {
  ctx.font = `${weight} ${size}px ${family}`;
}

const stars: readonly [number, number, number][] = [
  [0.05, 0.16, 1.3],
  [0.13, 0.07, 1],
  [0.21, 0.24, 1.2],
  [0.29, 0.1, 1.5],
  [0.36, 0.3, 1],
  [0.44, 0.07, 1.1],
  [0.58, 0.13, 1.3],
  [0.64, 0.32, 1],
  [0.7, 0.06, 1.1],
  [0.77, 0.25, 1.4],
  [0.9, 0.3, 1],
  [0.95, 0.1, 1.2],
];

const waves: readonly [number, number, number][] = [
  [0.07, 0.72, 22],
  [0.3, 0.14, 18],
  [0.34, 0.58, 26],
  [0.5, 0.9, 20],
  [0.63, 0.36, 24],
  [0.7, 0.78, 18],
  [0.9, 0.62, 22],
  [0.24, 0.9, 16],
  [0.82, 0.2, 16],
];

function drawSky(ctx: Ctx, layout: SceneLayout) {
  const { width, horizon } = layout;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, palette.skyTop);
  sky.addColorStop(1, palette.skyLow);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, horizon);

  ctx.fillStyle = rgba(palette.star, 0.8);
  for (const [x, y, radius] of stars) {
    ctx.beginPath();
    ctx.arc(x * width, y * horizon, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const moon = { x: width * 0.84, y: horizon * 0.2 };
  ctx.fillStyle = palette.moon;
  ctx.beginPath();
  ctx.arc(moon.x, moon.y, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = mix(palette.skyTop, palette.skyLow, 0.2);
  ctx.beginPath();
  ctx.arc(moon.x - 6, moon.y - 3, 11, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = palette.hill;
  ctx.beginPath();
  ctx.moveTo(width * 0.2, horizon);
  ctx.quadraticCurveTo(width * 0.31, horizon - 30, width * 0.43, horizon);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(width * 0.56, horizon);
  ctx.quadraticCurveTo(width * 0.7, horizon - 40, width * 0.84, horizon);
  ctx.closePath();
  ctx.fill();
}

function drawBeams(ctx: Ctx, layout: SceneLayout, colour: string, strength: number) {
  if (strength <= 0) {
    return;
  }
  const { lamp, centre } = layout;
  const reach = Math.min(centre - 12, 330);
  const spread = 44;

  for (const side of [-1, 1] as const) {
    const beam = ctx.createLinearGradient(lamp.x, 0, lamp.x + side * reach, 0);
    beam.addColorStop(0, rgba(colour, 0.5 * strength));
    beam.addColorStop(1, rgba(colour, 0));
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(lamp.x, lamp.y - 5);
    ctx.lineTo(lamp.x + side * reach, lamp.y - spread);
    ctx.lineTo(lamp.x + side * reach, lamp.y + spread);
    ctx.lineTo(lamp.x, lamp.y + 5);
    ctx.closePath();
    ctx.fill();
  }

  const glow = ctx.createRadialGradient(lamp.x, lamp.y, 4, lamp.x, lamp.y, 78);
  glow.addColorStop(0, rgba(colour, 0.6 * strength));
  glow.addColorStop(1, rgba(colour, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(lamp.x, lamp.y, 78, 0, Math.PI * 2);
  ctx.fill();
}

function drawSea(ctx: Ctx, layout: SceneLayout) {
  const { width, height, horizon } = layout;
  const sea = ctx.createLinearGradient(0, horizon, 0, height);
  sea.addColorStop(0, palette.seaTop);
  sea.addColorStop(1, palette.seaLow);
  ctx.fillStyle = sea;
  ctx.fillRect(0, horizon, width, height - horizon);

  ctx.strokeStyle = rgba(palette.wave, 0.5);
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  for (const [x, y, length] of waves) {
    const top = horizon + 10 + y * (height - horizon - 20);
    ctx.beginPath();
    ctx.moveTo(x * width - length / 2, top);
    ctx.lineTo(x * width + length / 2, top);
    ctx.stroke();
  }
}

function drawRoutes(ctx: Ctx, layout: SceneLayout, routes: readonly SceneRoute[]) {
  ctx.save();
  ctx.strokeStyle = rgba(palette.route, 0.5);
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.setLineDash([0.5, 9]);
  for (const route of routes) {
    const points = routePath(layout, route, routes.length);
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });
    ctx.stroke();
  }
  ctx.restore();
}

function drawRocks(ctx: Ctx, layout: SceneLayout) {
  const y = layout.homeY + 62;
  ctx.fillStyle = palette.rock;
  for (const side of [-1, 1] as const) {
    const dock = side === -1 ? layout.docks.west : layout.docks.east;
    const x = (layout.centre + dock.x) / 2 + side * 14;
    for (const [dx, half, tall] of [
      [-20, 15, 13],
      [2, 20, 20],
      [24, 12, 10],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(x + dx - half, y);
      ctx.quadraticCurveTo(x + dx - half * 0.5, y - tall * 1.5, x + dx + half * 0.2, y - tall);
      ctx.quadraticCurveTo(x + dx + half, y - tall * 0.6, x + dx + half, y);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawStation(
  ctx: Ctx,
  layout: SceneLayout,
  channel: Channel,
  family: string,
) {
  const { width, horizon, landWidth: land } = layout;
  const mirror = channel === "east";
  const colour = channel === "west" ? palette.amber : palette.blue;
  const hut = { x: land * 0.44, y: horizon - 34 };
  const pierY = layout.docks[channel].y - 14;

  ctx.save();
  if (mirror) {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }

  ctx.fillStyle = palette.land;
  ctx.beginPath();
  ctx.moveTo(0, horizon - 30);
  ctx.quadraticCurveTo(land * 0.36, horizon - 52, land * 0.66, horizon - 26);
  ctx.quadraticCurveTo(land * 0.98, horizon - 4, land, horizon + 34);
  ctx.quadraticCurveTo(land * 1.02, horizon + 92, land * 0.7, horizon + 112);
  ctx.quadraticCurveTo(land * 0.3, horizon + 128, 0, horizon + 122);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = palette.landEdge;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, horizon - 30);
  ctx.quadraticCurveTo(land * 0.36, horizon - 52, land * 0.66, horizon - 26);
  ctx.stroke();

  ctx.fillStyle = palette.wood;
  ctx.fillRect(land * 0.94, pierY, land * 0.06 + 16, 4);
  ctx.fillRect(land + 10, pierY, 3, 12);

  ctx.fillStyle = palette.wood;
  ctx.fillRect(hut.x + 26, hut.y - 46, 2.5, 46);
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(hut.x + 28.5, hut.y - 46);
  ctx.lineTo(hut.x + 46, hut.y - 39);
  ctx.lineTo(hut.x + 28.5, hut.y - 32);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = palette.tower;
  ctx.fillRect(hut.x - 19, hut.y - 22, 38, 24);
  ctx.fillStyle = palette.band;
  ctx.beginPath();
  ctx.moveTo(hut.x - 24, hut.y - 22);
  ctx.lineTo(hut.x, hut.y - 38);
  ctx.lineTo(hut.x + 24, hut.y - 22);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = palette.frame;
  ctx.fillRect(hut.x - 13, hut.y - 12, 8, 14);
  ctx.fillStyle = colour;
  ctx.fillRect(hut.x + 2, hut.y - 14, 10, 8);

  ctx.restore();

  const labelX = mirror ? width - land * 0.46 : land * 0.46;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = palette.label;
  type(ctx, family, 15, 700);
  ctx.fillText(channel === "west" ? "West" : "East", labelX, horizon + 26);
  ctx.fillStyle = colour;
  type(ctx, family, 12, 600);
  ctx.fillText(channel === "west" ? "west channel" : "east channel", labelX, horizon + 44);
}

function drawLighthouse(
  ctx: Ctx,
  layout: SceneLayout,
  picture: HarbourPicture,
  family: string,
) {
  const { centre, islandTop: top, islandHalf: half, lamp, logbook, keeper } = layout;
  const gallery = lamp.y + 16;

  ctx.fillStyle = palette.land;
  ctx.beginPath();
  ctx.moveTo(centre - half, top + 28);
  ctx.quadraticCurveTo(centre - half * 0.92, top - 2, centre - half * 0.5, top - 2);
  ctx.lineTo(centre + half * 0.5, top - 2);
  ctx.quadraticCurveTo(centre + half * 0.92, top - 2, centre + half, top + 28);
  ctx.quadraticCurveTo(centre, top + 46, centre - half, top + 28);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = palette.landEdge;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(centre - half * 0.62, top - 1);
  ctx.lineTo(centre + half * 0.62, top - 1);
  ctx.stroke();

  ctx.fillStyle = palette.wood;
  ctx.fillRect(centre - half * 0.66, top + jettyDrop, half * 1.32, 4);
  ctx.fillRect(centre - half * 0.66, top + jettyDrop, 3, 13);
  ctx.fillRect(centre + half * 0.66 - 3, top + jettyDrop, 3, 13);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(centre - 24, top);
  ctx.lineTo(centre - 15, gallery);
  ctx.lineTo(centre + 15, gallery);
  ctx.lineTo(centre + 24, top);
  ctx.closePath();
  ctx.fillStyle = palette.tower;
  ctx.fill();
  ctx.clip();
  const tall = top - gallery;
  ctx.fillStyle = palette.band;
  ctx.fillRect(centre - 30, gallery + tall * 0.2, 60, tall * 0.16);
  ctx.fillRect(centre - 30, gallery + tall * 0.56, 60, tall * 0.16);
  ctx.fillStyle = "rgba(20, 16, 50, 0.14)";
  ctx.fillRect(centre + 4, gallery, 30, tall);
  ctx.restore();

  ctx.fillStyle = palette.frame;
  rounded(ctx, centre - 6.5, top - 20, 13, 20, 6);
  ctx.fill();

  ctx.fillStyle = palette.band;
  ctx.fillRect(centre - 23, gallery - 4, 46, 6);

  ctx.fillStyle = palette.frame;
  ctx.fillRect(centre - 14, lamp.y - 15, 28, 27);
  ctx.fillStyle = mix(lampGlass(picture.lampFrom), lampGlass(picture.lamp), picture.lampMix);
  ctx.fillRect(centre - 10, lamp.y - 11, 20, 20);
  if (picture.lamp === "dark" && picture.lampMix > 0.5) {
    ctx.strokeStyle = rgba(palette.unlit, 0.7);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(centre - 6, lamp.y - 7);
    ctx.lineTo(centre + 6, lamp.y + 5);
    ctx.moveTo(centre + 6, lamp.y - 7);
    ctx.lineTo(centre - 6, lamp.y + 5);
    ctx.stroke();
  }

  ctx.fillStyle = palette.band;
  ctx.beginPath();
  ctx.moveTo(centre - 19, lamp.y - 15);
  ctx.lineTo(centre, lamp.y - 34);
  ctx.lineTo(centre + 19, lamp.y - 15);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(centre, lamp.y - 35, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = palette.wood;
  ctx.fillRect(logbook.x + 12, logbook.y + logbook.height, 3, top - logbook.y - logbook.height + 2);
  ctx.fillRect(
    logbook.x + logbook.width - 15,
    logbook.y + logbook.height,
    3,
    top - logbook.y - logbook.height + 2,
  );
  ctx.fillStyle = palette.paper;
  rounded(ctx, logbook.x, logbook.y, logbook.width, logbook.height, 3);
  ctx.fill();
  ctx.fillStyle = palette.paperEdge;
  ctx.fillRect(logbook.x, logbook.y + 17, logbook.width, 1);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = palette.inkSoft;
  type(ctx, family, 10.5, 600);
  ctx.fillText("Logbook", logbook.x + 8, logbook.y + 13);
  ctx.fillStyle = picture.logbook ? palette.ink : palette.inkSoft;
  type(ctx, family, 15, 700);
  ctx.fillText(picture.logbook ?? "—", logbook.x + 8, logbook.y + 36);

  ctx.strokeStyle = palette.frame;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(keeper.x - 3, keeper.y - 9);
  ctx.lineTo(keeper.x - 4, keeper.y - 1);
  ctx.moveTo(keeper.x + 3, keeper.y - 9);
  ctx.lineTo(keeper.x + 4, keeper.y - 1);
  ctx.stroke();
  ctx.fillStyle = "#c9d3ea";
  rounded(ctx, keeper.x - 7.5, keeper.y - 27, 15, 19, 5);
  ctx.fill();
  ctx.fillStyle = "#f0c9a4";
  ctx.beginPath();
  ctx.arc(keeper.x, keeper.y - 33, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = palette.band;
  rounded(ctx, keeper.x - 6.5, keeper.y - 40.5, 13, 5, 2);
  ctx.fill();
}

function drawMooring(ctx: Ctx, layout: SceneLayout, moored: number, family: string) {
  const { mooring } = layout;
  const half = 50 + ((moored - 1) * mooringGap) / 2;
  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.07)";
  rounded(ctx, mooring.x - half, mooring.y - 56, half * 2, 66, 6);
  ctx.fill();
  ctx.strokeStyle = rgba(palette.label, 0.55);
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 5]);
  rounded(ctx, mooring.x - half, mooring.y - 56, half * 2, 66, 6);
  ctx.stroke();
  ctx.restore();
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = palette.label;
  type(ctx, family, 12, 600);
  ctx.fillText("Earlier reports", mooring.x, mooring.y + 27);
}

function drawBoat(ctx: Ctx, boat: SceneBoat, family: string) {
  const { x, y } = boat;

  if (boat.revealed) {
    ctx.fillStyle = reportColour(boat.report);
    rounded(ctx, x - 2, y - 52, 24, 20, 2);
    ctx.fill();
    if (boat.report === "slip") {
      ctx.save();
      ctx.strokeStyle = palette.inkSoft;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 2]);
      rounded(ctx, x - 2, y - 52, 24, 20, 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  ctx.strokeStyle = palette.label;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x - 6, y - 7);
  ctx.lineTo(x - 6, y - 40);
  ctx.stroke();

  ctx.fillStyle = palette.paper;
  rounded(ctx, x - 5, y - 41, 30, 22, 2);
  ctx.fill();
  ctx.strokeStyle = palette.paperEdge;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x - 5, y - 40);
  ctx.lineTo(x + 10, y - 33);
  ctx.lineTo(x + 25, y - 40);
  ctx.stroke();
  ctx.fillStyle = palette.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  type(ctx, family, 13, 700);
  ctx.fillText(String(boat.id), x + 10, y - 22.5);

  ctx.fillStyle = palette.hull;
  ctx.beginPath();
  ctx.moveTo(x - boatHalf, y - 8);
  ctx.lineTo(x + boatHalf, y - 8);
  ctx.quadraticCurveTo(x + boatHalf - 3, y + 4, x + boatHalf - 11, y + 4);
  ctx.lineTo(x - boatHalf + 11, y + 4);
  ctx.quadraticCurveTo(x - boatHalf + 3, y + 4, x - boatHalf, y - 8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = palette.hullTrim;
  ctx.fillRect(x - boatHalf, y - 9, boatHalf * 2, 2.5);
}

function drawFocus(ctx: Ctx, layout: SceneLayout, picture: HarbourPicture) {
  const { focus } = picture;
  if (!focus) {
    return;
  }
  ctx.save();
  ctx.strokeStyle = rgba(palette.focus, 0.9);
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.setLineDash([2, 7]);

  const board = layout.logbook;
  const ringBoard = () => {
    rounded(ctx, board.x - 6, board.y - 6, board.width + 12, board.height + 12, 8);
    ctx.stroke();
  };

  if (focus.target === "lamp") {
    ctx.beginPath();
    ctx.arc(layout.lamp.x, layout.lamp.y - 6, 42, 0, Math.PI * 2);
    ctx.stroke();
  } else if (focus.target === "logbook") {
    ringBoard();
  } else {
    const boat = picture.boats.find((item) => item.id === focus.id);
    if (focus.target === "numbers") {
      ringBoard();
    }
    if (boat?.moored) {
      const half = 50 + ((picture.moored - 1) * mooringGap) / 2;
      ctx.setLineDash([]);
      rounded(ctx, layout.mooring.x - half, layout.mooring.y - 56, half * 2, 66, 6);
      ctx.stroke();
    } else if (boat && focus.target === "boat") {
      ctx.beginPath();
      ctx.arc(boat.x + 2, boat.y - 22, 38, 0, Math.PI * 2);
      ctx.stroke();
    } else if (boat) {
      rounded(ctx, boat.x - 12, boat.y - 59, 44, 46, 8);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Paint one frame. Coordinates are the layout's, so scale the context first. */
export function drawHarbour(
  ctx: Ctx,
  layout: SceneLayout,
  picture: HarbourPicture,
  family = "system-ui, sans-serif",
) {
  const from = lampLight(picture.lampFrom);
  const to = lampLight(picture.lamp);
  const share = clamp(picture.lampMix, 0, 1);

  ctx.clearRect(0, 0, layout.width, layout.height);
  drawSky(ctx, layout);
  if (from) {
    drawBeams(ctx, layout, from, 1 - share);
  }
  if (to) {
    drawBeams(ctx, layout, to, share);
  }
  drawSea(ctx, layout);
  drawRoutes(ctx, layout, picture.routes);
  drawRocks(ctx, layout);
  drawStation(ctx, layout, "west", family);
  drawStation(ctx, layout, "east", family);
  drawLighthouse(ctx, layout, picture, family);
  if (picture.moored > 0) {
    drawMooring(ctx, layout, picture.moored, family);
  }
  for (const boat of [...picture.boats].sort((left, right) => left.y - right.y)) {
    drawBoat(ctx, boat, family);
  }
  drawFocus(ctx, layout, picture);
}
