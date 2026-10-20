/**
 * Motion vocabulary for the kinetic style (project.json `style: "kinetic"`):
 * Shorts where something happens on screen every 1–2 seconds, on the spoken
 * word. Elements spring in with a small overshoot, highlights glow and pulse
 * once, the camera snaps between framings and never stops drifting.
 * The documentary style keeps the restrained vocabulary in motion.ts.
 */
import {Easing, interpolate, spring} from 'remotion';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

/** Fast start, long settle: continent-to-city snap-zooms and quick slides. */
export const SNAP = Easing.bezier(0.25, 1, 0.5, 1);

/**
 * 0 → 1 with a small overshoot (about 10%) that settles in roughly 0.5 s.
 * `start` is the frame the element appears on.
 */
export function pop(frame: number, start: number, fps: number) {
  if (frame < start) return 0;
  return spring({frame: frame - start, fps, config: {damping: 11, stiffness: 190, mass: 0.7}});
}

/**
 * A word slammed onto the screen: starts large and transparent, lands at
 * full size with a slight undershoot. Opacity is fully in after 4 frames.
 */
export function slam(frame: number, start: number, fps: number, from = 1.7) {
  if (frame < start) return {scale: from, opacity: 0};
  const s = spring({frame: frame - start, fps, config: {damping: 13, stiffness: 260, mass: 0.6}});
  return {scale: from - (from - 1) * s, opacity: interpolate(frame, [start, start + 4], [0, 1], clamp)};
}

/**
 * Glow intensity for a highlight: rises to 1 in about 0.25 s, then settles to
 * `rest` (it never disappears while the highlight is on).
 */
export function glowPulse(frame: number, start: number, fps: number, rest = 0.45) {
  if (frame < start) return 0;
  const t = (frame - start) / fps;
  if (t < 0.25) return Easing.out(Easing.quad)(t / 0.25);
  return rest + (1 - rest) * Math.exp(-(t - 0.25) / 0.35);
}

/**
 * A camera leg: starts moving at frame `start` (on the word) and arrives
 * `frames` later. "snap" = fast start and long settle; "glide" = ease in and out.
 */
export interface CameraLeg {
  start: number;
  frames: number;
  ease: 'snap' | 'glide';
}

const GLIDE = Easing.bezier(0.65, 0, 0.35, 1);
const legEase = (l: CameraLeg) => (l.ease === 'snap' ? SNAP : GLIDE);

/**
 * Camera value over time for keys reached by legs: values[0] is the opening
 * framing, values[i] is where leg i (legs[i - 1]) arrives. A leg that starts
 * before the previous one has arrived departs from wherever the camera is.
 */
export function legsPath(legs: CameraLeg[], values: number[]): (t: number) => number {
  const from: number[] = [values[0]];
  const at = (i: number, t: number): number => {
    // leg i moves from from[i] to values[i + 1]
    const l = legs[i];
    if (t >= l.start + l.frames) return values[i + 1];
    return from[i] + (values[i + 1] - from[i]) * legEase(l)(Math.max(0, (t - l.start) / l.frames));
  };
  for (let i = 1; i < legs.length; i++) from.push(at(i - 1, legs[i].start));
  return (t) => {
    let i = -1;
    while (i + 1 < legs.length && legs[i + 1].start <= t) i++;
    return i < 0 ? values[0] : at(i, t);
  };
}

/**
 * Continuous push-in on top of the legs (zoom levels per frame): grows while
 * the camera holds, and melts away during the next leg, so the camera is
 * never still and the keys' own framings are still reached.
 */
export function legsDrift(legs: CameraLeg[], rate: number): (t: number) => number {
  if (!rate) return () => 0;
  const before: number[] = [];
  const off = (t: number): number => {
    let i = -1;
    while (i + 1 < legs.length && legs[i + 1].start <= t) i++;
    if (i < 0) return rate * t;
    const l = legs[i];
    const end = l.start + l.frames;
    if (t >= end) return rate * (t - end);
    return before[i] * (1 - legEase(l)((t - l.start) / l.frames));
  };
  for (let i = 0; i < legs.length; i++) before.push(off(legs[i].start - 1e-6));
  return off;
}

/** 1 → 0 over `frames` frames from `end` (quick exits). */
export function exit(frame: number, end: number, frames = 8) {
  return interpolate(frame, [end, end + frames], [1, 0], {...clamp, easing: Easing.in(Easing.quad)});
}

/**
 * Slow continuous growth after an entrance, so a held element is never
 * frozen: 1 → 1 + `amount` over 10 s, starting at `start`.
 */
export function breathe(frame: number, start: number, fps: number, amount = 0.04) {
  return 1 + Math.max(0, (frame - start) / fps) * (amount / 10);
}
