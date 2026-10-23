import {geoCentroid, geoContains} from 'd3-geo';
import type {Feature, Geometry, Position} from 'geojson';
import React, {useMemo} from 'react';
import {AbsoluteFill, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {exit, glowPulse, legsDrift, legsPath, pop, slam, breathe, type CameraLeg} from '../animations/kinetic';
import {EASE_IN_OUT, lonDelta, progress, smoothPath} from '../animations/motion';
import {SafeZoneGuides} from '../components/SafeZoneGuides';
import {flagUrl, usePreloadImages, useGeoLayer, type FC} from '../graphics/geo/data';
import {routePoint, routeUpTo, sampleRoute, type LonLat} from '../graphics/geo/routes';
import {imageryPlan} from '../graphics/glmap/imagery';
import {CountingYear, DROP_SECONDS, DroppedIcon, ICONS, PaperCard, SLOTS, slotRect, StampMark, TONES, toneFilter, Walker, type Slot, type Tone} from '../graphics/kinetic/pictures';
import {GL_ACCENTS, GL_PALETTES, glStyle, highlightLayers, type GlAccent, type GlPaletteName} from '../graphics/glmap/style';
import {terrainPlan} from '../graphics/glmap/terrain';
import {useGlMap, type GlPaint} from '../graphics/glmap/useGlMap';
import type {LayoutContext, Region} from '../layouts/engine';
import {useCue, useLayout, useProps, useShowGuides, useTheme} from '../layouts/ProjectContext';
import type {SceneDefinition, SceneProps} from './types';

/**
 * glmap: a GPU-drawn (MapLibre GL JS) flat map with a tilting, rotating camera,
 * for regional geography (straits, coasts, routes). The base map is drawn by
 * MapLibre from local Natural Earth data; routes, vessels and labels are drawn
 * on top in SVG at map.project() positions, so they use the project's fonts.
 * Timing via cue word or seconds, as in the atlas scene.
 */
type At = string | number;

/**
 * Kinetic beats: one on-screen event each, on a narration word (`on`), with
 * its own animation and sound (`sfx`: a sound kind from project.json
 * `sfxKit`, or false for silence; the default comes from the beat type).
 * `off` removes the element again.
 * - highlight: a country (Natural Earth name) or province/state lights up: fill, outline, glow pulse.
 *   `flag` (ISO 3166-1 alpha-2, e.g. "ru", or "asset:<id>" for a flag that is not a country today, e.g. the Soviet
 *   Union) fills it with that flag instead of a colour, fitted to the part on screen. `exit: "fall"` drops the flag
 *   away on `off` instead of fading it. `flagFit: "stretch"` fits the whole flag to the shape's box instead of covering
 *   it (keeps a corner emblem, like the Soviet hammer and sickle, from being cropped away). `holes` (lake names)
 *   keep lakes inside the country free of its flag (Lake Victoria under Uganda, Kenya and Tanzania).
 *   `name` may also be a lake (Natural Earth name, e.g. "Lake Victoria").
 * - label: text slammed onto the map at lon/lat (`size` hero | big | small).
 * - pulse: an earlier highlight (same `name`) flashes its glow again.
 * - link: a dashed line draws itself from `from` to `to`; `cross` puts a red ✕ on it when it lands.
 *   A label with `was` shows that text from the start of the scene and flips to `text` on its word.
 * Picture layer (src/graphics/kinetic/pictures.tsx); `place` is a third of the safe area (top | center | bottom):
 * - card: a public-domain picture (`asset`) on a paper card that swings in; optional `caption`, `crop` [x, y, w, h] fractions, `tilt` degrees.
 * - icon: a drawn icon (`icon`, e.g. "teutonic-shield") that drops in and lands with a thud; at `place` or on the map at lon/lat; `size` = share of the safe width (default 0.3).
 * - year: a year that counts up from `from` (default value - 60) to `value` with ticks, then lands.
 * - tint: the whole map takes an old-map warmth ("warm"), a cold grade ("cold") or goes back ("none") over 0.6 s.
 *   Silent by default: it is a mood change that rides on a camera move or another beat.
 * - arrow: a thick arrow that draws itself on the map from `from` to `to`, bowed by `bend` (army movements).
 * - stamp: a word pressed onto the screen at an angle, like a rubber stamp.
 * - march: `count` small figures walk on the map from `from` to `to` over `duration` seconds and fade out.
 * - measure: a ruler line from `from` to `to` that draws itself, then shows `text` (e.g. "65 km").
 * - river: Natural Earth rivers (`rivers`, names as in the data) drawn as one glowing line that runs from the end
 *   nearest `from` (the source) over `duration` seconds; `name` is the id a pulse beat uses to flash it.
 * - year with `format: "number"` counts any number with thousands separators (from 0) and an optional `suffix`
 *   (" km", "%").
 * - move: a country's real outline (flag-filled with `flag`, else `color`) slides across the globe to `to` (its
 *   centre lands there) over `duration` seconds, turning `turn` degrees clockwise on the way. It is moved on the
 *   sphere, so on the flat map it shrinks or grows to its true size at the new latitude (Greenland onto Africa).
 *   `keep` [w, s, e, n] keeps only the parts whose centre lies in that box (the contiguous USA without Alaska).
 * Any beat with `on: 0` is already showing when the scene starts (continuity across a cut): no entrance, no sound.
 * `offSfx` plays a sound when the beat's `off` word comes.
 */
export type GlBeat = {on: At; off?: At; sfx?: string | false; offSfx?: string} & (
  | {do: 'highlight'; name: string; color?: GlAccent; flag?: string; flagFit?: 'cover' | 'stretch'; exit?: 'fade' | 'fall'; holes?: string[]}
  | {do: 'pulse'; name: string}
  | {do: 'label'; text: string; lon: number; lat: number; size?: 'hero' | 'big' | 'small'; color?: GlAccent; was?: string}
  | {do: 'link'; from: LonLat; to: LonLat; cross?: boolean; color?: GlAccent; duration?: number}
  | {do: 'card'; asset: string; caption?: string; crop?: [number, number, number, number]; tilt?: number; place?: Slot}
  | {do: 'icon'; icon: string; place?: Slot; lon?: number; lat?: number; size?: number}
  | {do: 'year'; value: number; from?: number; place?: Slot; color?: GlAccent; format?: 'year' | 'number'; suffix?: string}
  | {do: 'river'; name: string; rivers: string[]; from: LonLat; color?: GlAccent; width?: number; duration?: number}
  | {do: 'tint'; tone: Tone}
  | {do: 'arrow'; from: LonLat; to: LonLat; color?: GlAccent; bend?: number; duration?: number}
  | {do: 'stamp'; text: string; place?: Slot; color?: GlAccent}
  | {do: 'march'; from: LonLat; to: LonLat; count?: number; duration?: number}
  | {do: 'measure'; from: LonLat; to: LonLat; text: string; duration?: number}
  | {do: 'move'; name: string; to: LonLat; flag?: string; color?: GlAccent; duration?: number; turn?: number; keep?: [number, number, number, number]}
);
const BEAT_SFX: Record<GlBeat['do'], string | null> = {highlight: 'pop', pulse: 'pulse', label: 'slam', link: 'swish', card: 'paper', icon: 'thud', year: 'tick', tint: null, arrow: 'whoosh', stamp: 'stamp', march: 'footsteps', measure: 'swish', river: 'swish', move: 'whoosh'};
const beatSfx = (b: GlBeat) => (b.do === 'label' && b.was ? 'flip' : BEAT_SFX[b.do]);
const FLIP_FRAMES = 10;
const TINT_FRAMES = 18;

export interface GlMapData {
  /**
   * Camera keys. The camera follows one continuous path through them (motion.ts
   * smoothPath). `zoom` is MapLibre's web-map zoom (+1 = twice as close; about
   * 6.5 shows the whole Strait of Malacca in 16:9). `pitch` tilts the map
   * (0 = straight down, max 60); `bearing` rotates it (degrees, north = 0).
   *
   * Kinetic camera: when any key has `move` (seconds), every key after the first
   * is a move that STARTS at its `at` (on the word) and lasts `move` seconds
   * (default 1), eased "snap" (default: fast start, long settle) or "glide".
   * Each move makes a sound ("whoosh" for snap, "swish" for glide) unless `sfx` says otherwise.
   */
  camera: {at?: At; lon: number; lat: number; zoom: number; pitch?: number; bearing?: number; move?: number; ease?: 'snap' | 'glide'; sfx?: string | false}[];
  /** Continuous push-in, zoom levels per second (default 0.02 in kinetic projects, else 0). Keeps the camera from ever standing still. */
  drift?: number;
  /** Kinetic events on narration words; see GlBeat. */
  beats?: GlBeat[];
  /**
   * Satellite imagery (EOxCloudless 2016, CC BY 4.0; npm run imagery:setup) instead of the drawn sea and land.
   * `true`, or a colour grade: saturation, contrast, brightness (each -1..1; defaults 0.2, 0.12, 0.04).
   */
  imagery?: boolean | {saturation?: number; contrast?: number; brightness?: number};
  palette?: GlPaletteName;
  /** Lines that draw themselves along great circles through `via` (lon/lat), over `duration` seconds. */
  routes?: {via: LonLat[]; at?: At; duration?: number; color?: 'gold' | 'white' | 'red'; style?: 'solid' | 'dashed'}[];
  /**
   * Vessel markers moving along a route (index into `routes`). `count` vessels,
   * evenly spaced, each taking `seconds` for the whole route; `reverse` sails
   * the other way; `offset` (px at 1080p) shifts the lane sideways.
   */
  vessels?: {route?: number; count?: number; seconds?: number; reverse?: boolean; offset?: number; at?: At}[];
  /** Map labels. land: spaced capitals; water: italic serif; place: dot + name. `toward` rotates the label along a line to that point. */
  labels?: {text: string; lon: number; lat: number; kind?: 'land' | 'water' | 'place'; at?: At; until?: At; toward?: LonLat}[];
  /** Darkened frame edges, 0–1 (default 0: none). */
  vignette?: number;
  /**
   * Real elevation from local tiles (npm run terrain:setup): `relief` hillshade
   * strength 0–1 (default 0.6), `tint` land coloured by height (default true),
   * `depth` sea coloured by depth (default true; replaces the drawn shallow-water band).
   */
  terrain?: {relief?: number; tint?: boolean; depth?: boolean};
}

const GL_FIELDS: Record<keyof GlMapData, true> = {camera: true, palette: true, routes: true, vessels: true, labels: true, vignette: true, terrain: true, drift: true, beats: true, imagery: true};
const TERRAIN_FIELDS = ['relief', 'tint', 'depth'];

function problemsFor(d: GlMapData): string[] {
  const out = Object.keys(d)
    .filter((k) => !(k in GL_FIELDS))
    .map((k) => `unknown glmap field "${k}" (check the spelling; it would be ignored)`);
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  if (!Array.isArray(d.camera) || d.camera.length === 0) out.push('glmap needs at least one camera key');
  (Array.isArray(d.camera) ? d.camera : []).forEach((k, i) => {
    if (!num(k.lon) || !num(k.lat) || !num(k.zoom)) out.push(`camera key ${i + 1}: lon, lat and zoom must be numbers`);
    else if (k.zoom < 0 || k.zoom > 12) out.push(`camera key ${i + 1}: zoom must be 0–12 (got ${k.zoom})`);
    if (k.pitch !== undefined && (!num(k.pitch) || k.pitch < 0 || k.pitch > 60)) out.push(`camera key ${i + 1}: pitch must be 0–60 (got ${JSON.stringify(k.pitch)})`);
    if (k.move !== undefined && (!num(k.move) || k.move <= 0 || k.move > 10)) out.push(`camera key ${i + 1}: move must be seconds, more than 0 and at most 10`);
    if (k.ease !== undefined && k.ease !== 'snap' && k.ease !== 'glide') out.push(`camera key ${i + 1}: ease must be snap or glide`);
  });
  if (d.drift !== undefined && (!num(d.drift) || d.drift < 0 || d.drift > 0.2)) out.push('drift must be a number from 0 to 0.2 (zoom levels per second)');
  if (d.imagery !== undefined && typeof d.imagery !== 'boolean') {
    if (typeof d.imagery !== 'object' || d.imagery === null) out.push('imagery must be true, false or a grade like {"saturation": 0.2}');
    else
      for (const [k, v] of Object.entries(d.imagery)) {
        if (!['saturation', 'contrast', 'brightness'].includes(k)) out.push(`unknown imagery field "${k}" (use saturation, contrast, brightness)`);
        else if (!num(v) || (v as number) < -1 || (v as number) > 1) out.push(`imagery.${k} must be a number from -1 to 1`);
      }
  }
  const accent = (c: unknown) => c === undefined || (GL_ACCENTS as readonly unknown[]).includes(c);
  const lonLat = (v: unknown) => Array.isArray(v) && v.length === 2 && v.every(num);
  (d.beats ?? []).forEach((b, i) => {
    const n = `beat ${i + 1}`;
    if (b.on === undefined) out.push(`${n}: needs "on" (a narration word or seconds)`);
    if (b.sfx !== undefined && b.sfx !== false && typeof b.sfx !== 'string') out.push(`${n}: sfx must be a sound kind (e.g. "pop") or false`);
    if (!accent((b as {color?: unknown}).color)) out.push(`${n}: color must be one of ${GL_ACCENTS.join(', ')}`);
    if (b.do === 'highlight') {
      if (typeof b.name !== 'string' || !b.name) out.push(`${n}: highlight needs a "name" (country or province)`);
      if (b.flag !== undefined && !(typeof b.flag === 'string' && (/^[a-z]{2}$/i.test(b.flag) || b.flag.startsWith('asset:')))) out.push(`${n}: flag must be a two-letter ISO 3166-1 code (e.g. "ru") or "asset:<id>"`);
      if (b.exit !== undefined && b.exit !== 'fade' && b.exit !== 'fall') out.push(`${n}: exit must be fade or fall`);
      if (b.flagFit !== undefined && b.flagFit !== 'cover' && b.flagFit !== 'stretch') out.push(`${n}: flagFit must be cover or stretch`);
      if (b.holes !== undefined && !(Array.isArray(b.holes) && b.holes.every((h) => typeof h === 'string'))) out.push(`${n}: holes must be a list of lake names`);
    } else if (b.do === 'pulse') {
      if (!(d.beats ?? []).some((h) => (h.do === 'highlight' || h.do === 'river') && h.name === b.name)) out.push(`${n}: pulse "${b.name}" needs a highlight or river beat with the same name`);
    } else if (b.do === 'label') {
      if (typeof b.text !== 'string' || !num(b.lon) || !num(b.lat)) out.push(`${n}: label needs text, lon and lat`);
      if (b.size !== undefined && !['hero', 'big', 'small'].includes(b.size)) out.push(`${n}: size must be hero, big or small`);
      if (b.was !== undefined && typeof b.was !== 'string') out.push(`${n}: was must be text (the label shown before it flips)`);
    } else if (b.do === 'link') {
      if (!lonLat(b.from) || !lonLat(b.to)) out.push(`${n}: link needs from and to as [lon, lat]`);
    } else if (b.do === 'card') {
      if (typeof b.asset !== 'string' || !b.asset.startsWith('asset:')) out.push(`${n}: card needs "asset": "asset:<id>"`);
      if (b.crop !== undefined && !(Array.isArray(b.crop) && b.crop.length === 4 && b.crop.every((v) => num(v) && v >= 0 && v <= 1) && b.crop[0] + b.crop[2] <= 1 && b.crop[1] + b.crop[3] <= 1 && b.crop[2] > 0 && b.crop[3] > 0))
        out.push(`${n}: crop must be [x, y, w, h] fractions of the picture, inside it`);
      if (b.tilt !== undefined && (!num(b.tilt) || Math.abs(b.tilt) > 20)) out.push(`${n}: tilt must be degrees from -20 to 20`);
    } else if (b.do === 'icon') {
      if (!(b.icon in ICONS)) out.push(`${n}: unknown icon "${b.icon}" (drawn icons: ${Object.keys(ICONS).join(', ')})`);
      if ((b.lon === undefined) !== (b.lat === undefined) || (b.lon !== undefined && (!num(b.lon) || !num(b.lat)))) out.push(`${n}: icon on the map needs both lon and lat as numbers`);
      if (b.size !== undefined && (!num(b.size) || b.size <= 0 || b.size > 1)) out.push(`${n}: size must be a share of the safe width, more than 0 and at most 1`);
    } else if (b.do === 'river') {
      if (typeof b.name !== 'string' || !b.name) out.push(`${n}: river needs a "name" (the id pulses use)`);
      if (!Array.isArray(b.rivers) || !b.rivers.length || !b.rivers.every((r) => typeof r === 'string')) out.push(`${n}: river needs "rivers": Natural Earth river names`);
      if (!lonLat(b.from)) out.push(`${n}: river needs "from" [lon, lat] (where it starts drawing)`);
      if (b.width !== undefined && (!num(b.width) || b.width <= 0 || b.width > 5)) out.push(`${n}: width must be a number from 0 to 5`);
      if (b.duration !== undefined && (!num(b.duration) || b.duration <= 0 || b.duration > 10)) out.push(`${n}: duration must be seconds, more than 0 and at most 10`);
    } else if (b.do === 'year') {
      if (b.format !== undefined && b.format !== 'year' && b.format !== 'number') out.push(`${n}: format must be year or number`);
      if (b.suffix !== undefined && typeof b.suffix !== 'string') out.push(`${n}: suffix must be text`);
      if (!Number.isInteger(b.value)) out.push(`${n}: year needs a whole-number "value"`);
      if (b.from !== undefined && !Number.isInteger(b.from)) out.push(`${n}: from must be a whole number`);
    } else if (b.do === 'tint') {
      if (!TONES.includes(b.tone)) out.push(`${n}: tone must be one of ${TONES.join(', ')}`);
    } else if (b.do === 'arrow' || b.do === 'march' || b.do === 'measure') {
      if (!lonLat(b.from) || !lonLat(b.to)) out.push(`${n}: ${b.do} needs from and to as [lon, lat]`);
      if (b.duration !== undefined && (!num(b.duration) || b.duration <= 0 || b.duration > 10)) out.push(`${n}: duration must be seconds, more than 0 and at most 10`);
      if (b.do === 'measure' && typeof b.text !== 'string') out.push(`${n}: measure needs "text" (e.g. "65 km")`);
      if (b.do === 'march' && b.count !== undefined && !(Number.isInteger(b.count) && b.count >= 1 && b.count <= 20)) out.push(`${n}: count must be a whole number from 1 to 20`);
      if (b.do === 'arrow' && b.bend !== undefined && (!num(b.bend) || Math.abs(b.bend) > 1)) out.push(`${n}: bend must be a number from -1 to 1`);
    } else if (b.do === 'stamp') {
      if (typeof b.text !== 'string' || !b.text) out.push(`${n}: stamp needs "text"`);
    } else if (b.do === 'move') {
      if (typeof b.name !== 'string' || !b.name) out.push(`${n}: move needs a "name" (country)`);
      if (!lonLat(b.to)) out.push(`${n}: move needs "to" as [lon, lat]`);
      if (b.flag !== undefined && !(typeof b.flag === 'string' && /^[a-z]{2}$/i.test(b.flag))) out.push(`${n}: flag must be a two-letter ISO 3166-1 code`);
      if (b.duration !== undefined && (!num(b.duration) || b.duration <= 0 || b.duration > 10)) out.push(`${n}: duration must be seconds, more than 0 and at most 10`);
      if (b.turn !== undefined && !num(b.turn)) out.push(`${n}: turn must be degrees`);
      if (b.keep !== undefined && !(Array.isArray(b.keep) && b.keep.length === 4 && b.keep.every(num))) out.push(`${n}: keep must be [west, south, east, north]`);
    } else out.push(`${n}: unknown beat "${(b as {do?: unknown}).do}" (use highlight, pulse, label, link, card, icon, year, tint, arrow, stamp, march, measure or move)`);
    if (b.offSfx !== undefined && typeof b.offSfx !== 'string') out.push(`${n}: offSfx must be a sound kind`);
    if (b.offSfx !== undefined && b.off === undefined) out.push(`${n}: offSfx needs an "off" word`);
    const place = (b as {place?: unknown}).place;
    if (place !== undefined && !SLOTS.includes(place as Slot)) out.push(`${n}: place must be one of ${SLOTS.join(', ')}`);
  });
  if (d.palette !== undefined && !(d.palette in GL_PALETTES)) out.push(`palette must be one of ${Object.keys(GL_PALETTES).join(', ')} (got ${JSON.stringify(d.palette)})`);
  (d.routes ?? []).forEach((r, i) => {
    if (!Array.isArray(r.via) || r.via.length < 2) out.push(`route ${i + 1}: via needs at least two [lon, lat] points`);
    if (r.color !== undefined && !['gold', 'white', 'red'].includes(r.color)) out.push(`route ${i + 1}: color must be gold, white or red`);
    if (r.style !== undefined && r.style !== 'solid' && r.style !== 'dashed') out.push(`route ${i + 1}: style must be solid or dashed`);
  });
  (d.vessels ?? []).forEach((v, i) => {
    if (!d.routes?.[v.route ?? 0]) out.push(`vessels ${i + 1}: route ${v.route ?? 0} does not exist (routes are numbered from 0)`);
    if (v.seconds !== undefined && (!num(v.seconds) || v.seconds <= 0)) out.push(`vessels ${i + 1}: seconds must be a positive number`);
  });
  (d.labels ?? []).forEach((l, i) => {
    if (l.kind !== undefined && !['land', 'water', 'place'].includes(l.kind)) out.push(`label ${i + 1}: kind must be land, water or place`);
  });
  if (d.vignette !== undefined && (!num(d.vignette) || d.vignette < 0 || d.vignette > 1)) out.push('vignette must be a number from 0 to 1');
  if (d.terrain !== undefined) {
    if (typeof d.terrain !== 'object' || d.terrain === null) out.push('terrain must be an object, e.g. {"relief": 0.6}');
    else {
      for (const k of Object.keys(d.terrain)) if (!TERRAIN_FIELDS.includes(k)) out.push(`unknown terrain field "${k}" (use ${TERRAIN_FIELDS.join(', ')})`);
      if (d.terrain.relief !== undefined && (!num(d.terrain.relief) || d.terrain.relief < 0 || d.terrain.relief > 1)) out.push('terrain.relief must be a number from 0 to 1');
      for (const k of ['tint', 'depth'] as const) if (d.terrain[k] !== undefined && typeof d.terrain[k] !== 'boolean') out.push(`terrain.${k} must be true or false`);
    }
  }
  return out;
}

function regionsFor(ctx: LayoutContext): Record<string, Region> {
  return {map: {role: 'media', x: 0, y: 0, w: ctx.W, h: ctx.H}, text: {role: 'overlay', ...ctx.safe}};
}

/** Land features that overlap a lon/lat box: keeps MapLibre's data small (Natural Earth 10m is the whole world). */
function landIn(fc: FC, box: [number, number, number, number]): FC {
  const [w, s, e, n] = box;
  const hits = (g: Geometry | null): boolean => {
    if (!g) return false;
    const rings: Position[][] = g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : [];
    return rings.some((r) => r.some(([x, y]) => x >= w && x <= e && y >= s && y <= n));
  };
  return {...fc, features: fc.features.filter((f) => hits(f.geometry))};
}

const wrap180 = (v: number) => ((((v + 180) % 360) + 360) % 360) - 180;

const usesLegs = (d: GlMapData) => d.camera.some((k) => k.move !== undefined);

/** Push-in rate in zoom levels per second (kinetic projects drift by default). */
export const driftOf = (d: GlMapData, style?: string) => d.drift ?? (style === 'kinetic' ? 0.02 : 0);

/**
 * Imagery tiles for a scene in a W×H frame lasting `seconds`. Shared with the Node scripts so the
 * downloaded tiles are exactly the ones MapLibre will ask for.
 */
export const imageryFor = (d: GlMapData, W: number, H: number, seconds: number, style?: string) =>
  imageryPlan(d.camera, W, H, 0.1 + driftOf(d, style) * seconds);

/** Elevation tiles for a scene with `terrain`, likewise. */
export const terrainFor = (d: GlMapData, W: number, H: number, seconds: number, style?: string) =>
  terrainPlan(d.camera, W, H, 0.1 + driftOf(d, style) * seconds);

/**
 * MapLibre needs rings that cross the 180° meridian (Russia's Chukotka, Fiji)
 * written as one continuous run of longitudes; otherwise the edge that jumps
 * from +180 to -180 is drawn as a band across the whole world.
 */
function unwrapAntimeridian(fc: FC): FC {
  const fixRing = (r: Position[]) => (r.some((p, i) => i > 0 && Math.abs(p[0] - r[i - 1][0]) > 180) ? r.map(([x, y]) => [x < 0 ? x + 360 : x, y]) : r);
  const fix = (g: Geometry | null): Geometry | null =>
    !g ? g : g.type === 'Polygon' ? {...g, coordinates: g.coordinates.map(fixRing)} : g.type === 'MultiPolygon' ? {...g, coordinates: g.coordinates.map((p) => p.map(fixRing))} : g;
  return {...fc, features: fc.features.map((f) => ({...f, geometry: fix(f.geometry) as Geometry}))};
}

/**
 * Country (Natural Earth name) first, then province/state. Parts of a country
 * that lie in a disputed area (e.g. Crimea in Natural Earth's Russia) are left
 * out, so a highlight never takes a side in a territorial dispute.
 */
function findShape(name: string, countries: FC, admin1: FC | null, disputed: FC | null, lakes: FC | null = null): FC | null {
  const hit = countries.features.find((f) => f.properties.name === name) ?? admin1?.features.find((f) => f.properties.name === name) ?? lakes?.features.find((f) => f.properties.name === name);
  if (!hit) return null;
  let geometry = hit.geometry;
  if (geometry?.type === 'MultiPolygon' && disputed) {
    const keep = geometry.coordinates.filter((part) => {
      const c = geoCentroid({type: 'Polygon', coordinates: part});
      return !disputed.features.some((d) => geoContains(d as Feature, c));
    });
    geometry = {...geometry, coordinates: keep};
  }
  return unwrapAntimeridian({type: 'FeatureCollection', features: [{...hit, geometry}]});
}

/**
 * A shape's polygons with a lon/lat box each, rings thinned to points at least `tol` degrees apart
 * (projecting every 1:10m vertex each frame would be slow and far finer than a pixel).
 */
function flagPolygons(fc: FC, tol: number): {box: [number, number, number, number]; rings: Position[][]}[] {
  const thin = (r: Position[]) => {
    const out: Position[] = [r[0]];
    for (const p of r.slice(1)) {
      const q = out[out.length - 1];
      if (Math.abs(p[0] - q[0]) > tol || Math.abs(p[1] - q[1]) > tol) out.push(p);
    }
    return out;
  };
  return fc.features.flatMap((f) => {
    const g = f.geometry;
    const polys = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : [];
    return polys
      .map((rings) => rings.map(thin).filter((r) => r.length >= 3))
      .filter((rings) => rings.length > 0)
      .map((rings) => {
        const xs = rings[0].map((p) => p[0]);
        const ys = rings[0].map((p) => p[1]);
        return {box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] as [number, number, number, number], rings};
      });
  });
}

