import type { HarbourFrame, HarbourMessenger, LampSignal } from "./harbour.ts";
import {
  homeSlot,
  mooringSlot,
  pointAlong,
  routePath,
  type SceneBoat,
  type SceneLayout,
  type SceneRoute,
} from "./harbourPicture.ts";

/**
 * A messenger's trip is one number. 0 is the lighthouse berth, 1 is the
 * station, and 2 is the berth again, so the report is aboard from 1 onward.
 */
export type BoatMotion = {
  id: number;
  travel: number;
  /** 0 at the berth, 1 under Earlier reports. */
  aside: number;
};

export type HarbourMotion = {
  boats: readonly BoatMotion[];
  lamp: LampSignal;
  lampFrom: LampSignal;
  lampMix: number;
};

/** How far out a messenger waits while its step says it is still away. */
export const awayTravel = 0.55;

const longPerSecond = 1.5;
const shortPerSecond = 2.4;
const asidePerSecond = 3;
const lampFadeMs = 260;

function travelTarget(messenger: HarbourMessenger): number {
  return messenger.progress === "en-route" ? awayTravel : 2;
}

function asideTarget(messenger: HarbourMessenger): number {
  return messenger.progress === "set-aside" ? 1 : 0;
}

/** Where everything rests for this frame, with no animation left to run. */
export function settledMotion(frame: HarbourFrame): HarbourMotion {
  return {
    boats: frame.messengers.map((messenger) => ({
      id: messenger.id,
      travel: travelTarget(messenger),
      aside: asideTarget(messenger),
    })),
    lamp: frame.signal,
    lampFrom: frame.signal,
    lampMix: 1,
  };
}

/**
 * Move the picture toward the frame by `elapsedMs`. Boats only sail forward:
 * a step that puts one earlier on its trip places it there at once. The lamp
 * waits for the boats, so a colour appears when its report has arrived.
 */
export function stepMotion(
  current: HarbourMotion,
  frame: HarbourFrame,
  elapsedMs: number,
): { motion: HarbourMotion; moving: boolean } {
  const seconds = Math.max(elapsedMs, 0) / 1000;
  let sailing = false;
  let mooring = false;

  const boats = frame.messengers.map((messenger) => {
    const before = current.boats.find((boat) => boat.id === messenger.id);
    const target = travelTarget(messenger);
    const away = asideTarget(messenger);
    let travel = before?.travel ?? 0;
    let aside = before?.aside ?? 0;

    if (travel > target) {
      travel = target;
    } else if (travel < target) {
      const rate = messenger.route === "long" ? longPerSecond : shortPerSecond;
      travel = Math.min(target, travel + rate * seconds);
    }

    if (aside > away) {
      aside = away;
    } else if (aside < away && travel >= target) {
      aside = Math.min(away, aside + asidePerSecond * seconds);
    }

    if (travel < target) {
      sailing = true;
    }
    if (aside < away) {
      mooring = true;
    }
    return { id: messenger.id, travel, aside };
  });

  let { lamp, lampFrom, lampMix } = current;
  if (lamp !== frame.signal && !sailing) {
    lampFrom = lamp;
    lamp = frame.signal;
    lampMix = 0;
  } else if (lampMix < 1) {
    lampMix = Math.min(1, lampMix + Math.max(elapsedMs, 0) / lampFadeMs);
  }

  return {
    motion: { boats, lamp, lampFrom, lampMix },
    moving: sailing || mooring || lamp !== frame.signal || lampMix < 1,
  };
}

function ease(share: number): number {
  return share * share * (3 - 2 * share);
}

/** Turn trip numbers into drawn boats. */
export function sceneBoats(
  layout: SceneLayout,
  routes: readonly SceneRoute[],
  frame: HarbourFrame,
  motion: HarbourMotion,
): SceneBoat[] {
  return frame.messengers.flatMap((messenger) => {
    const route = routes.find((item) => item.id === messenger.id);
    const state = motion.boats.find((boat) => boat.id === messenger.id);
    if (!route || !state) {
      return [];
    }
    const along = state.travel <= 1 ? state.travel : 2 - state.travel;
    let point = state.travel >= 2
      ? homeSlot(layout, route.slot, routes.length)
      : pointAlong(routePath(layout, route, routes.length), along);
    if (state.aside > 0) {
      const place = Math.max(frame.setAside.findIndex((item) => item.id === messenger.id), 0);
      const berth = mooringSlot(layout, place, Math.max(frame.setAside.length, 1));
      const share = ease(state.aside);
      point = {
        x: point.x + (berth.x - point.x) * share,
        y: point.y + (berth.y - point.y) * share,
      };
    }
    return [{
      id: messenger.id,
      x: point.x,
      y: point.y,
      report: messenger.report,
      revealed: state.travel >= 1,
      moored: state.aside >= 1,
    }];
  });
}
