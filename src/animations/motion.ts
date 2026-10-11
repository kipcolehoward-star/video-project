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

/** Shortest signed longitude step in degrees (-180 to 180): 170 -> -170 is +20, not -340. */
export function lonDelta(from: number, to: number) {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

/**
 * One continuous path through keyframes, for camera moves: returns value(time).
 * Monotone cubic (Fritsch-Carlson tangents). It passes through every key at the
 * key's own time with continuous velocity, keeps moving through a key when the
 * value carries on in the same direction, and never overshoots a key. It comes
 * to rest only where the value turns around, where two neighbouring keys are
 * equal (a deliberate hold), and at the first and last key.
 * `times` in frames; a key not later than the one before it is moved one frame after it.
 */
export function smoothPath(times: number[], values: number[]): (t: number) => number {
  const n = Math.min(times.length, values.length);
  if (n === 0) return () => 0;
  const ts: number[] = [];
  for (let i = 0; i < n; i++) ts.push(i === 0 ? times[0] : Math.max(times[i], ts[i - 1] + 1));
  const h = ts.slice(1).map((t, i) => t - ts[i]);
  const slope = h.map((hi, i) => (values[i + 1] - values[i]) / hi);
  // Tangent per key: 0 at both ends and at turning points, otherwise the weighted harmonic mean of the two slopes.
  const m = ts.map((_, i) => {
    if (i === 0 || i === n - 1 || slope[i - 1] * slope[i] <= 0) return 0;
    const w1 = 2 * h[i] + h[i - 1];
    const w2 = h[i] + 2 * h[i - 1];
    return (w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]);
  });
  return (t) => {
    if (t <= ts[0]) return values[0];
    if (t >= ts[n - 1]) return values[n - 1];
    let i = 0;
    while (t > ts[i + 1]) i++;
    const s = (t - ts[i]) / h[i];
    const s2 = s * s;
    const s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * values[i] + (s3 - 2 * s2 + s) * h[i] * m[i] + (3 * s2 - 2 * s3) * values[i + 1] + (s3 - s2) * h[i] * m[i + 1];
  };
}

/**
 * Seconds of drift after `seconds` of holding: starts from rest and settles
 * into a steady rate over about `ramp` seconds, so a held camera eases into its drift.
 */
export function driftTime(seconds: number, ramp = 0.6) {
  return seconds <= 0 ? 0 : seconds - ramp * (1 - Math.exp(-seconds / ramp));
}
