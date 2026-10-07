/**
 * Motion vocabulary. Small and deliberate: elements arrive with a short
 * ease-out rise and settle. No bounces, spins or perpetual drift.
 */
import {Easing, interpolate} from 'remotion';

export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
export const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

/** 0→1 progress for an entrance starting at `delay` frames, lasting `duration`. */
export function progress(frame: number, delay = 0, duration = 18, easing = EASE_OUT) {
  return interpolate(frame, [delay, delay + duration], [0, 1], {...clamp, easing});
}

/** Opacity + small vertical rise. `distance` is in px (pass a unit-scaled value). */
export function riseIn(frame: number, delay: number, distance: number, duration = 20) {
  const p = progress(frame, delay, duration);
  return {opacity: p, transform: `translateY(${(1 - p) * distance}px)`};
}

/** Fade out over the last `duration` frames of a scene. */
export function fadeOut(frame: number, total: number, duration = 10) {
  return interpolate(frame, [total - duration, total], [1, 0], clamp);
}

/** Slow, barely-perceptible push-in for stills (Ken Burns, restrained). */
export function pushIn(frame: number, total: number, amount = 0.04) {
  return 1 + interpolate(frame, [0, total], [0, amount], {...clamp, easing: EASE_IN_OUT});
}
