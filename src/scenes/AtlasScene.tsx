import {geoCentroid, geoGraticule10, geoOrthographic, geoPath} from 'd3-geo';
import type {Feature, FeatureCollection, Geometry} from 'geojson';
import React, {useMemo} from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {feature} from 'topojson-client';
import type {GeometryCollection, Topology} from 'topojson-specification';
import worldTopo from 'world-atlas/countries-50m.json';
import {EASE_IN_OUT, EASE_OUT, progress} from '../animations/motion';
import {Backdrop} from '../components/Backdrop';
import {SafeZoneGuides} from '../components/SafeZoneGuides';
import type {LayoutContext, Region} from '../layouts/engine';
import {useCue, useLayout, useShowGuides, useTheme} from '../layouts/ProjectContext';
import type {SceneDefinition, SceneProps} from './types';

/**
 * Atlas: an orthographic globe with a keyframed camera, for geography stories.
 * Camera keys and every layer can be timed to narration cues (word) or to
 * seconds from scene start. Zoom is interpolated in log space, so dives feel
 * like a continuous camera move rather than a linear scale.
 *
 * With `background` set, the globe is replaced by a photo and only the text
 * layer is used (terrain, archive shots).
 */
type At = string | number;
export interface AtlasData {
  background?: string;
  /** Styling for archival backgrounds: "parchment" warms a scanned map. */
  tint?: 'parchment';
  camera?: {at?: At; lon: number; lat: number; zoom: number}[];
  /** Vertical position of the globe centre, 0–1 of frame height. */
  focusY?: number;
  grid?: boolean;
  gold?: {name: string; at?: At}[];
  warm?: {name: string; at?: At}[];
  fade?: {names: string[]; at?: At};
  outline?: {name: string; at?: At; color?: 'white' | 'gold'}[];
  pulse?: {name: string; at?: At}[];
  labels?: {text: string; name?: string; lon?: number; lat?: number; at?: At; tone?: 'gold' | 'white' | 'muted'; /** vertical offset in label heights (+ down) */ dy?: number; /** pin dot for point labels (default true; false for region names) */ dot?: boolean}[];
  texts?: {
    text: string;
    at?: At;
    until?: At;
    style?: 'hero' | 'stamp' | 'sub' | 'count';
    /** For count: animate 0 → value, shown with `decimals` and `text` as suffix. */
    value?: number;
    decimals?: number;
    /** 0–1 of frame height (kept inside the safe zone). */
    y?: number;
    tone?: 'white' | 'gold';
  }[];
  shake?: At[];
}

type Props = {name: string};
const WORLD = feature(worldTopo as unknown as Topology, (worldTopo as unknown as Topology).objects.countries as GeometryCollection<Props>) as FeatureCollection<Geometry, Props>;
const byName = new Map(WORLD.features.map((f) => [f.properties.name, f]));
const GRATICULE = geoGraticule10();

const PALETTE = {ocean: '#0b1826', land: '#1d2421', warm: '#6b645b', gold: '#e0a63a', border: 'rgba(255,255,255,0.18)', grid: 'rgba(255,255,255,0.07)'};

function regionsFor(ctx: LayoutContext): Record<string, Region> {
  return {map: {role: 'media', x: 0, y: 0, w: ctx.W, h: ctx.H}, text: {role: 'overlay', ...ctx.safe}};
}

