import {geoBounds, geoCentroid, geoOrthographic, geoPath} from 'd3-geo';
import type {Feature, FeatureCollection, Geometry} from 'geojson';
import React, {useMemo} from 'react';
import {AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {feature} from 'topojson-client';
import type {GeometryCollection, Topology} from 'topojson-specification';
import worldTopo from 'world-atlas/countries-50m.json';
import world110Topo from 'world-atlas/countries-110m.json';
import {EASE_IN_OUT, EASE_OUT, progress} from '../animations/motion';
import {SafeZoneGuides} from '../components/SafeZoneGuides';
import {fixWinding, inView, useGeoLayer, visibleAngle} from '../graphics/geo/data';
import {SatelliteGlobe} from '../graphics/geo/Satellite';
import {CardBody, CardLabel, QrScene, type CardKind} from '../graphics/journey/cards';
import {Spark, SparkDefs, Starfield} from '../graphics/journey/Starfield';
import type {LayoutContext, Rect, Region} from '../layouts/engine';
import {useAsset, useCue, useLayout, useShowGuides} from '../layouts/ProjectContext';
import type {SceneDefinition, SceneProps} from './types';

/**
 * Journey: a satellite globe in space and a camera that travels between
 * countries — rotate, light up the border, dive in, turn the land into the
 * country's exact silhouette (Natural Earth borders) filled with imagery, show
 * three invention cards, then shrink them into points of light and pull back.
 * Built for "The World Gave Us This": a new episode is new countries + cards.
 *
 * Timing: `At` is a cue word, seconds from scene start, negative seconds from
 * the end, "end", or "start" (already fully in — continues from the previous scene). Camera keys with `fit: true` frame `country` inside the
 * map box (so the same storyboard works in every format).
 */
type At = string | number;
type Ease = 'inOut' | 'in' | 'out' | 'linear';
type Slot = 'left' | 'center' | 'right';

export interface JourneyData {
  camera?: {at?: At; lon?: number; lat?: number; zoom?: number; fit?: boolean; fy?: number; ease?: Ease}[];
  /** Natural Earth country name ("China", "Germany", "Japan"). */
  country?: string;
  /** Glowing border + locator ring on the globe. */
  highlightAt?: At;
  highlightUntil?: At;
  /** Satellite -> silhouette map (and back). */
  mapAt?: At;
  mapOutAt?: At;
  /** Imagery clipped inside the country, cross-fading every few seconds. */
  fill?: {assets: string[]; opacity?: number; every?: number};
  cards?: {kind?: CardKind; asset?: string; asset2?: string; label: string; slot: Slot; focus?: At; alt?: At; qrText?: string}[];
  cardsAt?: At;
  /** All cards back to equal emphasis. */
  cardsAllAt?: At;
  /** Cards shrink into points of light that sink into the map. */
  cardsOutAt?: At;
  /** Hook: rapid full-frame cuts that collapse into points of light landing on the globe. */
  montage?: {items: {asset?: string; kind?: 'qr' | 'image'; at: number}[]; collapseAt: number; targets: [number, number][]; qrText?: string};
  /** Globe fades in (default: visible from the start). */
  globeAt?: At;
  locators?: {lon: number; lat: number; at?: At; label?: string}[];
  texts?: {text: string; at?: At; until?: At; y?: number; style?: 'hero' | 'country' | 'sub'; accent?: string[]}[];
  /** Seconds of fade to black at the end of the scene. */
  fadeOut?: number;
  /** Dim the globe (for centred text over it). */
  dimAt?: At;
}

type Props = {name: string};
const WORLD = fixWinding(feature(worldTopo as unknown as Topology, (worldTopo as unknown as Topology).objects.countries as GeometryCollection<Props>) as FeatureCollection<Geometry, Props>);
const WORLD110 = fixWinding(feature(world110Topo as unknown as Topology, (world110Topo as unknown as Topology).objects.countries as GeometryCollection<Props>) as FeatureCollection<Geometry, Props>);
const byName = (fc: FeatureCollection<Geometry, Props>, name: string) => fc.features.find((f) => f.properties.name === name);

const BLUE = '#4ea8ff';
const MAP = {ocean: '#081426', land: '#162232', border: 'rgba(150,185,230,0.3)', target: '#1d3350', outline: '#cfe7ff'};

/** Where a fitted country sits, per orientation. Pure (QC uses it too). */
export function mapBox(ctx: LayoutContext): Rect {
  const {W, H, format} = ctx;
  if (format.orientation === 'portrait') return {x: 0.05 * W, y: 0.165 * H, w: 0.9 * W, h: 0.29 * H};
  if (format.orientation === 'square') return {x: 0.06 * W, y: 0.12 * H, w: 0.88 * W, h: 0.46 * H};
  return {x: 0.04 * W, y: 0.1 * H, w: 0.5 * W, h: 0.8 * H};
}

/** The three card rects (fan: centre card largest, sides tucked behind it). */
export function cardRects(ctx: LayoutContext): Record<Slot, Rect> {
  const {W, H, safe, format} = ctx;
  if (format.orientation === 'landscape') {
    const bx = 0.57 * W;
    const bw = safe.x + safe.w - bx;
    const cw = Math.min(bw * 0.78, safe.h * 0.42 * 1.22);
    const ch = cw * 0.82;
    const sw = cw * 0.72;
    const sh = sw * 0.82;
    const cx = bx + bw / 2;
    return {
      left: {x: cx - sw / 2 - bw * 0.12, y: safe.y, w: sw, h: sh},
      center: {x: cx - cw / 2, y: safe.y + safe.h / 2 - ch / 2, w: cw, h: ch},
      right: {x: cx - sw / 2 + bw * 0.12, y: safe.y + safe.h - sh, w: sw, h: sh},
    };
  }
  const top = format.orientation === 'portrait' ? 0.46 * H : 0.6 * H;
  const bh = safe.y + safe.h - top;
  const cw = Math.min(safe.w * 0.6, (bh / 0.75) * 0.98);
  const ch = cw * 0.75;
  const sw = cw * 0.72;
  const sh = sw * 0.75;
  const cy = top + bh / 2;
  return {
    left: {x: safe.x, y: cy - sh / 2, w: sw, h: sh},
    center: {x: safe.x + safe.w / 2 - cw / 2, y: cy - ch / 2, w: cw, h: ch},
    right: {x: safe.x + safe.w - sw, y: cy - sh / 2, w: sw, h: sh},
  };
}

function regionsFor(ctx: LayoutContext, d: JourneyData): Record<string, Region> {
  const r: Record<string, Region> = {map: {role: 'media', x: 0, y: 0, w: ctx.W, h: ctx.H}, text: {role: 'overlay', ...ctx.safe}};
  if (d.cards?.length) {
    const c = cardRects(ctx);
    for (const s of d.cards) r[`card-${s.slot}`] = {role: 'overlay', ...c[s.slot]};
  }
  return r;
}

const EASES: Record<Ease, (t: number) => number> = {
  inOut: (t) => EASE_IN_OUT(t),
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  linear: (t) => t,
};

/** lon/lat/zoom that frames `f` inside `box` (orthographic, centred on its bounds). */
function fitTo(f: Feature<Geometry, Props>, box: Rect, W: number) {
  const [[x0, y0], [x1, y1]] = geoBounds(f);
  const lon = x1 < x0 ? (x0 + x1 + 360) / 2 : (x0 + x1) / 2;
  const lat = (y0 + y1) / 2;
  const p = geoOrthographic().rotate([-lon, -lat]).scale(1).translate([0, 0]).clipAngle(90);
  const [[bx0, by0], [bx1, by1]] = geoPath(p).bounds(f);
  const R = Math.min(box.w / (bx1 - bx0), box.h / (by1 - by0)) * 0.94;
  return {lon, lat, zoom: R / (W / 2)};
}

const JourneyView: React.FC<SceneProps<JourneyData>> = ({scene, durationInFrames}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const ctx = useLayout();
  const guides = useShowGuides();
  const cueAt = useCue(scene);
  const d = scene.data;
  const {W, H, unit} = ctx;
  const at = (v: At | undefined, fallback = 0): number => {
    if (v === undefined) return fallback;
    if (v === 'end') return durationInFrames;
    if (v === 'start') return -1000; // already fully in (continues from the previous scene)
    if (typeof v === 'number') return v >= 0 ? Math.round(v * fps) : durationInFrames + Math.round(v * fps);
    return cueAt(v, fallback);
  };
  const box = mapBox(ctx);
  const target = d.country ? byName(WORLD, d.country) : undefined;

  // ---- camera keys (fit keys frame the country in the map box)
  const keys = useMemo(() => {
    const fitted = target ? fitTo(target, box, W) : null;
    return (d.camera ?? [{lon: 20, lat: 20, zoom: 1}]).map((k, i, all) => {
      const f = at(k.at, Math.round((i / Math.max(1, all.length - 1)) * durationInFrames));
      if (k.fit && fitted) return {f, lon: fitted.lon, lat: fitted.lat, zoom: fitted.zoom, fy: (box.y + box.h / 2) / H, fx: (box.x + box.w / 2) / W, ease: k.ease ?? 'inOut'};
      return {f, lon: k.lon ?? 0, lat: k.lat ?? 0, zoom: k.zoom ?? 1, fy: k.fy ?? 0.5, fx: 0.5, ease: k.ease ?? 'inOut'};
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.camera, d.country, durationInFrames, W, H]);
  const camAt = (fr: number) => {
    const c = keys[0];
    let out = {lon: c.lon, lat: c.lat, zoom: c.zoom, fx: c.fx, fy: c.fy};
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i];
      const b = keys[i + 1];
      if (fr >= a.f && fr <= b.f) {
        const t = EASES[b.ease](Math.min(1, Math.max(0, (fr - a.f) / Math.max(1, b.f - a.f))));
        const dl = ((((b.lon - a.lon) % 360) + 540) % 360) - 180; // shortest way round
        out = {
          lon: a.lon + dl * t,
          lat: a.lat + (b.lat - a.lat) * t,
          zoom: Math.exp(Math.log(a.zoom) + (Math.log(b.zoom) - Math.log(a.zoom)) * t),
          fx: a.fx + (b.fx - a.fx) * t,
          fy: a.fy + (b.fy - a.fy) * t,
        };
      } else if (fr > b.f) {
        out = {lon: b.lon, lat: b.lat, zoom: b.zoom, fx: b.fx, fy: b.fy};
      }
    }
    return out;
  };
  const cam = camAt(frame);
  const next = camAt(frame + 1);
  // Motion blur proportional to camera speed (zoom in log space + rotation).
  const speed = Math.abs(Math.log(next.zoom) - Math.log(cam.zoom)) * 9 + Math.hypot(next.lon - cam.lon, next.lat - cam.lat) * cam.zoom * 0.25;
  const blur = Math.min(3.5, Math.max(0, speed - 0.25) * 2.2) * unit;

  const cx = cam.fx * W;
  const cy = cam.fy * H;
  const R = (W / 2) * cam.zoom;
  const projection = geoOrthographic().rotate([-cam.lon, -cam.lat]).scale(R).translate([cx, cy]).clipAngle(90);
  const path = geoPath(projection);

  const maxZoom = Math.max(...keys.map((k) => k.zoom));
  const countries10 = useGeoLayer(maxZoom >= 6 ? 'countries-10m' : null) as unknown as FeatureCollection<Geometry, Props> | null;
  const base = cam.zoom < 1.6 ? WORLD110 : cam.zoom >= 6 && countries10 ? countries10 : WORLD;
  const tgt = d.country ? byName(base, d.country) : undefined;
  const farPx = Math.max(Math.hypot(cx, cy), Math.hypot(W - cx, H - cy));
  const vis = visibleAngle(R, farPx);
  const visible = base.features.filter((f) => inView(f as never, [cam.lon, cam.lat], vis));

  const dim = d.dimAt !== undefined ? 1 - 0.42 * progress(frame, at(d.dimAt), 15) : 1;
  const globeIn = d.globeAt !== undefined ? progress(frame, at(d.globeAt), 20) : 1;
  const mapP = (d.mapAt !== undefined ? progress(frame, at(d.mapAt), 20, EASE_IN_OUT) : 0) * (d.mapOutAt !== undefined ? 1 - progress(frame, at(d.mapOutAt), 20, EASE_IN_OUT) : 1);
  const hlF = d.highlightAt !== undefined ? at(d.highlightAt) : null;
  const hl = hlF !== null ? progress(frame, hlF, 14) * (d.highlightUntil !== undefined ? 1 - progress(frame, at(d.highlightUntil), 12) : 1) : 0;

  // ---- fill imagery (resolved up front: hooks must not run conditionally)
  const fillAssets = (d.fill?.assets ?? []).map((a) => useAsset(a)); // eslint-disable-line react-hooks/rules-of-hooks
  const cardAssets = (d.cards ?? []).map((c) => ({a: useAsset(c.asset), b: useAsset(c.asset2)})); // eslint-disable-line react-hooks/rules-of-hooks
  const montageAssets = (d.montage?.items ?? []).map((m) => useAsset(m.asset)); // eslint-disable-line react-hooks/rules-of-hooks

  const tgtPath = tgt ? path(tgt) : null;
  const tgtBounds = tgt && tgtPath ? path.bounds(tgt) : null;
  const tgtCentroid = tgt ? projection(geoCentroid(tgt)) : null;
  const fillEvery = Math.round((d.fill?.every ?? 3) * fps);
  const mapStart = d.mapAt !== undefined ? at(d.mapAt) : 0;

  // ---- cards
  const rects = cardRects(ctx);
  const cardsF = at(d.cardsAt, 0);
  const outF = d.cardsOutAt !== undefined ? at(d.cardsOutAt) : null;
  const allF = d.cardsAllAt !== undefined ? at(d.cardsAllAt) : null;
  const focusFs = (d.cards ?? []).map((c) => (c.focus !== undefined ? at(c.focus, -1) : null));
  let active = -1;
  focusFs.forEach((f, i) => {
    if (f !== null && frame >= f && (active < 0 || f >= (focusFs[active] ?? -1))) active = i;
  });
  if (allF !== null && frame >= allF) active = -1;
  const anyFocused = focusFs.some((f) => f !== null && frame >= f);

  const sparks: {x: number; y: number; r: number; o: number}[] = [];

  const cardEls = (d.cards ?? []).map((c, i) => {
    const r = rects[c.slot];
    const enter = progress(frame, cardsF + (c.slot === 'center' ? 0 : 5), 14);
    if (enter <= 0) return null;
    const ff = focusFs[i];
    const isActive = active === i;
    // emphasis: active 1; others dimmed once anything is focused; all equal before/after
    const em = isActive ? 1 : anyFocused && active >= 0 ? 0 : 0.75;
    const sinceSwitch = ff !== null && isActive ? frame - ff : 99;
    const e = isActive ? Math.min(1, sinceSwitch / 8) : em;
    let scale = (0.88 + 0.12 * e) * (0.7 + 0.3 * enter);
    let x = r.x + r.w / 2;
    let y = r.y + r.h / 2 + (1 - enter) * 40 * unit;
    let op = enter;
    // exit: shrink into a point of light, sink into the country
    if (outF !== null && frame >= outF) {
      const k = Math.min(1, (frame - outF) / 12);
      const m = Math.min(1, Math.max(0, (frame - outF - 8) / 16));
      const dest = tgtCentroid ?? [cx, cy];
      const ease = EASE_IN_OUT(m);
      x = x + (dest[0] - x) * ease;
      y = y + (dest[1] - y) * ease;
      scale *= 1 - 0.97 * EASE_IN_OUT(k);
      op = 1 - k;
      const sr = 8 * unit * Math.min(1, k * 1.5) * (1 - 0.6 * ease);
      const so = Math.min(1, k * 2) * (1 - Math.max(0, (frame - outF - 22) / 8));
      if (c.kind === 'qr') {
        // QR modules scatter into a small constellation
        for (let j = 0; j < 9; j++) {
          const gx = ((j % 3) - 1) * r.w * 0.22 * (1 - ease);
          const gy = (Math.floor(j / 3) - 1) * r.w * 0.22 * (1 - ease);
          sparks.push({x: x + gx, y: y + gy, r: sr * 0.55, o: so});
        }
      } else sparks.push({x, y, r: sr, o: so});
      if (op <= 0) return null;
    }
    const z = isActive ? 30 : c.slot === 'center' ? 20 : 10;
    const tLocal = ff !== null ? frame - ff : -999;
    const tAlt = c.alt !== undefined ? frame - at(c.alt, 1e6) : tLocal - 27;
    const labelP = ff !== null ? progress(frame, ff, 10) : 0;
    const labelSize = Math.round(ctx.type.label * (c.slot === 'center' ? 1.45 : 1.2) * Math.min(1.4, r.w / 330));
    const brightness = 0.45 + 0.55 * e;
    return (
      <div
        key={i}
        style={{
          position: 'absolute',
          left: x - r.w / 2,
          top: y - r.h / 2,
          width: r.w,
          height: r.h,
          transform: `scale(${scale})`,
          opacity: op,
          zIndex: z,
          borderRadius: 18 * unit,
          overflow: 'hidden',
          border: `${2 * unit}px solid ${isActive ? 'rgba(120,190,255,0.95)' : 'rgba(255,255,255,0.22)'}`,
          boxShadow: `0 ${18 * unit}px ${50 * unit}px rgba(0,0,0,0.65)${isActive ? `, 0 0 ${28 * unit}px rgba(78,168,255,0.35)` : ''}`,
          background: '#0b1422',
        }}
      >
        <div style={{position: 'absolute', inset: 0, filter: `brightness(${brightness}) saturate(${0.6 + 0.4 * e})`}}>
          <CardBody v={{kind: c.kind ?? 'image', src: cardAssets[i].a?.src, src2: cardAssets[i].b?.src, focal: cardAssets[i].a?.focalPoint, qrText: c.qrText}} w={r.w} h={r.h} t={tLocal} tAlt={tAlt} age={frame - cardsF} unit={unit} />
        </div>
        <CardLabel text={c.label} size={labelSize} p={labelP * (0.55 + 0.45 * e)} unit={unit} />
      </div>
    );
  });

  // ---- montage (hook): cuts, then collapse into three points that land on the globe
  let montageEl: React.ReactNode = null;
  if (d.montage) {
    const mo = d.montage;
    const col = Math.round(mo.collapseAt * fps);
    const items = mo.items;
    if (frame < col) {
      let idx = 0;
      items.forEach((m, i) => {
        if (frame >= Math.round(m.at * fps)) idx = i;
      });
      const m = items[idx];
      const t0 = Math.round(m.at * fps);
      const s = 1.08 - 0.06 * Math.min(1, (frame - t0) / 30);
      montageEl = (
        <AbsoluteFill style={{zIndex: 40, background: '#02050b'}}>
          <AbsoluteFill style={{transform: `scale(${s})`, filter: 'brightness(0.68)'}}>
            {m.kind === 'qr' ? <QrScene w={W} h={H} t={frame - t0 + 6} unit={unit} text={mo.qrText ?? ''} /> : montageAssets[idx] ? <Img src={montageAssets[idx]!.src} style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${(montageAssets[idx]!.focalPoint?.x ?? 0.5) * 100}% ${(montageAssets[idx]!.focalPoint?.y ?? 0.5) * 100}%`}} /> : null}
          </AbsoluteFill>
          {/* shade behind the hook title so it reads over light archive images */}
          <AbsoluteFill style={{background: 'linear-gradient(to bottom, rgba(2,5,11,0.78) 0%, rgba(2,5,11,0.55) 26%, rgba(2,5,11,0) 42%)'}} />
        </AbsoluteFill>
      );
    } else {
      const t = frame - col;
      const tiles = items.map((m, i) => {
        const pull = Math.min(1, t / 9); // full frame -> tiles
        const shrink = Math.min(1, Math.max(0, (t - 9) / 9)); // tiles -> points
        const fly = Math.min(1, Math.max(0, (t - 16) / 22)); // points -> globe
        const tw = W * 0.28;
        const tx = W * (0.2 + 0.3 * i);
        const ty = H * 0.47;
        const last = i === items.length - 1;
        const w0 = last ? W + (tw - W) * EASE_OUT(pull) : tw * EASE_OUT(pull);
        const h0 = last ? H + (tw * 1.3 - H) * EASE_OUT(pull) : tw * 1.3 * EASE_OUT(pull);
        const x0 = last ? W / 2 + (tx - W / 2) * EASE_OUT(pull) : tx;
        const w = w0 * (1 - shrink);
        const h = h0 * (1 - shrink);
        const dest = projection(mo.targets[i] ?? [0, 0]) ?? [cx, cy];
        const fe = EASE_IN_OUT(fly);
        const sx = x0 + (dest[0] - x0) * fe;
        const sy = ty + (dest[1] - ty) * fe;
        if (shrink > 0.35) sparks.push({x: sx, y: sy, r: 9 * unit * Math.min(1, (shrink - 0.35) * 3) * (1 - 0.4 * fe), o: 1 - Math.max(0, (t - 36) / 8)});
        if (w <= 2) return null;
        return (
          <div key={i} style={{position: 'absolute', left: x0 - w / 2, top: ty - h / 2, width: w, height: h, overflow: 'hidden', borderRadius: 16 * unit * pull + 200 * unit * shrink, opacity: 1 - shrink * 0.6, boxShadow: `0 0 ${40 * unit * shrink}px rgba(120,190,255,${0.8 * shrink})`}}>
            {m.kind === 'qr' ? <QrScene w={w} h={h} t={60} unit={unit * Math.max(0.2, w / W)} text={mo.qrText ?? ''} /> : montageAssets[i] ? <Img src={montageAssets[i]!.src} style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${(montageAssets[i]!.focalPoint?.x ?? 0.5) * 100}% ${(montageAssets[i]!.focalPoint?.y ?? 0.5) * 100}%`}} /> : null}
          </div>
        );
      });
      montageEl = <AbsoluteFill style={{zIndex: 40}}>{tiles}</AbsoluteFill>;
    }
  }

  // ---- texts
  const textEls = (d.texts ?? []).map((t, i) => {
    const f0 = at(t.at, 0);
    const f1 = t.until !== undefined ? at(t.until, durationInFrames) : durationInFrames + 99;
    if (frame < f0 || frame >= f1 + 8) return null;
    const p = progress(frame, f0, 10) * (1 - progress(frame, f1, 8));
    const y = ctx.safe.y + ctx.safe.h * Math.min(1, Math.max(0, ((t.y ?? 0.5) * H - ctx.safe.y) / ctx.safe.h));
    const style = t.style ?? 'hero';
    const size = style === 'country' ? ctx.type.display * 0.9 : style === 'sub' ? ctx.type.label * 1.35 : ctx.type.display * 0.92;
    const accent = new Set((t.accent ?? []).map((w) => w.toUpperCase()));
    const words = t.text.split(' ');
    return (
      <div
        key={i}
        style={{
          position: 'absolute',
          left: ctx.safe.x,
          width: ctx.safe.w,
          top: y,
          transform: `translateY(calc(-50% + ${(1 - p) * 16 * unit}px))`,
          opacity: p,
          textAlign: 'center',
          zIndex: 60,
          fontFamily: style === 'sub' ? '"Inter Variable", sans-serif' : '"Bebas Neue", sans-serif',
          fontWeight: style === 'sub' ? 700 : 400,
          fontSize: Math.round(size),
          lineHeight: 0.98,
          letterSpacing: style === 'country' ? '0.12em' : style === 'sub' ? '0.14em' : '0.02em',
          textWrap: 'balance',
          color: '#ffffff',
          textShadow: `0 ${3 * unit}px ${18 * unit}px rgba(0,0,0,0.85), 0 0 ${3 * unit}px rgba(0,0,0,0.9)`,
        }}
      >
        {words.map((w, k) => (
          <span key={k} style={{color: accent.has(w.toUpperCase().replace(/[^\w-]/g, '')) || accent.has(w.toUpperCase()) ? BLUE : undefined}}>
            {k ? ' ' : ''}
            {w}
          </span>
        ))}
        {style === 'country' ? <div style={{width: 70 * unit * p, height: 4 * unit, background: BLUE, margin: `${10 * unit}px auto 0`}} /> : null}
      </div>
    );
  });

  const fade = d.fadeOut ? interpolate(frame, [durationInFrames - Math.round(d.fadeOut * fps), durationInFrames], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) : 1;
  const imgBox = tgtBounds
    ? (() => {
        const x0 = Math.max(tgtBounds[0][0], -W * 0.2);
        const y0 = Math.max(tgtBounds[0][1], -H * 0.2);
        const x1 = Math.min(tgtBounds[1][0], W * 1.2);
        const y1 = Math.min(tgtBounds[1][1], H * 1.2);
        return {x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0)};
      })()
    : null;
  const tgtSmall = tgtBounds ? Math.max(tgtBounds[1][0] - tgtBounds[0][0], tgtBounds[1][1] - tgtBounds[0][1]) < 90 * unit : false;

  return (
    <AbsoluteFill style={{background: '#02050b', opacity: fade}}>
      <Starfield W={W} H={H} lon={cam.lon} frame={frame} unit={unit} opacity={1 - mapP * 0.5} />
      <AbsoluteFill style={{opacity: globeIn, filter: [blur > 0.3 ? `blur(${blur.toFixed(2)}px)` : '', dim < 1 ? `brightness(${dim.toFixed(3)})` : ''].join(' ').trim() || undefined}}>
        {/* atmosphere */}
        <div style={{position: 'absolute', left: cx - R * 1.09, top: cy - R * 1.09, width: R * 2.18, height: R * 2.18, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,0,0,0) 89%, rgba(90,160,255,0.42) 91.6%, rgba(60,130,255,0.12) 95%, rgba(0,0,0,0) 100%)', opacity: 1 - mapP}} />
        {mapP < 1 ? <SatelliteGlobe W={W} H={H} cx={cx} cy={cy} R={R} lon={cam.lon} lat={cam.lat} opacity={(1 - mapP) * globeIn} /> : null}
        <svg width={W} height={H} style={{position: 'absolute', left: 0, top: 0}}>
          <defs>
            <radialGradient id={`shade-${scene.id}`} cx="38%" cy="32%" r="70%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity={0.07} />
              <stop offset="60%" stopColor="#000000" stopOpacity={0} />
              <stop offset="100%" stopColor="#000814" stopOpacity={0.55} />
            </radialGradient>
            <filter id={`glow-${scene.id}`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation={6 * unit} />
            </filter>
            <filter id={`tone-${scene.id}`}>
              <feComponentTransfer>
                <feFuncR type="linear" slope={0.62} />
                <feFuncG type="linear" slope={0.64} />
                <feFuncB type="linear" slope={0.7} />
              </feComponentTransfer>
            </filter>
            {tgtPath ? (
              <clipPath id={`clip-${scene.id}`}>
                <path d={tgtPath} />
              </clipPath>
            ) : null}
          </defs>
          {/* satellite shading: limb darkening for a 3D sphere */}
          {mapP < 1 ? <path d={path({type: 'Sphere'}) ?? undefined} fill={`url(#shade-${scene.id})`} opacity={1 - mapP} /> : null}
          {/* silhouette map */}
          {mapP > 0 ? (
            <g opacity={mapP}>
              <path d={path({type: 'Sphere'}) ?? undefined} fill={MAP.ocean} />
              {visible.map((f, i) => {
                const dd = path(f);
                return dd ? <path key={i} d={dd} fill={f.properties.name === d.country ? MAP.target : MAP.land} stroke={MAP.border} strokeWidth={1.1 * unit} /> : null;
              })}
              {tgtPath && imgBox
                ? fillAssets.map((a, i) => {
                    if (!a) return null;
                    const n = fillAssets.length;
                    const slot = Math.floor(Math.max(0, frame - mapStart) / fillEvery);
                    const phase = Math.max(0, frame - mapStart) - slot * fillEvery;
                    const cur = slot % n;
                    const prev = (slot - 1 + n) % n;
                    const op = i === cur ? (slot === 0 ? 1 : Math.min(1, phase / 15)) : i === prev && slot > 0 && phase < 15 ? 1 : 0;
                    if (op <= 0) return null;
                    const drift = 1 + 0.05 * Math.min(1, Math.max(0, frame - mapStart) / (8 * fps));
                    return (
                      <g key={i} clipPath={`url(#clip-${scene.id})`} opacity={op * (d.fill?.opacity ?? 0.85)} filter={`url(#tone-${scene.id})`}>
                        <image href={a.src} x={imgBox.x - (imgBox.w * (drift - 1)) / 2} y={imgBox.y - (imgBox.h * (drift - 1)) / 2} width={imgBox.w * drift} height={imgBox.h * drift} preserveAspectRatio="xMidYMid slice" />
                      </g>
                    );
                  })
                : null}
            </g>
          ) : null}
          {/* illuminated border (globe and map) */}
          {tgtPath && (hl > 0 || mapP > 0) ? (
            <g opacity={Math.max(hl, mapP)} fill="none" strokeLinejoin="round">
              <path d={tgtPath} stroke={BLUE} strokeWidth={7 * unit} filter={`url(#glow-${scene.id})`} opacity={0.9} />
              <path d={tgtPath} stroke={MAP.outline} strokeWidth={2.6 * unit} />
            </g>
          ) : null}
          {/* locator ring for countries that are small on screen */}
          {hlF !== null && tgtCentroid && tgtSmall && hl > 0
            ? (() => {
                const pr = ((frame - hlF) % 40) / 40;
                return (
                  <g opacity={hl * (1 - mapP)}>
                    <circle cx={tgtCentroid[0]} cy={tgtCentroid[1]} r={(18 + 50 * pr) * unit} fill="none" stroke={BLUE} strokeWidth={3 * unit} opacity={1 - pr} />
                    <circle cx={tgtCentroid[0]} cy={tgtCentroid[1]} r={6 * unit} fill="#ffffff" />
                  </g>
                );
              })()
            : null}
          {/* closing locators */}
          {(d.locators ?? []).map((l, i) => {
            const pt = projection([l.lon, l.lat]);
            const p = progress(frame, at(l.at, 0), 12);
            if (!pt || p <= 0) return null;
            const pr = ((frame - at(l.at, 0)) % 45) / 45;
            return (
              <g key={i} opacity={p}>
                <circle cx={pt[0]} cy={pt[1]} r={(14 + 34 * pr) * unit} fill="none" stroke={BLUE} strokeWidth={2.5 * unit} opacity={1 - pr} />
                <circle cx={pt[0]} cy={pt[1]} r={7 * unit} fill="#ffffff" stroke={BLUE} strokeWidth={3 * unit} />
                {l.label ? (
                  <text x={pt[0]} y={pt[1] - 22 * unit} textAnchor="middle" fill="#ffffff" style={{fontFamily: '"Inter Variable", sans-serif', fontWeight: 700, fontSize: Math.round(ctx.type.label * 1.05), letterSpacing: '0.14em', paintOrder: 'stroke', stroke: 'rgba(2,5,11,0.85)', strokeWidth: 6 * unit}}>
                    {l.label.toUpperCase()}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </AbsoluteFill>
      {cardEls}
      {montageEl}
      <svg width={W} height={H} style={{position: 'absolute', left: 0, top: 0, zIndex: 50, pointerEvents: 'none'}}>
        <SparkDefs />
        {sparks.map((s, i) => (
          <Spark key={i} x={s.x} y={s.y} r={s.r} opacity={s.o} />
        ))}
      </svg>
      {textEls}
      {guides ? <SafeZoneGuides regions={regionsFor(ctx, d)} /> : null}
    </AbsoluteFill>
  );
};

export const JourneyScene: SceneDefinition<JourneyData> = {
  component: JourneyView,
  regions: (ctx, d) => regionsFor(ctx, d),
  textBlocks: (ctx, d) =>
    (d.texts ?? [])
      .filter((t) => t.style !== 'sub')
      .map((t) => ({region: 'text', text: t.text, fontSize: Math.round(ctx.type.display * 0.92 * 0.62), lineHeight: 0.98})),
  assetRefs: (d) => [...(d.fill?.assets ?? []), ...(d.cards ?? []).flatMap((c) => [c.asset, c.asset2]), ...(d.montage?.items ?? []).map((m) => m.asset)].filter((x): x is string => Boolean(x)),
  cues: (d) =>
    [
      ...(d.camera ?? []).map((k) => k.at),
      d.highlightAt,
      d.highlightUntil,
      d.mapAt,
      d.mapOutAt,
      d.cardsAt,
      d.cardsAllAt,
      d.cardsOutAt,
      d.globeAt,
      ...(d.cards ?? []).flatMap((c) => [c.focus, c.alt]),
      ...(d.locators ?? []).map((l) => l.at),
      ...(d.texts ?? []).flatMap((t) => [t.at, t.until]),
    ].filter((v): v is string => typeof v === 'string' && v !== 'end' && v !== 'start'),
};
