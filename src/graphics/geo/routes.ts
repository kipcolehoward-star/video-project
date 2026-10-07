/**
 * Great-circle routes for the atlas scene: sampled once, then cut to any
 * progress t so a route can "draw itself". Waypoints keep sea lanes off land.
 */
import {geoDistance, geoInterpolate} from 'd3-geo';

export type LonLat = [number, number];

export interface SampledRoute {
  points: LonLat[];
  /** Cumulative angular distance (radians) at each point. */
  dist: number[];
  total: number;
}

const cache = new Map<string, SampledRoute>();

/** Samples a route through waypoints along great circles (~0.5° steps). */
export function sampleRoute(waypoints: LonLat[]): SampledRoute {
  const key = JSON.stringify(waypoints);
  const hit = cache.get(key);
  if (hit) return hit;
  const points: LonLat[] = [waypoints[0]];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const steps = Math.max(2, Math.ceil((geoDistance(a, b) * 180) / Math.PI / 0.5));
    const interp = geoInterpolate(a, b);
    for (let k = 1; k <= steps; k++) points.push(interp(k / steps) as LonLat);
  }
  const dist = [0];
  for (let i = 1; i < points.length; i++) dist.push(dist[i - 1] + geoDistance(points[i - 1], points[i]));
  const r = {points, dist, total: dist[dist.length - 1]};
  cache.set(key, r);
  return r;
}

/** The first `t` (0–1) of a route, ending exactly at the interpolated tip. */
export function routeUpTo(r: SampledRoute, t: number): LonLat[] {
  if (t <= 0) return [r.points[0]];
  if (t >= 1) return r.points;
  const target = r.total * t;
  let i = 1;
  while (i < r.dist.length && r.dist[i] < target) i++;
  const seg = r.dist[i] - r.dist[i - 1] || 1;
  const tip = geoInterpolate(r.points[i - 1], r.points[i])((target - r.dist[i - 1]) / seg) as LonLat;
  return [...r.points.slice(0, i), tip];
}

/** Point at fraction t along the route (for labels and travellers). */
export function routePoint(r: SampledRoute, t: number): LonLat {
  const pts = routeUpTo(r, Math.min(1, Math.max(0, t)));
  return pts[pts.length - 1];
}
