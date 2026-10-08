/**
 * Continental drift from a plate model (data/geo/paleo/<model>.json, built by
 * `npm run paleo:setup`): today's coastlines, the plate each rides on, and
 * every plate's finite rotation (quaternion) per time step. Land at any age
 * is today's coastlines rotated by the slerp-interpolated rotation, so the
 * motion is smooth between steps. Same method and convention as GPlates;
 * verified against the GPlates Web Service when the data is built.
 */
import type {Feature, FeatureCollection, MultiLineString, Polygon} from 'geojson';
import {useEffect, useState} from 'react';
import {cancelRender, continueRender, delayRender, staticFile} from 'remotion';
import {fixWinding} from './data';

export interface PaleoData {
  model: string;
  maxMa: number;
  step: number;
  credit: string;
  polygons: {pid: number; rings: [number, number][][]}[];
  rotations: Record<string, number[][]>;
}
export interface PaleoBoundaries {
  lines: {type: string; coords: [number, number][]}[];
}

const cache = new Map<string, unknown>();
const pending = new Map<string, Promise<unknown>>();

function useJson<T>(file: string | null): T | null {
  const [handle] = useState(() => (file && !cache.has(file) ? delayRender(`paleo ${file}`) : null));
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!file || cache.has(file)) {
      if (handle !== null) continueRender(handle);
      return;
    }
    let p = pending.get(file);
    if (!p) {
      p = fetch(staticFile(`geo/${file}`))
        .then((r) => {
          if (!r.ok) throw new Error(`geo/${file} not found (HTTP ${r.status}): run npm run paleo:setup`);
          return r.json();
        })
        .then((j) => {
          // Spherical winding for d3, fixed once on today's rings (rotation preserves it).
          if (j && Array.isArray(j.polygons)) {
            const fc = fixWinding({
              type: 'FeatureCollection',
              features: j.polygons.map((x: PaleoData['polygons'][number]) => ({type: 'Feature', properties: {}, geometry: {type: 'Polygon', coordinates: x.rings}})),
            } as never) as unknown as FeatureCollection<Polygon>;
            j.polygons.forEach((x: PaleoData['polygons'][number], i: number) => (x.rings = fc.features[i].geometry.coordinates as [number, number][][]));
          }
          cache.set(file, j);
          return j;
        });
      pending.set(file, p);
    }
    p.then(() => {
      setTick((t) => t + 1);
      if (handle !== null) continueRender(handle);
    }).catch((e) => cancelRender(e));
  }, [file, handle]);
  return file ? ((cache.get(file) as T) ?? null) : null;
}

export const usePaleo = (model: string | null) => useJson<PaleoData>(model ? `paleo/${model}.json` : null);
export const usePaleoBoundaries = (model: string | null) => useJson<PaleoBoundaries>(model ? `paleo/${model}-boundaries.json` : null);

type Q = [number, number, number, number];
const IDENTITY: Q = [1, 0, 0, 0];

/** Spherical interpolation between unit quaternions. */
function slerp(a: number[], b: number[], t: number): Q {
  let [bw, bx, by, bz] = b;
  let dot = a[0] * bw + a[1] * bx + a[2] * by + a[3] * bz;
  if (dot < 0) {
    dot = -dot;
    bw = -bw;
    bx = -bx;
    by = -by;
    bz = -bz;
  }
  if (dot > 0.9995) {
    const q: Q = [a[0] + t * (bw - a[0]), a[1] + t * (bx - a[1]), a[2] + t * (by - a[2]), a[3] + t * (bz - a[3])];
    const n = Math.hypot(...q);
    return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
  }
  const th = Math.acos(dot);
  const s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s;
  const wb = Math.sin(t * th) / s;
  return [wa * a[0] + wb * bw, wa * a[1] + wb * bx, wa * a[2] + wb * by, wa * a[3] + wb * bz];
}

/** The rotation of plate `pid` from today to `ma` million years ago. */
export function plateRotation(d: PaleoData, pid: number, ma: number): Q {
  const rows = d.rotations[String(pid)];
  if (!rows) return IDENTITY;
  const x = Math.max(0, Math.min(d.maxMa, ma)) / d.step;
  const i = Math.floor(x);
  const a = rows[i] ?? IDENTITY;
  const b = rows[Math.min(rows.length - 1, i + 1)] ?? a;
  return slerp(a, b, x - i);
}

const RAD = Math.PI / 180;
function rotateLonLat(q: Q, lon: number, lat: number): [number, number] {
  const l = lon * RAD;
  const p = lat * RAD;
  const vx = Math.cos(p) * Math.cos(l);
  const vy = Math.cos(p) * Math.sin(l);
  const vz = Math.sin(p);
  const [w, x, y, z] = q;
  // v' = q v q*
  const ix = w * vx + y * vz - z * vy;
  const iy = w * vy + z * vx - x * vz;
  const iz = w * vz + x * vy - y * vx;
  const iw = -x * vx - y * vy - z * vz;
  const rx = ix * w - iw * x - iy * z + iz * y;
  const ry = iy * w - iw * y - iz * x + ix * z;
  const rz = iz * w - iw * z - ix * y + iy * x;
  return [Math.atan2(ry, rx) / RAD, Math.asin(Math.max(-1, Math.min(1, rz))) / RAD];
}

/** Today's position (lon, lat on plate pid) moved back to `ma`. */
export const paleoPoint = (d: PaleoData, pid: number, lon: number, lat: number, ma: number) => rotateLonLat(plateRotation(d, pid, ma), lon, lat);

/** All land at `ma`, as polygons for d3-geo. */
export function paleoLand(d: PaleoData, ma: number): Feature<Polygon>[] {
  const qs = new Map<number, Q>();
  return d.polygons.map((p) => {
    let q = qs.get(p.pid);
    if (!q) qs.set(p.pid, (q = plateRotation(d, p.pid, ma)));
    const qq = q;
    return {type: 'Feature', properties: {pid: p.pid}, geometry: {type: 'Polygon', coordinates: p.rings.map((r) => r.map(([lon, lat]) => rotateLonLat(qq, lon, lat)))}};
  });
}

/** Present-day plate boundaries, split by kind (ridges, subduction zones, other). */
export function boundaryLines(b: PaleoBoundaries): Record<'ridge' | 'subduction' | 'other', Feature<MultiLineString>> {
  const pick = (test: (t: string) => boolean): Feature<MultiLineString> => ({
    type: 'Feature',
    properties: {},
    geometry: {type: 'MultiLineString', coordinates: b.lines.filter((l) => test(l.type)).map((l) => l.coords)},
  });
  return {
    ridge: pick((t) => /Ridge/i.test(t)),
    subduction: pick((t) => /Subduction/i.test(t)),
    other: pick((t) => !/Ridge|Subduction/i.test(t)),
  };
}
