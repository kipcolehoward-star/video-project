/**
 * Which map tiles a glmap scene's camera can need, for any local tile set
 * (satellite imagery, elevation). Pure, shared by the scene (MapLibre source
 * bounds) and the Node scripts (which tiles to download and copy).
 */
type Key = {lon: number; lat: number; zoom: number; pitch?: number};
export type Box = [number, number, number, number];
export type TileId = {z: number; x: number; y: number};

const mercY = (lat: number) => (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2;
const latOf = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;

/**
 * Lon/lat box one camera key can see in a W×H frame (MapLibre zoom: 512 px
 * world at zoom 0), with margin for bearing. `reach` (in half-frame heights per
 * unit of sin(pitch)) adds the extra distance a tilted camera sees towards the top of the frame.
 */
function keyBox(k: Key, W: number, H: number, reach: number): Box {
  const world = 512 * 2 ** k.zoom;
  const pitch = ((k.pitch ?? 0) * Math.PI) / 180;
  const hw = (W / 2 / world) * 360 * 1.15 * (1 + Math.sin(pitch));
  const cy = mercY(k.lat);
  const down = ((H / 2) * 1.3) / world;
  const up = ((H / 2) * (1.3 + reach * Math.sin(pitch))) / world;
  return [Math.max(-180, k.lon - hw), Math.max(-85, latOf(Math.min(1, cy + down))), Math.min(180, k.lon + hw), Math.min(85, latOf(Math.max(0, cy - up)))];
}

const union = (a: Box | undefined, b: Box): Box => (a ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] : b);

/** Every tile at zoom z that intersects the box (the same rule MapLibre uses for source bounds). */
function tilesIn(b: Box, z: number): TileId[] {
  const n = 2 ** z;
  const [x0, x1] = [Math.max(0, Math.floor(((b[0] + 180) / 360) * n)), Math.min(n - 1, Math.ceil(((b[2] + 180) / 360) * n) - 1)];
  const [y0, y1] = [Math.max(0, Math.floor(mercY(b[3]) * n)), Math.min(n - 1, Math.ceil(mercY(b[1]) * n) - 1)];
  const out: TileId[] = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push({z, x, y});
  return out;
}

export interface TilePlan {
  minzoom: number;
  maxzoom: number;
  bounds: Box;
  tiles: TileId[];
}

/**
 * Camera positions along the path: the keys plus points between each pair.
 * Kinetic moves ease every component with the same curve, so the camera passes
 * exactly through these straight-line points; the smooth path stays close to them.
 */
function pathSamples(camera: Key[], steps = 8): Key[] {
  const out: Key[] = [camera[0]];
  for (let i = 1; i < camera.length; i++) {
    const [a, b] = [camera[i - 1], camera[i]];
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const mix = (u: number, v: number) => u + (v - u) * t;
      out.push({lon: mix(a.lon, b.lon), lat: mix(a.lat, b.lat), zoom: mix(a.zoom, b.zoom), pitch: mix(a.pitch ?? 0, b.pitch ?? 0)});
    }
  }
  return out;
}

/**
 * Tiles of a 256 px tile set for a camera path. MapLibre draws such tiles at
 * round(map zoom + 1), never below the source's minzoom; `extra` is the most
 * the zoom can grow past a key (drift). For every camera position the finest
 * level is planned where the frame itself is (reaching up a tilted frame), and every coarser level over all
 * a tilted camera can see. The plan must be complete: a missing tile (404) is
 * drawn from its parent in a still, but stalled a video render (2026-10-20).
 */
export function planTiles(camera: Key[], W: number, H: number, extra: number, minzoom: number, maxzoom: number): TilePlan {
  const top = (k: Key) => Math.max(minzoom, Math.min(maxzoom, Math.round(k.zoom + 1 + extra)));
  let bounds: Box | undefined;
  const perLevel = new Map<number, Box>();
  for (const k of pathSamples(camera)) {
    // MapLibre keeps the finest level far up a tilted frame: at pitch 40 it asked for zoom 11 tiles
    // 1.8 half-frames north of the centre (2026-10-20), so the near box reaches 2.5·sin(pitch) further.
    const full = keyBox(k, W, H, 4);
    const near = keyBox(k, W, H, 2.5);
    bounds = union(bounds, full);
    for (let z = minzoom; z <= top(k); z++) perLevel.set(z, union(perLevel.get(z), z > minzoom && z === top(k) ? near : full));
  }
  const r = (v: number) => Math.round(v * 100) / 100;
  return {
    minzoom,
    maxzoom: Math.max(...camera.map(top)),
    bounds: bounds!.map(r) as Box,
    tiles: [...perLevel.entries()].sort((a, b) => a[0] - b[0]).flatMap(([z, b]) => tilesIn(b, z)),
  };
}
