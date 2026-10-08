/**
 * npm run paleo:setup [-- --model MULLER2019 --max 250 --step 1 --force]
 *   (Rodinia etc.: --model MERDITH2021 --max 1000 --step 10)
 *
 * Builds data/geo/paleo/<model>.json for animating continental drift:
 *   - present-day coastlines from the plate model (GPlates Web Service),
 *   - the plate ID each coastline rides on (majority vote of its vertices),
 *   - every plate's finite rotation (quaternion) for each 1 Myr step 0..max.
 * The renderer rotates today's coastlines by slerp-interpolated quaternions,
 * so motion is smooth at any frame. Verified against the service's own
 * point reconstruction before saving.
 *
 * Data: Müller et al. (2019) plate model, CC BY 4.0 (doi:10.5281/zenodo.11601026);
 * coastlines derived from GSHHG via EarthByte, CC BY 3.0 AU. Credit both.
 * One-off online fetch from gws.gplates.org (free public service by EarthByte).
 */
import fs from 'node:fs';
import path from 'node:path';
import {geoArea, geoCentroid} from 'd3-geo';
import {ROOT, parseArgs} from './lib/project';

const args = parseArgs();
const model = (args.str('model') ?? 'MULLER2019').toUpperCase();
const maxMa = Number(args.str('max') ?? 250);
const step = Number(args.str('step') ?? 1);
const out = path.join(ROOT, 'data', 'geo', 'paleo', `${model.toLowerCase()}.json`);
if (fs.existsSync(out) && !args.bool('force')) {
  console.log(`${path.relative(ROOT, out)} exists (use --force to rebuild).`);
  process.exit(0);
}
const GWS = 'https://gws.gplates.org';