type Vec = [number, number, number];
const RAD = Math.PI / 180;
const toVec = ([lon, lat]: Position): Vec => [Math.cos(lat * RAD) * Math.cos(lon * RAD), Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD)];
const fromVec = ([x, y, z]: Vec): Position => [Math.atan2(y, x) / RAD, Math.asin(Math.max(-1, Math.min(1, z))) / RAD];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** Rodrigues: `v` turned by `angle` (radians, anticlockwise seen from outside) about the unit axis `k`. */
const turnAbout = (v: Vec, k: Vec, angle: number): Vec => {
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  const kv = cross(k, v);
  const f = dot(k, v) * (1 - c);
  return [v[0] * c + kv[0] * s + k[0] * f, v[1] * c + kv[1] * s + k[1] * f, v[2] * c + kv[2] * s + k[2] * f];
};

/**
 * A move beat's rings `t` (0–1) of the way from where they are to `to`: the whole shape is turned on the sphere along
 * the great circle that carries its centre there (so it keeps its true size), turned back about its centre so its own
 * north still points north (a long great-circle trip tips it over: the USA arrived on its side, 2026-10-23), then
 * `turn` degrees clockwise. Each ring is unwrapped so it never jumps across the antimeridian.
 */
function movedRings(rings: Position[][], centre: Position, to: LonLat, t: number, turn: number): Position[][] {
  const [c, target] = [toVec(centre), toVec(to)];
  const axis = cross(c, target);
  const len = Math.hypot(...axis);
  const travel = Math.acos(Math.max(-1, Math.min(1, dot(c, target)))) * t;
  const k: Vec = len > 1e-9 ? [axis[0] / len, axis[1] / len, axis[2] / len] : [0, 0, 1];
  const mid = len > 1e-9 ? turnAbout(c, k, travel) : c;
  // Local north at a point on the sphere; the carried-along north is turned onto the new centre's north.
  const north = ([x, y, z]: Vec): Vec => {
    const h = Math.hypot(x, y) || 1e-9;
    return [(-z * x) / h, (-z * y) / h, h];
  };
  const carried = len > 1e-9 ? turnAbout(north(c), k, travel) : north(c);
  const upright = Math.atan2(dot(mid, cross(carried, north(mid))), dot(carried, north(mid)));
  const spin = upright - turn * RAD * t;
  return rings.map((ring) => {
    let prev: number | null = null;
    return ring.map((q) => {
      const v = turnAbout(len > 1e-9 ? turnAbout(toVec(q), k, travel) : toVec(q), mid, spin);
      let [lon, lat] = fromVec(v);
      if (prev !== null) lon += Math.round((prev - lon) / 360) * 360;
      prev = lon;
      return [lon, lat];
    });
  });
}

