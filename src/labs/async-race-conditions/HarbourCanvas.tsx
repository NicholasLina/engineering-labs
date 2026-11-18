import { useEffect, useRef } from "react";
import { assignmentShort, type HarbourFocus, type HarbourFrame } from "./harbour.ts";
import {
  drawHarbour,
  sceneLayout,
  type HarbourPicture,
  type SceneFocus,
  type SceneRoute,
} from "./harbourPicture.ts";
import { sceneBoats, settledMotion, stepMotion, type HarbourMotion } from "./harbourMotion.ts";

const fallbackSize = { width: 800, height: 450 };
const smallestScale = 0.78;
const largestScale = 1.3;

function sceneFocus(focus: HarbourFocus | null): SceneFocus | null {
  if (!focus) {
    return null;
  }
  if (focus.target === "messenger") {
    return { target: "boat", id: focus.id };
  }
  return focus;
}

function cardShown(messenger: HarbourFrame["messengers"][number]): string {
  if (messenger.progress === "en-route" || messenger.report === "slip") {
    return "";
  }
  return messenger.report;
}

type Latest = {
  frame: HarbourFrame;
  routes: readonly SceneRoute[];
  focus: HarbourFocus | null;
};

/**
 * The harbour picture. The canvas is scenery: every word the lesson depends on
 * is also in the page as text. The elements inside the canvas are its fallback
 * content, and they carry the same state the drawing shows.
 */
export function HarbourCanvas({
  frame,
  routes,
  focus,
  reducedMotion,
}: {
  frame: HarbourFrame;
  routes: readonly SceneRoute[];
  focus: HarbourFocus | null;
  reducedMotion: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef<Latest>({ frame, routes, focus });
  const motion = useRef<HarbourMotion | null>(null);
  const run = useRef<(snap: boolean) => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d") ?? null;
    if (!canvas || !ctx) {
      return;
    }

    let handle = 0;
    let previous = 0;

    function draw() {
      if (!canvas || !ctx) {
        return;
      }
      const state = latest.current;
      const box = canvas.getBoundingClientRect();
      const cssWidth = box.width || fallbackSize.width;
      const cssHeight = box.height || fallbackSize.height;
      const ratio = window.devicePixelRatio || 1;
      const pixelWidth = Math.round(cssWidth * ratio);
      const pixelHeight = Math.round(cssHeight * ratio);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }

      const scale = Math.min(Math.max(cssWidth / fallbackSize.width, smallestScale), largestScale);
      const layout = sceneLayout(cssWidth / scale, cssHeight / scale);
      const current = motion.current ?? settledMotion(state.frame);
      const picture: HarbourPicture = {
        lamp: current.lamp,
        lampFrom: current.lampFrom,
        lampMix: current.lampMix,
        logbook: state.frame.assignment === "No assignment"
          ? null
          : assignmentShort(state.frame.assignment),
        routes: state.routes,
        boats: sceneBoats(layout, state.routes, state.frame, current),
        moored: state.frame.setAside.length,
        focus: sceneFocus(state.focus),
      };

      ctx.setTransform(ratio * scale, 0, 0, ratio * scale, 0, 0);
      drawHarbour(ctx, layout, picture, getComputedStyle(canvas).fontFamily || undefined);
    }

    function tick(now: number) {
      const elapsed = previous === 0 ? 16 : Math.min(now - previous, 64);
      previous = now;
      const next = stepMotion(motion.current ?? settledMotion(latest.current.frame), latest.current.frame, elapsed);
      motion.current = next.motion;
      draw();
      handle = next.moving ? requestAnimationFrame(tick) : 0;
    }

    run.current = (snap) => {
      if (snap || motion.current === null) {
        cancelAnimationFrame(handle);
        handle = 0;
        motion.current = settledMotion(latest.current.frame);
        draw();
        return;
      }
      if (handle === 0) {
        previous = 0;
        handle = requestAnimationFrame(tick);
      }
    };

    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(draw);
    observer?.observe(canvas);
    window.addEventListener("resize", draw);

    return () => {
      cancelAnimationFrame(handle);
      observer?.disconnect();
      window.removeEventListener("resize", draw);
      run.current = () => {};
    };
  }, []);

  useEffect(() => {
    latest.current = { frame, routes, focus };
    run.current(reducedMotion);
  }, [frame, routes, focus, reducedMotion]);

  return (
    <div className="harbour-view">
      <canvas
        ref={canvasRef}
        className="harbour-scene harbour-lamp"
        aria-hidden="true"
        data-signal={frame.signal}
        data-focus={focus?.target ?? "none"}
      >
        <ul>
          <li data-station="west">West station sends amber.</li>
          <li data-station="east">East station sends blue.</li>
          <li>{`Lamp: ${frame.signalLabel}.`}</li>
          {frame.messengers.map((messenger) => (
            <li
              key={messenger.id}
              className="harbour-messenger"
              data-messenger={messenger.id}
              data-progress={messenger.progress}
              data-route={messenger.route}
              data-carrying={messenger.carrying}
              data-card={cardShown(messenger)}
            >
              {`Messenger ${messenger.id}, ${messenger.route} route.`}
            </li>
          ))}
        </ul>
      </canvas>
    </div>
  );
}