async function getJson(url: string, body?: URLSearchParams): Promise<any> {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(url, body ? {method: 'POST', body} : undefined);
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${url.slice(0, 120)}`);
      return await r.json();
    } catch (e) {
      if (attempt >= 3) throw e;
      console.warn(`  retry ${attempt}: ${(e as Error).message}`);
      await new Promise((res) => setTimeout(res, 3000 * attempt));
    }
  }
}

type Ring = [number, number][];
const r5 = (v: number) => Math.round(v * 1e4) / 1e4;

// 1. Present-day coastlines (low resolution: plenty for a whole-Earth globe).
console.log(`Model ${model}: fetching present-day coastlines…`);
const coast = await getJson(`${GWS}/reconstruct/coastlines_low/?time=0&model=${model}`);
const polys: Ring[][] = [];
for (const f of coast.features) {
  const g = f.geometry;
  const list: Ring[][] = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  for (const p of list) {
    // Drop specks: they add vertices but nothing visible at globe scale.
    if (geoArea({type: 'Polygon', coordinates: p}) < 2e-6) continue;
    polys.push(p.map((ring) => ring.map(([lon, lat]) => [r5(lon), r5(lat)] as [number, number])));
  }
}
console.log(`  ${polys.length} polygons, ${polys.reduce((n, p) => n + p[0].length, 0)} outer-ring vertices`);

// 2. Plate ID per polygon: assign plate IDs to sample vertices, take the majority.
const samples: {poly: number; lon: number; lat: number}[] = [];
polys.forEach((p, i) => {
  const ring = p[0];
  const n = Math.min(7, ring.length);
  for (let k = 0; k < n; k++) {
    const [lon, lat] = ring[Math.floor((k * ring.length) / n)];
    samples.push({poly: i, lon, lat});
  }
  const [clon, clat] = geoCentroid({type: 'Polygon', coordinates: p});
  samples.push({poly: i, lon: clon, lat: clat});
});
console.log(`Assigning plate IDs (${samples.length} sample points)…`);
const pidOf: number[] = [];
const votes: Record<number, Record<number, number>> = {};
for (let a = 0; a < samples.length; a += 400) {
  const batch = samples.slice(a, a + 400);
  const body = new URLSearchParams({lons: batch.map((s) => s.lon).join(','), lats: batch.map((s) => s.lat).join(','), model});
  const res = await getJson(`${GWS}/reconstruct/assign_points_plate_ids`, body);
  const ids: (number | null)[] = Array.isArray(res) ? res : res.pids ?? res.plate_ids ?? [];
  batch.forEach((s, k) => {
    const id = ids[k];
    if (id === null || id === undefined) return;
    (votes[s.poly] ??= {})[Number(id)] = ((votes[s.poly] ?? {})[Number(id)] ?? 0) + 1;
  });
}
polys.forEach((_, i) => {
  const v = votes[i] ?? {};
  const best = Object.entries(v).sort((x, y) => y[1] - x[1])[0];
  pidOf[i] = best ? Number(best[0]) : 0;
});
const pids = [...new Set(pidOf)].filter((p) => p > 0).sort((a, b) => a - b);
console.log(`  ${pids.length} distinct plates; ${pidOf.filter((p) => p === 0).length} polygon(s) without a plate (kept fixed)`);

// 3. Quaternions for every plate and every 1 Myr step.
console.log(`Fetching rotations 0–${maxMa} Ma…`);
const rotations: Record<number, number[][]> = {};
for (let a = 0; a < pids.length; a += 25) {
  const chunk = pids.slice(a, a + 25);
  const res = await getJson(`${GWS}/rotation/get_quaternions?start=0&end=${maxMa + 1}&step=${step}&pids=${chunk.join(',')}&model=${model}`);
  for (let t = 0; t <= maxMa; t += step) {
    const row = res[`${t}.0`] ?? res[String(t)];
    if (!row) throw new Error(`no rotations returned for ${t} Ma`);
    for (const pid of chunk) (rotations[pid] ??= [])[t / step] = (row[String(pid)] as number[]).map((x) => Math.round(x * 1e7) / 1e7);
  }
  process.stdout.write(`\r  ${Math.min(a + 25, pids.length)}/${pids.length} plates`);
}
console.log();

// 4. Verify: rotate sample points ourselves and compare with the service.
const toVec = (lon: number, lat: number) => {
  const l = (lon * Math.PI) / 180;
  const p = (lat * Math.PI) / 180;
  return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
};
const rotate = (q: number[], v: number[]) => {
  const [w, x, y, z] = q;
  const [vx, vy, vz] = v;
  // v' = q v q*
  const ix = w * vx + y * vz - z * vy;
  const iy = w * vy + z * vx - x * vz;
  const iz = w * vz + x * vy - y * vx;
  const iw = -x * vx - y * vy - z * vz;
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
};
const toLonLat = (v: number[]) => [(Math.atan2(v[1], v[0]) * 180) / Math.PI, (Math.asin(Math.max(-1, Math.min(1, v[2]))) * 180) / Math.PI];
const test = [0, Math.floor(polys.length / 3), Math.floor((2 * polys.length) / 3)].map((i) => ({i, pt: polys[i][0][0], pid: pidOf[i]})).filter((x) => x.pid > 0);
for (const t of [Math.round(maxMa * 0.4 / step) * step, Math.round(maxMa * 0.8 / step) * step]) {
  const res = await getJson(`${GWS}/reconstruct/reconstruct_points/?lons=${test.map((x) => x.pt[0]).join(',')}&lats=${test.map((x) => x.pt[1]).join(',')}&pids=${test.map((x) => x.pid).join(',')}&time=${t}&model=${model}`);
  const coords: number[][] = res.coordinates ?? res;
  test.forEach((x, k) => {
    const mine = toLonLat(rotate(rotations[x.pid][Math.round(t / step)], toVec(x.pt[0], x.pt[1])));
    const theirs = coords[k];
    const d = Math.hypot(((mine[0] - theirs[0] + 540) % 360) - 180, mine[1] - theirs[1]);
    console.log(`  verify ${t} Ma plate ${x.pid}: mine ${mine.map((v) => v.toFixed(2))} vs service ${theirs.map((v) => v.toFixed(2))} (Δ ${d.toFixed(3)}°)`);
    if (d > 0.05) throw new Error('rotation convention mismatch: not saving');
  });
}

fs.mkdirSync(path.dirname(out), {recursive: true});
fs.writeFileSync(
  out,
  JSON.stringify({
    model,
    maxMa,
    step,
    source: `GPlates Web Service (gws.gplates.org), model ${model}, fetched ${new Date().toISOString().slice(0, 10)}`,
    credit: 'Plate model: Müller et al. (2019), Tectonics, CC BY 4.0. Coastlines: EarthByte (GSHHG), CC BY 3.0 AU.',
    polygons: polys.map((p, i) => ({pid: pidOf[i], rings: p})),
    rotations,
  }),
);
console.log(`Wrote ${path.relative(ROOT, out)} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);

// Present-day plate boundaries (ridges, trenches, transforms) for "the surface is broken into plates".
const pb = await getJson(`${GWS}/topology/plate_boundaries/?time=0&model=${model}`);
const lines = pb.features
  .filter((f: any) => f.geometry?.type === 'LineString')
  .map((f: any) => ({type: f.properties?.type ?? '', coords: f.geometry.coordinates.map(([lon, lat]: number[]) => [r5(lon), r5(lat)])}));
const pbOut = path.join(path.dirname(out), `${model.toLowerCase()}-boundaries.json`);
fs.writeFileSync(pbOut, JSON.stringify({model, credit: 'Plate boundaries: Müller et al. (2019) via GPlates Web Service, CC BY 4.0', lines}));
console.log(`Wrote ${path.relative(ROOT, pbOut)} (${lines.length} boundary lines)`);