const AtlasView: React.FC<SceneProps<AtlasData>> = ({scene, durationInFrames}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const ctx = useLayout();
  const theme = useTheme();
  const guides = useShowGuides();
  const cueAt = useCue(scene);
  const d = scene.data;
  const {W, H, unit} = ctx;
  const at = (v: At | undefined, fallback = 0) => (v === undefined ? fallback : typeof v === 'number' ? Math.round(v * fps) : cueAt(v, fallback));

  // ---- camera (keyframes -> lon/lat/zoom), log-space zoom
  const cam = useMemo(() => {
    const keys = (d.camera ?? [{lon: 20, lat: 0, zoom: 1}]).map((k, i, all) => ({...k, f: at(k.at, Math.round((i / Math.max(1, all.length - 1)) * durationInFrames))}));
    return keys;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.camera, durationInFrames]);
  let lon = cam[0].lon;
  let lat = cam[0].lat;
  let zoom = cam[0].zoom;
  for (let i = 0; i < cam.length - 1; i++) {
    const a = cam[i];
    const b = cam[i + 1];
    if (frame >= a.f && frame <= b.f) {
      const t = interpolate(frame, [a.f, Math.max(a.f + 1, b.f)], [0, 1], {easing: EASE_IN_OUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
      lon = a.lon + (b.lon - a.lon) * t;
      lat = a.lat + (b.lat - a.lat) * t;
      zoom = Math.exp(Math.log(a.zoom) + (Math.log(b.zoom) - Math.log(a.zoom)) * t);
    } else if (frame > b.f) {
      ({lon, lat, zoom} = b);
    }
  }

  // ---- impact shake (small, decaying)
  const shakeOffset = (d.shake ?? []).reduce<number>((acc, s) => {
    const f0 = at(s, -999);
    const t = frame - f0;
    return t >= 0 && t < 12 ? acc + Math.sin(t * 2.6) * 7 * unit * (1 - t / 12) : acc;
  }, 0);

  const cy = (d.focusY ?? 0.5) * H;
  const projection = geoOrthographic()
    .rotate([-lon, -lat])
    .scale((W / 2) * zoom)
    .translate([W / 2, cy])
    .clipAngle(90);
  const path = geoPath(projection);

  const reveal = (items: {name: string; at?: At}[] | undefined) => new Map((items ?? []).map((g) => [g.name, at(g.at, 0)]));
  const gold = reveal(d.gold);
  const warm = reveal(d.warm);
  const fadeAt = d.fade ? at(d.fade.at, 0) : null;
  const fadeSet = new Set(d.fade?.names ?? []);
  const globeIn = progress(frame, 0, 14);

  const fillFor = (name: string) => {
    const g = gold.get(name);
    if (g !== undefined && frame >= g) return {fill: PALETTE.gold, op: 0.3 + 0.7 * progress(frame, g, 12)};
    const w = warm.get(name);
    if (w !== undefined && frame >= w) return {fill: PALETTE.warm, op: 0.4 + 0.6 * progress(frame, w, 12)};
    const faded = fadeAt !== null && fadeSet.has(name) ? 1 - 0.75 * progress(frame, fadeAt, 18) : 1;
    return {fill: PALETTE.land, op: faded};
  };

  const textStyle = (style: string | undefined, tone: string | undefined): React.CSSProperties => {
    const color = tone === 'gold' ? PALETTE.gold : '#f5f2ec';
    if (style === 'sub') return {fontFamily: theme.fonts.body, fontSize: Math.round(ctx.type.label * 1.25), fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color};
    const size = style === 'stamp' ? ctx.type.display * 0.95 : ctx.type.display * 1.35;
    return {fontFamily: '"Bebas Neue", "Anton", sans-serif', fontSize: Math.round(size), lineHeight: 0.95, letterSpacing: '0.01em', textTransform: 'uppercase', color, textShadow: `0 ${4 * unit}px ${24 * unit}px rgba(0,0,0,0.65)`};
  };

  return (
    <AbsoluteFill style={{background: '#080b0f'}}>
      <AbsoluteFill style={{transform: `translate(${shakeOffset}px, ${shakeOffset * 0.4}px)`}}>
        {d.background ? (
          <div style={{position: 'absolute', inset: 0, filter: d.tint === 'parchment' ? 'sepia(0.7) saturate(1.25) contrast(1.05) brightness(0.95)' : undefined}}>
            <Backdrop asset={d.background} durationInFrames={durationInFrames} dim={d.tint === 'parchment' ? 0.28 : 0.35} />
          </div>
        ) : (
          <svg width={W} height={H} style={{opacity: globeIn}}>
            <path d={path({type: 'Sphere'}) ?? undefined} fill={PALETTE.ocean} stroke="rgba(160,190,220,0.25)" strokeWidth={2 * unit} />
            {d.grid !== false ? <path d={path(GRATICULE) ?? undefined} fill="none" stroke={PALETTE.grid} strokeWidth={1 * unit} /> : null}
            {WORLD.features.map((f: Feature<Geometry, Props>, i) => {
              const {fill, op} = fillFor(f.properties.name);
              const dd = path(f);
              return dd ? <path key={i} d={dd} fill={fill} fillOpacity={op} stroke={PALETTE.border} strokeWidth={0.8 * unit} /> : null;
            })}
            {/* Borders that draw themselves. */}
            {(d.outline ?? []).map((o) => {
              const f = byName.get(o.name);
              const dd = f ? path(f) : null;
              if (!dd) return null;
              const p = progress(frame, at(o.at, 0), 28, EASE_OUT);
              return <path key={o.name} d={dd} fill="none" stroke={o.color === 'gold' ? PALETTE.gold : '#ffffff'} strokeWidth={3 * unit} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} strokeLinejoin="round" />;
            })}
            {/* Gold pulse rings. */}
            {(d.pulse ?? []).map((pl) => {
              const f = byName.get(pl.name);
              const c = f ? projection(geoCentroid(f)) : null;
              if (!c) return null;
              const p = progress(frame, at(pl.at, 0), 32, EASE_OUT);
              if (p <= 0 || p >= 1) return null;
              return <circle key={pl.name} cx={c[0]} cy={c[1]} r={(20 + 260 * p) * unit} fill="none" stroke={PALETTE.gold} strokeWidth={(6 - 5 * p) * unit} opacity={1 - p} />;
            })}
            {(d.labels ?? []).map((l, i) => {
              const f = l.name ? byName.get(l.name) : null;
              const pt = f ? projection(geoCentroid(f)) : l.lon !== undefined && l.lat !== undefined ? projection([l.lon, l.lat]) : null;
              if (!pt) return null;
              const p = progress(frame, at(l.at, 0), 12);
              const color = l.tone === 'gold' ? PALETTE.gold : l.tone === 'muted' ? 'rgba(255,255,255,0.55)' : '#ffffff';
              return (
                <g key={i} opacity={p}>
                  {l.lon !== undefined && l.dot !== false ? <circle cx={pt[0]} cy={pt[1]} r={7 * unit} fill={PALETTE.gold} stroke="#080b0f" strokeWidth={3 * unit} /> : null}
                  <text
                    x={pt[0] + (l.lon !== undefined && l.dot !== false ? 18 * unit : 0)}
                    y={pt[1] + (l.dy ?? 0) * ctx.type.label * 1.6}
                    textAnchor={l.lon !== undefined && l.dot !== false ? 'start' : 'middle'}
                    dominantBaseline="middle"
                    fill={color}
                    style={{fontFamily: theme.fonts.body, fontSize: Math.round(ctx.type.label * 1.15), fontWeight: 700, letterSpacing: '0.14em', paintOrder: 'stroke', stroke: '#080b0f', strokeWidth: 5 * unit}}
                  >
                    {l.text.toUpperCase()}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </AbsoluteFill>

      {/* Text layer: 1–5 words at a time, inside the safe zone. */}
      {(d.texts ?? []).map((t, i) => {
        const f0 = at(t.at, 0);
        const f1 = t.until !== undefined ? at(t.until, durationInFrames) : durationInFrames + 1;
        if (frame < f0 || frame >= f1 + 6) return null;
        const out = t.until !== undefined ? 1 - progress(frame, f1, 6) : 1;
        const p = progress(frame, f0, 10);
        // hero: 80% -> 110% -> 100%; stamp: 130% -> 100%
        const scale =
          t.style === 'stamp'
            ? interpolate(frame - f0, [0, 7], [1.3, 1], {extrapolateRight: 'clamp', easing: EASE_OUT})
            : t.style === 'sub' || t.style === 'count'
              ? 1
              : interpolate(frame - f0, [0, 6, 12], [0.8, 1.1, 1], {extrapolateRight: 'clamp'});
        const y = ctx.safe.y + ctx.safe.h * Math.min(1, Math.max(0, ((t.y ?? 0.5) * H - ctx.safe.y) / ctx.safe.h));
        let content: React.ReactNode = t.text;
        if (t.style === 'count' && t.value !== undefined) {
          const v = interpolate(frame, [f0, f0 + 24], [0, t.value], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE_OUT});
          content = `${v.toLocaleString('en-US', {minimumFractionDigits: t.decimals ?? 0, maximumFractionDigits: t.decimals ?? 0})}${t.text}`;
        }
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: ctx.safe.x,
              width: ctx.safe.w,
              top: y,
              transform: `translateY(-50%) scale(${scale})`,
              textAlign: 'center',
              opacity: p * out,
              ...textStyle(t.style === 'count' ? 'hero' : t.style, t.tone),
            }}
          >
            {/* Over photos and archival maps, text gets a dark panel for legibility. */}
            {d.background ? (
              <span style={{background: 'rgba(8, 11, 15, 0.78)', padding: t.style === 'sub' ? `${8 * unit}px ${16 * unit}px` : `${4 * unit}px ${22 * unit}px ${0}px`, boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone', lineHeight: t.style === 'sub' ? 2.1 : 1.15}}>{content}</span>
            ) : (
              content
            )}
          </div>
        );
      })}
      {guides ? <SafeZoneGuides regions={regionsFor(ctx)} /> : null}
    </AbsoluteFill>
  );
};

export const AtlasScene: SceneDefinition<AtlasData> = {
  component: AtlasView,
  regions: (ctx) => regionsFor(ctx),
  // Overlay texts are short (1–5 words) and centred; size is checked against the safe width.
  textBlocks: (ctx, d) =>
    (d.texts ?? [])
      .filter((t) => t.style !== 'sub')
      .slice(0, 1)
      .map((t) => ({region: 'text', text: t.text, fontSize: Math.round(ctx.type.display * (t.style === 'stamp' ? 0.95 : 1.35) * 0.62), lineHeight: 0.95})),
  assetRefs: (d) => (d.background ? [d.background] : []),
  cues: (d) =>
    [
      ...(d.camera ?? []).map((k) => k.at),
      ...(d.gold ?? []).map((g) => g.at),
      ...(d.warm ?? []).map((g) => g.at),
      d.fade?.at,
      ...(d.outline ?? []).map((g) => g.at),
      ...(d.pulse ?? []).map((g) => g.at),
      ...(d.labels ?? []).map((g) => g.at),
      ...(d.texts ?? []).flatMap((t) => [t.at, t.until]),
      ...(d.shake ?? []),
    ].filter((v): v is string => typeof v === 'string'),
};