/** River lines (Natural Earth names) chained into drawing order, starting from the end nearest `from`. */
function riverChain(rivers: FC, names: string[], from: LonLat): Position[][] {
  const left: Position[][] = rivers.features
    .filter((f) => names.includes(f.properties.name ?? ''))
    .flatMap((f) => (f.geometry?.type === 'LineString' ? [f.geometry.coordinates] : f.geometry?.type === 'MultiLineString' ? f.geometry.coordinates : []));
  if (!left.length) throw new Error(`glmap river: no Natural Earth river named ${names.join(' / ')}`);
  const out: Position[][] = [];
  let cur: Position = from;
  const d2 = (a: Position, b: Position) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
  while (left.length) {
    let best = 0;
    let rev = false;
    let bd = Infinity;
    left.forEach((l, k) => {
      const [a, b] = [d2(l[0], cur), d2(l[l.length - 1], cur)];
      if (a < bd) [bd, best, rev] = [a, k, false];
      if (b < bd) [bd, best, rev] = [b, k, true];
    });
    const l = left.splice(best, 1)[0];
    const o = rev ? [...l].reverse() : l;
    out.push(o);
    cur = o[o.length - 1];
  }
  return out;
}

const GlMapView: React.FC<SceneProps<GlMapData>> = ({scene, durationInFrames}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const ctx = useLayout();
  const theme = useTheme();
  const guides = useShowGuides();
  const cueAt = useCue(scene);
  const {project: config, assets} = useProps();
  const d = scene.data;
  const beats = d.beats ?? [];
  const drift = driftOf(d, config.style) / fps;
  const {W, H, unit} = ctx;
  const P = GL_PALETTES[d.palette ?? 'teal'];
  const at = (v: At | undefined, fallback = 0) => (v === undefined ? fallback : typeof v === 'number' ? Math.round(v * fps) : cueAt(v, fallback));
  // A beat `on: 0` started long before this scene (it continues from the previous one), so its entrance is over.
  const onAt = (v: At) => (v === 0 ? -10 * fps : at(v, 0));
  const flagOf = (f: string) => {
    if (!f.startsWith('asset:')) return {src: flagUrl(f, '4x3'), ratio: 4 / 3};
    const meta = assets[f.slice(6)];
    if (!meta) throw new Error(`glmap flag: unknown asset "${f}"`);
    const o = meta.original ?? {width: 3, height: 2};
    return {src: staticFile(meta.path), ratio: o.width / o.height};
  };

  // ---- camera: one smooth path per component; longitude and bearing take the shortest way round
  const path = useMemo(() => {
    const keys = d.camera.map((k, i, all) => ({...k, f: at(k.at, Math.round((i / Math.max(1, all.length - 1)) * durationInFrames))}));
    const f = keys.map((k) => k.f);
    const unwrap = (vals: number[]) => {
      let u = vals[0];
      return vals.map((v, i) => (i === 0 ? u : (u += lonDelta(vals[i - 1], v))));
    };
    if (usesLegs(d)) {
      // Kinetic: each key after the first is a move that starts on its word.
      const legs: CameraLeg[] = keys.slice(1).map((k) => ({start: k.f, frames: Math.max(1, Math.round((k.move ?? 1) * fps)), ease: k.ease ?? 'snap'}));
      const zoom = legsPath(legs, keys.map((k) => k.zoom));
      const push = legsDrift(legs, drift);
      return {
        lon: legsPath(legs, unwrap(keys.map((k) => k.lon))),
        lat: legsPath(legs, keys.map((k) => k.lat)),
        zoom: (t: number) => zoom(t) + push(t),
        pitch: legsPath(legs, keys.map((k) => k.pitch ?? 0)),
        bearing: legsPath(legs, unwrap(keys.map((k) => k.bearing ?? 0))),
      };
    }
    const last = Math.max(...f);
    const zoom = smoothPath(f, keys.map((k) => k.zoom));
    return {
      lon: smoothPath(f, unwrap(keys.map((k) => k.lon))),
      lat: smoothPath(f, keys.map((k) => k.lat)),
      // Drift (if any) starts once the last key is reached.
      zoom: (t: number) => zoom(t) + drift * Math.max(0, t - last),
      pitch: smoothPath(f, keys.map((k) => k.pitch ?? 0)),
      bearing: smoothPath(f, unwrap(keys.map((k) => k.bearing ?? 0))),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.camera, durationInFrames, drift]);
  const cam = {lon: wrap180(path.lon(frame)), lat: path.lat(frame), zoom: path.zoom(frame), pitch: path.pitch(frame), bearing: path.bearing(frame)};

  // ---- base map: land near everything the scene shows
  const world = useGeoLayer('countries-10m');
  const highlightBeats = beats.filter((b): b is Extract<GlBeat, {do: 'highlight'}> => b.do === 'highlight');
  const admin1 = useGeoLayer(highlightBeats.length ? 'admin1' : null);
  const disputed = useGeoLayer(highlightBeats.length ? 'disputed' : null);
  const lakes = useGeoLayer(highlightBeats.length ? 'lakes' : null);
  const riverBeats = beats.filter((b) => b.do === 'river');
  const riversLayer = useGeoLayer(riverBeats.length ? 'rivers' : null);
  const shapes = useMemo(() => {
    if (!world || (highlightBeats.length && (!admin1 || !disputed || !lakes))) return null;
    return highlightBeats.map((b) => {
      const shape = findShape(b.name, world, admin1, disputed, lakes);
      if (!shape) throw new Error(`glmap highlight "${b.name}": no country, province or lake with that Natural Earth name`);
      return shape;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, admin1, disputed, lakes, d.beats]);
  // Lakes cut out of a flag (`holes`), as SVG paths in lon/lat, per highlight.
  const holeRings = useMemo(
    () => highlightBeats.map((b) => (b.holes ?? []).flatMap((h) => {
      const shape = lakes ? findShape(h, {type: 'FeatureCollection', features: []} as unknown as FC, null, null, lakes) : null;
      if (lakes && !shape) throw new Error(`glmap highlight "${b.name}": no lake named "${h}" for holes`);
      return shape ? flagPolygons(shape, 0) : [];
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lakes, d.beats],
  );
  const riverLines = useMemo(
    () => beats.map((b) => (b.do === 'river' && riversLayer ? riverChain(riversLayer, b.rivers, b.from) : null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [riversLayer, d.beats],
  );
  // Flag fills are drawn in SVG over the map; outlines thinned to about half a pixel at the closest camera key.
  const flagRings = useMemo(() => {
    if (!shapes) return [];
    const tol = 360 / (512 * 2 ** Math.max(...d.camera.map((k) => k.zoom))) / 2;
    return highlightBeats.map((b, i) => (b.flag ? flagPolygons(shapes[i], tol) : []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shapes, d.camera]);
  // Move beats: each shape's rings (thinned like flags) and the centre that travels to `to`.
  const moveShapes = useMemo(() => {
    if (!world) return [];
    const tol = 360 / (512 * 2 ** Math.max(...d.camera.map((k) => k.zoom))) / 2;
    return beats.map((b) => {
      if (b.do !== 'move') return null;
      const shape = findShape(b.name, world, null, null);
      if (!shape) throw new Error(`glmap move "${b.name}": no country with that Natural Earth name`);
      const g = shape.features[0].geometry;
      let polys = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : [];
      if (b.keep) {
        const [w, s, e, n] = b.keep;
        polys = polys.filter((part) => {
          const [lon, lat] = geoCentroid({type: 'Polygon', coordinates: part});
          return lon >= w && lon <= e && lat >= s && lat <= n;
        });
      }
      const kept = {type: 'FeatureCollection', features: [{...shape.features[0], geometry: {type: 'MultiPolygon', coordinates: polys}}]} as FC;
      return {rings: flagPolygons(kept, tol).flatMap((p) => p.rings), centre: geoCentroid(kept as unknown as Feature) as Position};
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, d.beats, d.camera]);
  usePreloadImages([...highlightBeats.filter((b) => b.flag).map((b) => flagOf(b.flag!).src), ...beats.flatMap((b) => (b.do === 'move' && b.flag ? [flagOf(b.flag).src] : []))]);
  const style = useMemo(() => {
    if (!world || !shapes || (riverBeats.length && !riversLayer)) return null;
    const pts: LonLat[] = [...d.camera.map((k) => [k.lon, k.lat] as LonLat), ...(d.routes ?? []).flatMap((r) => r.via), ...(d.labels ?? []).map((l) => [l.lon, l.lat] as LonLat)];
    const lons = pts.map((p) => p[0]);
    const lats = pts.map((p) => p[1]);
    // 25° around a regional view; a zoomed-out (world) view needs land much further out.
    const pad = Math.max(25, 400 / 2 ** Math.min(...d.camera.map((k) => k.zoom)));
    const t = d.terrain;
    const terrain = t
      ? {tiles: `${new URL(staticFile('geo/terrain'), window.location.href).href}/{z}/{x}/{y}.png`, bounds: terrainFor(d, W, H, durationInFrames / fps, config.style).bounds, relief: t.relief ?? 0.6, tint: t.tint ?? true, depth: t.depth ?? true}
      : undefined;
    const highlights = highlightBeats.map((b, i) => ({shape: shapes[i], color: P[b.color ?? 'red']}));
    const g = typeof d.imagery === 'object' ? d.imagery : {};
    const plan = d.imagery ? imageryFor(d, W, H, durationInFrames / fps, config.style) : null;
    const imagery = plan
      ? {
          tiles: `${new URL(staticFile('geo/imagery'), window.location.href).href}/{z}/{x}/{y}.jpg`,
          bounds: plan.bounds,
          minzoom: plan.minzoom,
          maxzoom: plan.maxzoom,
          saturation: g.saturation ?? 0.2,
          contrast: g.contrast ?? 0.12,
          brightness: g.brightness ?? 0.04,
        }
      : undefined;
    return glStyle(unwrapAntimeridian(landIn(world, [Math.min(...lons) - pad, Math.min(...lats) - pad, Math.max(...lons) + pad, Math.max(...lats) + pad])), P, terrain, highlights, imagery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, shapes, d.palette, d.terrain, d.beats, d.imagery]);

  // ---- highlights: fill, outline and glow animated per frame on their beats
  const paint: GlPaint[] = highlightBeats.flatMap((b, i) => {
    const on = onAt(b.on);
    const out = b.off !== undefined ? exit(frame, at(b.off, durationInFrames), 8) : 1;
    const ramp = Math.min(1, Math.max(0, (frame - on + 1) / 4)) * out;
    // A pulse re-fires the glow; the strongest of the highlight's pulses wins.
    const pulses = beats.filter((p) => p.do === 'pulse' && p.name === b.name).map((p) => at(p.on, 0));
    const g = Math.max(glowPulse(frame, on, fps), ...pulses.map((p) => glowPulse(frame, p, fps))) * out;
    const id = highlightLayers(i);
    const r = (v: number) => Math.round(v * 1000) / 1000;
    return [
      // A flag highlight is filled in SVG (the flag); MapLibre keeps its glow.
      [id.fill, 'fill-opacity', b.flag ? 0 : r(ramp * (0.32 + 0.3 * g))],
      [id.line, 'line-opacity', r(ramp)],
      [id.line, 'line-width', r(2.2 * unit)],
      [id.glow, 'line-opacity', r(0.85 * g)],
      [id.glow, 'line-width', r(unit * (8 + 34 * g))],
      [id.glow, 'line-blur', r(unit * (6 + 26 * g))],
    ] as GlPaint[];
  });
  // ---- tint: each tint beat blends from the current grade to its tone; modern borders disappear under the old-map warmth
  const tints = beats.filter((b): b is Extract<GlBeat, {do: 'tint'}> => b.do === 'tint').map((b) => ({on: onAt(b.on), tone: b.tone})).sort((a, b) => a.on - b.on);
  let tone = {warm: 0, cold: 0};
  for (const t of tints) {
    const k = progress(frame, t.on, TINT_FRAMES, EASE_IN_OUT);
    if (k <= 0) break;
    tone = {warm: tone.warm + ((t.tone === 'warm' ? 1 : 0) - tone.warm) * k, cold: tone.cold + ((t.tone === 'cold' ? 1 : 0) - tone.cold) * k};
  }
  if (tints.length) paint.push(['coast', 'line-opacity', Math.round((1 - tone.warm) * 1000) / 1000]);
  const {ref, map} = useGlMap(style, cam, paint);
  const project = (p: LonLat): [number, number] => {
    const q = map!.project(p);
    return [q.x, q.y];
  };

  const sampled = useMemo(() => (d.routes ?? []).map((r) => sampleRoute(r.via)), [d.routes]);
  const drawn = (d.routes ?? []).map((r) => progress(frame, at(r.at, 0), Math.max(1, Math.round((r.duration ?? 3) * fps)), EASE_IN_OUT));
  const font = (kind: 'land' | 'water' | 'place') =>
    kind === 'water'
      ? {fontFamily: '"Source Serif 4", Georgia, serif', fontStyle: 'italic', fontSize: Math.round(ctx.type.label * 1.2), fontWeight: 500, letterSpacing: '0.04em', fill: P.water}
      : kind === 'land'
        ? {fontFamily: theme.fonts.body, fontSize: Math.round(ctx.type.label * 1.0), fontWeight: 600, letterSpacing: '0.32em', fill: P.ink, fillOpacity: 0.8}
        : {fontFamily: theme.fonts.body, fontSize: Math.round(ctx.type.label * 1.05), fontWeight: 600, fill: P.ink};

  return (
    <AbsoluteFill style={{background: P.sea}}>
      <div ref={ref} style={{position: 'absolute', left: 0, top: 0, width: W, height: H, overflow: 'hidden', filter: toneFilter(tone.warm, tone.cold)}} />
      {map ? (
        <svg width={W} height={H} style={{position: 'absolute', left: 0, top: 0}}>
          {/* Bigger shapes first, so a smaller one inside (Kaliningrad in Natural Earth's Russia) keeps its own flag on top. */}
          {highlightBeats
            .map((b, i) => ({b, i, size: flagRings[i]?.reduce((t, p) => t + (p.box[2] - p.box[0]) * (p.box[3] - p.box[1]), 0) ?? 0}))
            .sort((x, y) => y.size - x.size)
            .map(({b, i}) => {
              if (!b.flag) return null;
              const on = onAt(b.on);
              const offF = b.off !== undefined ? at(b.off, durationInFrames) : undefined;
              // A falling flag drops and tips over on its way out instead of fading in place.
              const fall = b.exit === 'fall' && offF !== undefined ? Math.min(1, Math.max(0, (frame - offF) / 14)) ** 2 : 0;
              const out = offF === undefined ? 1 : b.exit === 'fall' ? 1 - fall : exit(frame, offF, 8);
              const ramp = Math.min(1, Math.max(0, (frame - on + 1) / 4)) * out;
              if (ramp <= 0) return null;
              // Only the parts near the frame are projected (Russia's 1:10m outline is huge).
              const view = map.getBounds();
              const pad = 2;
              const parts = flagRings[i].filter((p) => p.box[0] < view.getEast() + pad && p.box[2] > view.getWest() - pad && p.box[1] < view.getNorth() + pad && p.box[3] > view.getSouth() - pad);
              if (!parts.length) return null;
              let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
              const dd = parts
                .flatMap((p) =>
                  p.rings.map((ring) => {
                    const pts = ring.map((q) => project(q as LonLat));
                    for (const [x, y] of pts) [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
                    return `M${pts.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join('L')}Z`;
                  }),
                )
                .join('');
              // Fit the flag to the part of the country on screen, covering it at the flag's own ratio.
              [x0, y0, x1, y1] = [Math.max(x0, 0), Math.max(y0, 0), Math.min(x1, W), Math.min(y1, H)];
              if (x1 <= x0 || y1 <= y0) return null;
              // The flag settles into the border as it appears.
              const flag = flagOf(b.flag);
              const settle = 1 + 0.12 * (1 - pop(frame, on, fps));
              const fh = (b.flagFit === 'stretch' ? y1 - y0 : Math.max((x1 - x0) / flag.ratio, y1 - y0)) * settle;
              const fw = (b.flagFit === 'stretch' ? x1 - x0 : fh * flag.ratio) * (b.flagFit === 'stretch' ? settle : 1);
              const id = `flag-${scene.id}-${i}`;
              const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
              const holes = (holeRings[i] ?? []).flatMap((h) => h.rings.map((ring) => `M${ring.map((q) => project(q as LonLat).map((v) => v.toFixed(1)).join(',')).join('L')}Z`)).join('');
              return (
                <g key={id} opacity={ramp} transform={fall > 0 ? `translate(0,${(fall * 0.3 * H).toFixed(1)}) rotate(${(fall * 12).toFixed(2)},${cx.toFixed(1)},${cy.toFixed(1)})` : undefined}>
                  <clipPath id={id}>
                    <path d={dd} fillRule="evenodd" />
                  </clipPath>
                  {holes ? (
                    <mask id={`${id}-holes`} maskUnits="userSpaceOnUse" x={0} y={0} width={W} height={H}>
                      <rect width={W} height={H} fill="#ffffff" />
                      <path d={holes} fill="#000000" />
                    </mask>
                  ) : null}
                  <image href={flag.src} x={cx - fw / 2} y={cy - fh / 2} width={fw} height={fh} preserveAspectRatio="none" clipPath={`url(#${id})`} mask={holes ? `url(#${id}-holes)` : undefined} opacity={0.92} />
                  <path d={dd} fill="none" stroke="#ffffff" strokeWidth={2.2 * unit} strokeLinejoin="round" />
                </g>
              );
            })}
          {/* Moved countries: true-size outlines sliding across the sphere, on top of the flags. */}
          {beats.map((b, i) => {
            if (b.do !== 'move' || !moveShapes[i]) return null;
            const on = onAt(b.on);
            if (frame < on) return null;
            const out = b.off !== undefined ? exit(frame, at(b.off, durationInFrames), 8) : 1;
            if (out <= 0) return null;
            // Pops up where it really is, then travels.
            const t = progress(frame, on + Math.round(0.3 * fps), Math.max(1, Math.round((b.duration ?? 1.6) * fps)), EASE_IN_OUT);
            const {rings, centre} = moveShapes[i]!;
            let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
            const dd = movedRings(rings, centre, b.to, t, b.turn ?? 0)
              .map((ring) => {
                const pts = ring.map((q) => project(q as LonLat));
                for (const [x, y] of pts) [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
                return `M${pts.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join('L')}Z`;
              })
              .join('');
            const id = `move-${scene.id}-${i}`;
            const scale = 0.6 + 0.4 * pop(frame, on, fps);
            const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
            const flag = b.flag ? flagOf(b.flag) : null;
            const fh = flag ? Math.max((x1 - x0) / flag.ratio, y1 - y0) : 0;
            return (
              <g key={id} opacity={Math.min(1, (frame - on + 1) / 4) * out} transform={`translate(${cx.toFixed(1)},${cy.toFixed(1)}) scale(${scale.toFixed(4)}) translate(${(-cx).toFixed(1)},${(-cy).toFixed(1)})`}>
                <path d={dd} fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth={7 * unit} strokeLinejoin="round" />
                {flag ? (
                  <>
                    <clipPath id={id}>
                      <path d={dd} fillRule="evenodd" />
                    </clipPath>
                    <image href={flag.src} x={cx - (fh * flag.ratio) / 2} y={cy - fh / 2} width={fh * flag.ratio} height={fh} preserveAspectRatio="none" clipPath={`url(#${id})`} opacity={0.94} />
                  </>
                ) : (
                  <path d={dd} fill={P[b.color ?? 'gold']} fillOpacity={0.75} fillRule="evenodd" />
                )}
                <path d={dd} fill="none" stroke="#ffffff" strokeWidth={2.2 * unit} strokeLinejoin="round" />
              </g>
            );
          })}
          {/* Rivers draw themselves from their source; a pulse widens their glow. */}
          {beats.map((b, i) => {
            if (b.do !== 'river') return null;
            const on = onAt(b.on);
            const len = Math.max(1, Math.round((b.duration ?? 1.6) * fps));
            const drawnTo = progress(frame, on, len, EASE_IN_OUT);
            const out = b.off !== undefined ? exit(frame, at(b.off, durationInFrames), 8) : 1;
            if (drawnTo <= 0 || out <= 0) return null;
            const pulses = beats.filter((p) => p.do === 'pulse' && p.name === b.name).map((p) => onAt(p.on));
            const g = Math.max(0.35, ...pulses.map((p) => glowPulse(frame, p, fps, 0.35)));
            // The drawn share is measured along the river in lon/lat, so it does not depend on the camera. Only points
            // near the view are projected: a tilted camera projects far-off points (behind it) to wild screen positions,
            // which drew straight lines across the frame (Nile, 2026-10-20).
            const view = map.getBounds();
            const pad = 1.5;
            const near = (q: Position) => q[0] > view.getWest() - pad && q[0] < view.getEast() + pad && q[1] > view.getSouth() - pad && q[1] < view.getNorth() + pad;
            const chain = riverLines[i] ?? [];
            const length = (l: Position[]) => l.reduce((t, q, k) => (k ? t + Math.hypot(q[0] - l[k - 1][0], q[1] - l[k - 1][1]) : 0), 0);
            let left = chain.reduce((t, l) => t + length(l), 0) * drawnTo;
            const parts: string[] = [];
            for (const l of chain) {
              if (left <= 0) break;
              let run: Position[] = [];
              const flush = () => {
                if (run.length > 1) parts.push(`M${run.map((q) => project(q as LonLat).map((v) => v.toFixed(1)).join(',')).join('L')}`);
                run = [];
              };
              if (near(l[0])) run.push(l[0]);
              for (let k = 1; k < l.length && left > 0; k++) {
                const seg = Math.hypot(l[k][0] - l[k - 1][0], l[k][1] - l[k - 1][1]);
                const f = Math.min(1, left / Math.max(seg, 1e-9));
                const q: Position = [l[k - 1][0] + (l[k][0] - l[k - 1][0]) * f, l[k - 1][1] + (l[k][1] - l[k - 1][1]) * f];
                left -= seg;
                if (near(q)) {
                  if (!run.length) run.push(l[k - 1]);
                  run.push(q);
                } else flush();
              }
              flush();
            }
            const dd = parts.join('');
            const color = P[b.color ?? 'blue'];
            const w = (b.width ?? 1) * unit;
            return (
              <g key={`river-${i}`} opacity={out} fill="none" strokeLinecap="round" strokeLinejoin="round">
                {/* Glow as two soft wide strokes: a CSS blur on a long path over the map canvas stalled MapLibre's drawing. */}
                <path d={dd} stroke={color} strokeOpacity={0.18 * g} strokeWidth={w * (10 + 18 * g)} />
                <path d={dd} stroke={color} strokeOpacity={0.3 * g} strokeWidth={w * (6 + 8 * g)} />
                <path d={dd} stroke={P.halo} strokeWidth={w * 6.5} />
                <path d={dd} stroke={color} strokeWidth={w * 3.6} />
              </g>
            );
          })}
          {(d.routes ?? []).map((r, i) => {
            if (drawn[i] <= 0) return null;
            const pts = routeUpTo(sampled[i], drawn[i]).map(project);
            const line = `M${pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L')}`;
            const color = P[r.color ?? 'gold'];
            const tip = pts[pts.length - 1];
            return (
              <g key={i}>
                <path d={line} fill="none" stroke={P.halo} strokeWidth={7 * unit} strokeLinecap="round" strokeLinejoin="round" />
                <path d={line} fill="none" stroke={color} strokeWidth={3 * unit} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={r.style === 'dashed' ? `${10 * unit} ${9 * unit}` : undefined} />
                {drawn[i] < 1 ? <circle cx={tip[0]} cy={tip[1]} r={5 * unit} fill={color} stroke={P.halo} strokeWidth={2 * unit} /> : null}
              </g>
            );
          })}
          {(d.vessels ?? []).flatMap((v, vi) => {
            const ri = v.route ?? 0;
            const route = sampled[ri];
            if (!route) return [];
            const n = Math.max(1, Math.round(v.count ?? 3));
            const appear = progress(frame, at(v.at, 0), 15);
            const t = frame / fps / (v.seconds ?? 40);
            return Array.from({length: n}, (_, k) => {
              const phase = (((k / n + t) % 1) + 1) % 1;
              const s = v.reverse ? 1 - phase : phase;
              // Fade in and out at the route ends, and only sail on the part already drawn.
              const edge = Math.min(1, phase / 0.05, (1 - phase) / 0.05);
              const onDrawn = Math.min(1, Math.max(0, (drawn[ri] - s) / 0.02));
              const opacity = appear * edge * onDrawn;
              if (opacity <= 0) return null;
              const off = (v.offset ?? 0) * unit;
              // Screen position of route fraction t, shifted `off` px to the ship's starboard side.
              const lane = (t: number): [number, number, number] => {
                const [x, y] = project(routePoint(route, t));
                const [ax, ay] = project(routePoint(route, t + (v.reverse ? -0.004 : 0.004)));
                const ang = Math.atan2(ay - y, ax - x);
                return [x - Math.sin(ang) * off, y + Math.cos(ang) * off, ang];
              };
              const [px, py, ang] = lane(s);
              // The wake follows the route behind the ship (about 18 km), so it bends with the lane instead of cutting across coasts.
              const back = Math.min(0.05, 18 / (route.total * 6371));
              const wake = [0, 1, 2, 3, 4, 5, 6].map((j) => lane(Math.min(1, Math.max(0, s + (v.reverse ? 1 : -1) * back * (j / 6)))));
              const sc = 1.2 * unit;
              return (
                <g key={`${vi}-${k}`} opacity={opacity}>
                  <path d={`M${wake.map((w) => `${w[0].toFixed(1)},${w[1].toFixed(1)}`).join('L')}`} fill="none" stroke={P.ship} strokeOpacity={0.35} strokeWidth={2.2 * sc} strokeLinecap="round" strokeLinejoin="round" />
                  {/* hull pointing along the heading */}
                  <path transform={`translate(${px.toFixed(1)},${py.toFixed(1)}) rotate(${((ang * 180) / Math.PI).toFixed(2)})`} d={`M${10 * sc},0 L${3 * sc},${-3.4 * sc} L${-8 * sc},${-3.4 * sc} L${-8 * sc},${3.4 * sc} L${3 * sc},${3.4 * sc} Z`} fill={P.ship} stroke={P.halo} strokeWidth={1.2 * sc} strokeLinejoin="round" />
                </g>
              );
            });
          })}
          {(d.labels ?? []).map((l, i) => {
            const kind = l.kind ?? 'place';
            const p = progress(frame, at(l.at, 0), 18) * (l.until !== undefined ? 1 - progress(frame, at(l.until, durationInFrames), 12) : 1);
            if (p <= 0) return null;
            const [x, y] = project([l.lon, l.lat]);
            let rot = 0;
            if (l.toward) {
              const [tx, ty] = project(l.toward);
              rot = (Math.atan2(ty - y, tx - x) * 180) / Math.PI;
              if (rot > 90) rot -= 180;
              if (rot < -90) rot += 180;
            }
            const halo = {paintOrder: 'stroke' as const, stroke: P.halo, strokeWidth: 4 * unit, strokeLinejoin: 'round' as const};
            return (
              <g key={i} opacity={p} transform={`translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${rot.toFixed(2)})`}>
                {kind === 'place' ? <circle r={5.5 * unit} fill={P.ink} stroke={P.halo} strokeWidth={2.5 * unit} /> : null}
                <text x={kind === 'place' ? 14 * unit : 0} y={0} textAnchor={kind === 'place' ? 'start' : 'middle'} dominantBaseline="middle" style={{...font(kind), ...halo}}>
                  {kind === 'land' ? l.text.toUpperCase() : l.text}
                </text>
              </g>
            );
          })}
          {beats.map((b, i) => {
            if (b.do !== 'link') return null;
            const on = onAt(b.on);
            const len = Math.max(1, Math.round((b.duration ?? 0.6) * fps));
            const drawnTo = progress(frame, on, len, EASE_IN_OUT);
            const out = b.off !== undefined ? exit(frame, at(b.off, durationInFrames), 8) : 1;
            if (drawnTo <= 0 || out <= 0) return null;
            const pts = routeUpTo(sampleRoute([b.from, b.to]), drawnTo).map(project);
            const line = `M${pts.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join('L')}`;
            const color = P[b.color ?? 'white'];
            const [mx, my] = project(routePoint(sampleRoute([b.from, b.to]), 0.5));
            const x = b.cross ? pop(frame, on + len, fps) : 0;
            const xr = 15 * unit;
            return (
              <g key={`link-${i}`} opacity={out}>
                <path d={line} fill="none" stroke={P.halo} strokeWidth={8 * unit} strokeLinecap="round" />
                <path d={line} fill="none" stroke={color} strokeWidth={4 * unit} strokeLinecap="round" strokeDasharray={`${14 * unit} ${11 * unit}`} />
                {x > 0 ? (
                  <g transform={`translate(${mx.toFixed(1)},${my.toFixed(1)}) scale(${x.toFixed(3)})`}>
                    <circle r={xr * 1.5} fill={P.red} stroke="#ffffff" strokeWidth={3 * unit} />
                    <path d={`M${-xr * 0.6},${-xr * 0.6}L${xr * 0.6},${xr * 0.6}M${xr * 0.6},${-xr * 0.6}L${-xr * 0.6},${xr * 0.6}`} stroke="#ffffff" strokeWidth={5 * unit} strokeLinecap="round" />
                  </g>
                ) : null}
              </g>
            );
          })}
          {beats.map((b, i) => {
            if (b.do !== 'arrow' && b.do !== 'measure' && b.do !== 'march') return null;
            const on = onAt(b.on);
            const out = b.off !== undefined ? exit(frame, at(b.off, durationInFrames), 8) : 1;
            const [ax, ay] = project(b.from);
            const [bx, by] = project(b.to);
            if (b.do === 'march') {
              // Figures walk in a loose group, fading out over the last third of the walk.
              const dur = Math.max(1, Math.round((b.duration ?? 2.2) * fps));
              const t = (frame - on) / dur;
              if (t < 0 || t >= 1 || out <= 0) return null;
              const n = b.count ?? 7;
              const h = 46 * unit;
              const facing = bx < ax ? -1 : 1;
              return (
                <g key={`march-${i}`}>
                  {Array.from({length: n}, (_, k) => {
                    const lag = (k % 4) * 0.05;
                    const s = Math.max(0, t - lag) / (1 - lag);
                    const [ox, oy] = [((k * 37) % 7) - 3, Math.floor(k / 3) - 1];
                    const opacity = Math.min(1, t / 0.08) * Math.min(1, (1 - t) / 0.35) * out;
                    return <Walker key={k} x={ax + (bx - ax) * s + ox * 14 * unit} y={ay + (by - ay) * s + oy * 18 * unit} h={h} phase={((frame - on) / fps) * Math.PI * 4 + k} facing={facing} color="#ffffff" opacity={opacity} />;
                  })}
                </g>
              );
            }
            const len = Math.max(1, Math.round((b.duration ?? (b.do === 'arrow' ? 0.8 : 0.6)) * fps));
            const t = progress(frame, on, len, EASE_IN_OUT);
            if (t <= 0 || out <= 0) return null;
            if (b.do === 'measure') {
              const [ex, ey] = [ax + (bx - ax) * t, ay + (by - ay) * t];
              const ang = Math.atan2(by - ay, bx - ax);
              const tick = (x: number, y: number) => `M${(x - Math.sin(ang) * 14 * unit).toFixed(1)},${(y + Math.cos(ang) * 14 * unit).toFixed(1)}L${(x + Math.sin(ang) * 14 * unit).toFixed(1)},${(y - Math.cos(ang) * 14 * unit).toFixed(1)}`;
              const d2 = `M${ax.toFixed(1)},${ay.toFixed(1)}L${ex.toFixed(1)},${ey.toFixed(1)}${tick(ax, ay)}${t >= 1 ? tick(bx, by) : ''}`;
              const lp = pop(frame, on + len, fps);
              const fs = Math.round(ctx.type.label * 2.1);
              const [mx, my] = [(ax + bx) / 2, (ay + by) / 2];
              return (
                <g key={`measure-${i}`} opacity={out}>
                  <path d={d2} stroke={P.halo} strokeWidth={9 * unit} strokeLinecap="round" fill="none" />
                  <path d={d2} stroke="#ffffff" strokeWidth={4 * unit} strokeLinecap="round" fill="none" />
                  {lp > 0 ? (
                    <g transform={`translate(${mx.toFixed(1)},${(my - 34 * unit).toFixed(1)}) scale(${lp.toFixed(3)})`}>
                      <rect x={-fs * 1.6} y={-fs * 0.75} width={fs * 3.2} height={fs * 1.5} rx={fs * 0.4} fill="rgba(10,14,20,0.82)" stroke="#ffffff" strokeWidth={2 * unit} />
                      <text textAnchor="middle" dominantBaseline="central" style={{fontFamily: theme.fonts.body, fontWeight: 800, fontSize: fs, fill: '#ffffff'}}>
                        {b.text}
                      </text>
                    </g>
                  ) : null}
                </g>
              );
            }
            // arrow: a quadratic curve bowed sideways by `bend`, drawn up to t, with a head at the tip.
            const bend = b.bend ?? 0.2;
            const [qx, qy] = [(ax + bx) / 2 - (by - ay) * bend, (ay + by) / 2 + (bx - ax) * bend];
            const at2 = (s: number): [number, number] => [(1 - s) ** 2 * ax + 2 * (1 - s) * s * qx + s ** 2 * bx, (1 - s) ** 2 * ay + 2 * (1 - s) * s * qy + s ** 2 * by];
            const tip = at2(t);
            const back = at2(Math.max(0, t - 0.03));
            const ang = Math.atan2(tip[1] - back[1], tip[0] - back[0]);
            const hs = 30 * unit;
            // The shaft stops under the head so its round end does not poke through the point.
            const shaft = Array.from({length: 33}, (_, k) => at2((k / 32) * Math.max(0, t - 0.04)));
            const dd = `M${shaft.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join('L')}`;
            const head = [
              [tip[0], tip[1]],
              [tip[0] - Math.cos(ang) * hs - Math.sin(ang) * hs * 0.6, tip[1] - Math.sin(ang) * hs + Math.cos(ang) * hs * 0.6],
              [tip[0] - Math.cos(ang) * hs + Math.sin(ang) * hs * 0.6, tip[1] - Math.sin(ang) * hs - Math.cos(ang) * hs * 0.6],
            ]
              .map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`)
              .join(' ');
            const color = P[b.color ?? 'red'];
            return (
              <g key={`arrow-${i}`} opacity={out}>
                <path d={dd} fill="none" stroke={P.halo} strokeWidth={20 * unit} strokeLinecap="round" strokeLinejoin="round" />
                <path d={dd} fill="none" stroke={color} strokeWidth={13 * unit} strokeLinecap="round" strokeLinejoin="round" />
                <polygon points={head} fill={color} stroke={P.halo} strokeWidth={3.5 * unit} strokeLinejoin="round" />
              </g>
            );
          })}
        </svg>
      ) : null}
      {map
        ? beats.map((b, i) => {
            if (b.do !== 'label') return null;
            const on = onAt(b.on);
            const out = b.off !== undefined ? exit(frame, at(b.off, durationInFrames), 8) : 1;
            // A label with `was` is already in at the scene start and flips over on its word; otherwise it slams in.
            const flip = b.was ? progress(frame, on, FLIP_FRAMES, EASE_IN_OUT) * 180 : 0;
            const {scale, opacity} = b.was ? {scale: 1 + 0.12 * Math.sin((flip * Math.PI) / 180), opacity: 1} : slam(frame, on, fps);
            if (opacity * out <= 0) return null;
            const [x, y] = project([b.lon, b.lat]);
            const size = b.size ?? 'big';
            const fontSize = size === 'hero' ? ctx.type.h1 : size === 'big' ? ctx.type.h2 : Math.round(ctx.type.label * 1.3);
            const glow = b.color ? P[b.color] : 'rgba(255,255,255,0.65)';
            return (
              <div
                key={`label-${i}`}
                style={{
                  position: 'absolute',
                  left: x,
                  top: y,
                  transform: `translate(-50%, -50%) perspective(${(800 * unit).toFixed(0)}px) rotateX(${(flip < 90 ? flip : flip - 180).toFixed(2)}deg) scale(${(scale * breathe(frame, b.was || b.on === 0 ? 0 : on, fps)).toFixed(4)})`,
                  opacity: opacity * out,
                  whiteSpace: 'nowrap',
                  fontFamily: theme.fonts.body,
                  fontWeight: 800,
                  fontSize,
                  letterSpacing: '-0.01em',
                  color: '#ffffff',
                  textShadow: `0 0 ${14 * unit}px ${glow}, 0 ${3 * unit}px ${10 * unit}px rgba(0,0,0,0.65)`,
                  WebkitTextStroke: `${1.5 * unit}px rgba(0,0,0,0.25)`,
                }}
              >
                {b.was && flip < 90 ? b.was : b.text}
              </div>
            );
          })
        : null}
      {map
        ? beats.map((b, i) => {
            const on = onAt(b.on);
            const off = b.off !== undefined ? at(b.off, durationInFrames) : undefined;
            if (b.do === 'card') {
              const meta = assets[b.asset.slice(6)];
              if (!meta) throw new Error(`glmap card: unknown asset "${b.asset}"`);
              const [, , cw, ch] = b.crop ?? [0, 0, 1, 1];
              const o = meta.original ?? {width: 4, height: 3};
              const card = {src: staticFile(meta.path), ratio: (o.width * cw) / (o.height * ch), crop: b.crop, caption: b.caption, tilt: b.tilt};
              return <PaperCard key={`card-${i}`} card={card} box={slotRect(ctx, b.place ?? 'top')} frame={frame} start={on} end={off} fps={fps} ctx={ctx} />;
            }
            if (b.do === 'icon') {
              const width = (b.size ?? 0.3) * ctx.safe.w;
              const height = width / ICONS[b.icon].ratio;
              let x: number, y: number;
              if (b.lon !== undefined && b.lat !== undefined) {
                // On the map: the icon stands just above its point.
                const [px, py] = project([b.lon, b.lat]);
                [x, y] = [px, py - height / 2 - 12 * unit];
              } else {
                const r = slotRect(ctx, b.place ?? 'bottom');
                [x, y] = [r.x + r.w / 2, r.y + r.h / 2];
              }
              return <DroppedIcon key={`icon-${i}`} id={`icon-${i}`} name={b.icon} x={x} y={y} width={width} frame={frame} start={on} end={off} fps={fps} />;
            }
            if (b.do === 'stamp') {
              const r = slotRect(ctx, b.place ?? 'top');
              return <StampMark key={`stamp-${i}`} text={b.text} x={r.x + r.w / 2} y={r.y + r.h / 2} frame={frame} start={on} end={off} fps={fps} fontSize={Math.round(ctx.type.h1 * 1.15)} fontFamily={theme.fonts.body} color={P[b.color ?? 'red']} />;
            }
            if (b.do === 'year') {
              const r = slotRect(ctx, b.place ?? 'top');
              const glow = b.color ? P[b.color] : P.gold;
              const number = b.format === 'number';
              return <CountingYear key={`year-${i}`} value={b.value} from={b.from ?? (number ? 0 : b.value - 60)} x={r.x + r.w / 2} y={r.y + r.h / 2} frame={frame} start={on} end={off} fps={fps} fontSize={Math.round(ctx.type.h1 * 1.6)} fontFamily={theme.fonts.body} glow={glow} grouped={number} suffix={b.suffix} />;
            }
            return null;
          })
        : null}
      {d.vignette ? <AbsoluteFill style={{background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,${d.vignette}) 100%)`}} /> : null}
      {guides ? <SafeZoneGuides regions={regionsFor(ctx)} /> : null}
    </AbsoluteFill>
  );
};

export const GlMapScene: SceneDefinition<GlMapData> = {
  component: GlMapView,
  regions: (ctx) => regionsFor(ctx),
  problems: problemsFor,
  cues: (d) =>
    [
      ...(d.camera ?? []).map((k) => k.at),
      ...(d.routes ?? []).map((r) => r.at),
      ...(d.vessels ?? []).map((v) => v.at),
      ...(d.labels ?? []).flatMap((l) => [l.at, l.until]),
      ...(d.beats ?? []).flatMap((b) => [b.on, b.off]),
    ].filter((v): v is string => typeof v === 'string'),
  assetRefs: (d) => (d.beats ?? []).flatMap((b) => (b.do === 'card' ? [b.asset] : b.do === 'highlight' && b.flag?.startsWith('asset:') ? [b.flag] : [])),
  moments: (d) => [
    ...(d.beats ?? []).map((b) => b.on),
    ...(usesLegs(d) ? d.camera.slice(1).map((k) => k.at) : []),
    ...(d.routes ?? []).map((r) => r.at),
    ...(d.labels ?? []).map((l) => l.at),
  ].filter((v): v is At => v !== undefined),
  sounds: (d) => [
    ...(d.beats ?? []).flatMap((b) => {
      if (b.on === 0) return b.offSfx && b.off !== undefined ? [{kind: b.offSfx, at: b.off}] : [];
      const kind = b.sfx === false ? null : (b.sfx ?? beatSfx(b));
      // A dropped icon sounds when it lands; a counting year ticks while it counts.
      const main = [
        ...(kind ? [{kind, at: b.on, ...(b.do === 'icon' ? {offset: DROP_SECONDS} : {})}] : []),
        ...(b.offSfx && b.off !== undefined ? [{kind: b.offSfx, at: b.off}] : []),
      ];
      // The ✕ has its own sound when it lands (the line finished drawing), even if the line is silent.
      return b.do === 'link' && b.cross ? [...main, {kind: 'click', at: b.on, offset: b.duration ?? 0.6}] : main;
    }),
    ...(usesLegs(d) ? d.camera.slice(1) : [])
      .filter((k) => k.sfx !== false && k.at !== undefined)
      .map((k) => ({kind: (k.sfx as string | undefined) ?? (k.ease === 'glide' ? 'swish' : 'whoosh'), at: k.at as At})),
  ],
};
