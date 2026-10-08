import {geoCentroid, geoGraticule10, geoOrthographic, geoPath} from 'd3-geo';
import type {Feature, FeatureCollection, Geometry} from 'geojson';
import React, {useMemo} from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {feature} from 'topojson-client';
import type {GeometryCollection, Topology} from 'topojson-specification';
import worldTopo from 'world-atlas/countries-50m.json';
import world110Topo from 'world-atlas/countries-110m.json';
import {SatelliteGlobe} from '../graphics/geo/Satellite';
import {routePoint, routeUpTo, sampleRoute, type LonLat} from '../graphics/geo/routes';
import {fixWinding, flagUrl, inView, usePreloadImages, useGeoLayer, visibleAngle, type FC} from '../graphics/geo/data';
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
  /**
   * Zoom multiplier in portrait frames. A portrait frame keeps the landscape
   * framing's horizontal span, so maps look far away; 1.5–1.8 fills the frame.
   */
  portraitZoom?: number;
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
    /** mega: thumbnail-size type (2.6× display) with a heavy outline. */
    style?: 'hero' | 'stamp' | 'sub' | 'count' | 'mega';
    /** For count: animate 0 → value, shown with `decimals` and `text` as suffix. */
    value?: number;
    decimals?: number;
    /** 0–1 of frame height (kept inside the safe zone). */
    y?: number;
    tone?: 'white' | 'gold';
  }[];
  shake?: At[];
  /** Map palette; defaults from the project theme (geo -> geo, paper -> paper, else atlas). */
  palette?: 'atlas' | 'geo' | 'paper' | 'dusk' | 'ocean';
  /** Second highlight colour (yellow in geo/paper). */
  alt?: {name: string; at?: At}[];
  /**
   * "satellite": NASA Blue Marble imagery at globe scale, cross-fading into the
   * vector map between zoom 1.3 and 3.2 (the imagery is soft beyond that).
   */
  basemap?: 'vector' | 'satellite';
  /** Coastline detail. auto: 110m when whole-Earth, 50m mid, 10m for close zooms. */
  detail?: 'auto' | '50m' | '10m';
  /** Extra Natural Earth layers (run npm run geo:setup once). */
  layers?: ('rivers' | 'lakes' | 'admin1' | 'disputed')[];
  /** When the extra layers fade in. */
  layersAt?: At;
  /** Limit state/province borders to these countries (Natural Earth `admin` names). */
  admin1Countries?: string[];
  /** Flag clipped inside a country's borders. iso = ISO 3166-1 alpha-2 (flag-icons). */
  flagMasks?: {name: string; iso: string; at?: At; opacity?: number}[];
  /** Round flag badge at a point or a country's centre. */
  flagBadges?: {iso: string; name?: string; lon?: number; lat?: number; at?: At; label?: string; size?: number}[];
  /**
   * Animated routes along great circles. `via` waypoints keep sea lanes off
   * land. The line draws from `at` over `duration` seconds.
   */
  routes?: {
    from: LonLat;
    to: LonLat;
    via?: LonLat[];
    at?: At;
    duration?: number;
    style?: 'solid' | 'dashed';
    color?: 'gold' | 'white' | 'red';
    arrow?: boolean;
    /** Flag badges at the ends (ISO alpha-2). */
    fromFlag?: string;
    toFlag?: string;
    label?: string;
    /** Line width multiplier (thumbnails: 2–3). */
    width?: number;
  }[];
}

type Props = {name: string};
const WORLD = fixWinding(feature(worldTopo as unknown as Topology, (worldTopo as unknown as Topology).objects.countries as GeometryCollection<Props>) as FeatureCollection<Geometry, Props>);
const WORLD110 = fixWinding(feature(world110Topo as unknown as Topology, (world110Topo as unknown as Topology).objects.countries as GeometryCollection<Props>) as FeatureCollection<Geometry, Props>);
const nameMaps = new WeakMap<object, Map<string, Feature<Geometry, Props>>>();
const nameMap = (fc: FeatureCollection<Geometry, Props>) => {
  let m = nameMaps.get(fc);
  if (!m) {
    m = new Map(fc.features.map((f) => [f.properties.name, f]));
    nameMaps.set(fc, m);
  }
  return m;
};
const GRATICULE = geoGraticule10();

/** Map palettes. `ink`/`halo` are label text and its outline; `alt` is the second highlight. */
const PALETTES = {
  atlas: {
    bg: '#080b0f', ocean: '#0b1826', land: '#1d2421', warm: '#6b645b', gold: '#e0a63a', alt: '#8fb3c9',
    border: 'rgba(255,255,255,0.18)', grid: 'rgba(255,255,255,0.07)', river: '#3f7aa6', admin1: 'rgba(255,255,255,0.16)',
    disputed: '#8e8e93', ink: '#ffffff', halo: '#080b0f', limb: 'rgba(160,190,220,0.25)',
  },
  geo: {
    bg: '#1a1d24', ocean: '#13161c', land: '#2a2f38', warm: '#4a515e', gold: '#ff3b30', alt: '#ffcc00',
    border: 'rgba(255,255,255,0.22)', grid: 'rgba(255,255,255,0.05)', river: '#4b8fd1', admin1: 'rgba(255,255,255,0.14)',
    disputed: '#8e8e93', ink: '#ffffff', halo: '#13161c', limb: 'rgba(255,255,255,0.18)',
  },
  paper: {
    bg: '#f4efea', ocean: '#d6e1e4', land: '#f4efea', warm: '#e3d5c1', gold: '#ff3b30', alt: '#ffcc00',
    border: 'rgba(60,50,40,0.35)', grid: 'rgba(60,50,40,0.08)', river: '#6f9fbf', admin1: 'rgba(60,50,40,0.25)',
    disputed: '#8e8e93', ink: '#1c1a17', halo: '#f4efea', limb: 'rgba(60,50,40,0.35)', borderW: 1.1,
  },
  // Dark like atlas, but lifted: readable land/sea contrast and clear borders.
  dusk: {
    bg: '#0c1824', ocean: '#16344f', land: '#3b4740', warm: '#7d7366', gold: '#e8b04a', alt: '#8fc1e3',
    border: 'rgba(255,255,255,0.5)', grid: 'rgba(255,255,255,0.08)', river: '#5b9bd0', admin1: 'rgba(255,255,255,0.25)',
    disputed: '#9a9aa0', ink: '#ffffff', halo: '#0c1824', limb: 'rgba(170,200,230,0.35)', borderW: 1.3,
  },
  // Classic explainer map: blue sea, light land, dark borders; overlay text stays white.
  ocean: {
    bg: '#1d4466', ocean: '#2f6c9c', land: '#e9e3d2', warm: '#d8bf8f', gold: '#f2a516', alt: '#d9473b',
    border: 'rgba(40,35,30,0.6)', grid: 'rgba(255,255,255,0.12)', river: '#2f6c9c', admin1: 'rgba(40,35,30,0.3)',
    disputed: '#a39d92', ink: '#16222e', halo: '#f4efe2', limb: 'rgba(255,255,255,0.3)', borderW: 1.3, textInk: '#ffffff',
    // routes get a dark underlay; water names are white on a blue halo
    routeHalo: 'rgba(12,28,42,0.55)', waterInk: 'rgba(255,255,255,0.9)', waterHalo: 'rgba(22,58,90,0.85)',
  },
} as const;
type PaletteName = keyof typeof PALETTES;
type Palette = (typeof PALETTES)[PaletteName] & {borderW?: number; textInk?: string; routeHalo?: string; waterInk?: string; waterHalo?: string};

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
  const PALETTE: Palette = PALETTES[(d.palette ?? (theme.id in PALETTES ? theme.id : 'atlas')) as PaletteName];
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
  const zoomK = ctx.format.orientation === 'portrait' ? (d.portraitZoom ?? 1) : 1;
  zoom *= zoomK;

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

  // ---- data: detail level by zoom, extra layers and flags load on demand
  const maxZoom = Math.max(...(d.camera ?? [{zoom: 1}]).map((k) => k.zoom)) * zoomK;
  const want10 = d.detail === '10m' || (d.detail !== '50m' && maxZoom >= 7);
  const layers = new Set(d.layers ?? []);
  const countries10 = useGeoLayer(!d.background && want10 ? 'countries-10m' : null) as unknown as FeatureCollection<Geometry, Props> | null;
  const rivers = useGeoLayer(!d.background && layers.has('rivers') ? 'rivers' : null);
  const lakes = useGeoLayer(!d.background && layers.has('lakes') ? 'lakes' : null);
  const admin1 = useGeoLayer(!d.background && layers.has('admin1') ? 'admin1' : null);
  const disputed = useGeoLayer(!d.background && layers.has('disputed') ? 'disputed' : null);
  usePreloadImages([
    ...(d.flagMasks ?? []).map((m) => flagUrl(m.iso, '4x3')),
    ...(d.flagBadges ?? []).map((b) => flagUrl(b.iso, '1x1')),
    ...(d.routes ?? []).flatMap((r) => [r.fromFlag, r.toFlag].filter((x): x is string => Boolean(x)).map((iso) => flagUrl(iso, '1x1'))),
  ]);

  const base = zoom < 1.6 ? WORLD110 : zoom >= 7 && countries10 ? countries10 : WORLD;
  const countryByName = nameMap(base);
  // Names resolve to a country first, then a disputed area, then a state/province.
  const byName = {
    get: (name: string) =>
      countryByName.get(name) ??
      (disputed ? nameMap(disputed as unknown as FeatureCollection<Geometry, Props>).get(name) : undefined) ??
      (admin1 ? nameMap(admin1 as unknown as FeatureCollection<Geometry, Props>).get(name) : undefined),
  };
  // Only draw what can be on screen (big speed-up when zoomed in).
  const farPx = Math.max(Math.hypot(W / 2, cy), Math.hypot(W / 2, H - cy));
  const vis = visibleAngle((W / 2) * zoom, farPx);
  const center: [number, number] = [lon, lat];
  const visible = <T extends Feature<Geometry, Record<string, unknown>>>(fs: T[]) => fs.filter((f) => inView(f as never, center, vis));
  // Smaller rivers and lakes appear as you zoom in.
  const rankLimit = zoom < 3 ? 3 : zoom < 8 ? 6 : 12;
  const layersP = progress(frame, at(d.layersAt, 0), 18);

  const reveal = (items: {name: string; at?: At}[] | undefined) => new Map((items ?? []).map((g) => [g.name, at(g.at, 0)]));
  const gold = reveal(d.gold);
  const alt = reveal(d.alt);
  const warm = reveal(d.warm);
  const fadeAt = d.fade ? at(d.fade.at, 0) : null;
  const fadeSet = new Set(d.fade?.names ?? []);
  const globeIn = progress(frame, 0, 14);
  const sat = d.basemap === 'satellite' && !d.background ? interpolate(zoom, [1.3, 3.2], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) : 0;

  const fillFor = (name: string) => {
    const g = gold.get(name);
    if (g !== undefined && frame >= g) return {fill: PALETTE.gold, op: 0.3 + 0.7 * progress(frame, g, 12)};
    const a2 = alt.get(name);
    if (a2 !== undefined && frame >= a2) return {fill: PALETTE.alt, op: 0.3 + 0.7 * progress(frame, a2, 12)};
    const w = warm.get(name);
    if (w !== undefined && frame >= w) return {fill: PALETTE.warm, op: 0.4 + 0.6 * progress(frame, w, 12)};
    const faded = fadeAt !== null && fadeSet.has(name) ? 1 - 0.75 * progress(frame, fadeAt, 18) : 1;
    return {fill: PALETTE.land, op: faded};
  };

  const textStyle = (style: string | undefined, tone: string | undefined): React.CSSProperties => {
    const color = tone === 'gold' ? PALETTE.gold : (PALETTE.textInk ?? PALETTE.ink);
    if (style === 'sub') return {fontFamily: theme.fonts.body, fontSize: Math.round(ctx.type.label * 1.25), fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color};
    const size = style === 'stamp' ? ctx.type.display * 0.95 : style === 'mega' ? ctx.type.display * 2.6 : ctx.type.display * 1.35;
    if (style === 'mega')
      return {fontFamily: '"Bebas Neue", "Anton", sans-serif', fontSize: Math.round(size), lineHeight: 0.9, letterSpacing: '0.01em', textTransform: 'uppercase', color, WebkitTextStroke: `${3 * unit}px rgba(0,0,0,0.85)`, paintOrder: 'stroke fill', textShadow: `0 ${6 * unit}px ${30 * unit}px rgba(0,0,0,0.75)`};
    return {fontFamily: '"Bebas Neue", "Anton", sans-serif', fontSize: Math.round(size), lineHeight: 0.95, letterSpacing: '0.01em', textTransform: 'uppercase', color, textShadow: color === '#ffffff' ? `0 ${4 * unit}px ${24 * unit}px rgba(0,0,0,0.65)` : 'none'};
  };

  return (
    <AbsoluteFill style={{background: PALETTE.bg}}>
      <AbsoluteFill style={{transform: `translate(${shakeOffset}px, ${shakeOffset * 0.4}px)`}}>
        {d.background ? (
          <div style={{position: 'absolute', inset: 0, filter: d.tint === 'parchment' ? 'sepia(0.7) saturate(1.25) contrast(1.05) brightness(0.95)' : undefined}}>
            <Backdrop asset={d.background} durationInFrames={durationInFrames} dim={d.tint === 'parchment' ? 0.28 : 0.35} />
          </div>
        ) : (
          <>
          {sat > 0 ? <SatelliteGlobe W={W} H={H} cx={W / 2} cy={cy} R={(W / 2) * zoom} lon={lon} lat={lat} opacity={sat * globeIn} /> : null}
          <svg width={W} height={H} style={{opacity: globeIn, position: 'absolute', left: 0, top: 0}}>
            <path d={path({type: 'Sphere'}) ?? undefined} fill={PALETTE.ocean} fillOpacity={1 - sat} stroke={PALETTE.limb} strokeWidth={2 * unit} />
            {d.grid !== false ? <path d={path(GRATICULE) ?? undefined} fill="none" stroke={PALETTE.grid} strokeWidth={1 * unit} opacity={1 - sat} /> : null}
            {visible(base.features).map((f: Feature<Geometry, Props>, i) => {
              const {fill, op} = fillFor(f.properties.name);
              const dd = path(f);
              // Over satellite imagery, plain land is transparent; highlights stay (slightly see-through).
              const plain = fill === PALETTE.land;
              const fo = plain ? op * (1 - sat) : op * (1 - 0.35 * sat);
              return dd ? <path key={i} d={dd} fill={fill} fillOpacity={fo} stroke={sat > 0.5 ? 'rgba(255,255,255,0.35)' : PALETTE.border} strokeWidth={(PALETTE.borderW ?? 0.8) * unit} /> : null;
            })}
            {/* Lakes (cut out of the land), province borders, rivers, disputed areas. */}
            {lakes ? (
              <g opacity={layersP}>
                {visible((lakes as FC).features)
                  .filter((f) => Number(f.properties.scalerank ?? 0) <= rankLimit)
                  .map((f, i) => {
                    const dd = path(f);
                    return dd ? <path key={i} d={dd} fill={PALETTE.ocean} stroke="none" /> : null;
                  })}
              </g>
            ) : null}
            {admin1 ? (
              <g opacity={layersP}>
                {visible((admin1 as FC).features)
                  .filter((f) => !d.admin1Countries || d.admin1Countries.includes(String(f.properties.admin)))
                  .map((f, i) => {
                    const dd = path(f);
                    return dd ? <path key={i} d={dd} fill="none" stroke={PALETTE.admin1} strokeWidth={0.9 * unit} strokeLinejoin="round" /> : null;
                  })}
              </g>
            ) : null}
            {rivers ? (
              <g opacity={layersP} fill="none" stroke={PALETTE.river} strokeLinecap="round" strokeLinejoin="round">
                {visible((rivers as FC).features)
                  .filter((f) => Number(f.properties.scalerank ?? 0) <= rankLimit)
                  .map((f, i) => {
                    const dd = path(f);
                    const w = Math.max(0.6, 2.2 - 0.2 * Number(f.properties.scalerank ?? 0)) * unit;
                    return dd ? <path key={i} d={dd} strokeWidth={w} /> : null;
                  })}
              </g>
            ) : null}
            {disputed ? (
              <g opacity={layersP}>
                {visible((disputed as FC).features).map((f, i) => {
                  const dd = path(f);
                  return dd ? <path key={i} d={dd} fill="rgba(142,142,147,0.16)" stroke={PALETTE.disputed} strokeWidth={2 * unit} strokeDasharray={`${8 * unit} ${6 * unit}`} /> : null;
                })}
              </g>
            ) : null}
            {/* Flags clipped inside country borders. */}
            {(d.flagMasks ?? []).map((m, i) => {
              const f = byName.get(m.name);
              const dd = f ? path(f) : null;
              if (!f || !dd) return null;
              const [[bx0, by0], [bx1, by1]] = path.bounds(f);
              // Fit the flag to the part of the country that is on screen, so a big
              // country seen up close still shows its whole flag.
              const x0 = Math.max(bx0, 0);
              const y0 = Math.max(by0, 0);
              const x1 = Math.min(bx1, W);
              const y1 = Math.min(by1, H);
              // Cover the country's box at the flag's own 4:3 ratio (Chrome ignores
              // preserveAspectRatio="slice" for SVG images, which would leave gaps).
              const k = Math.max((x1 - x0) / 4, (y1 - y0) / 3);
              const fw = 4 * k;
              const fh = 3 * k;
              const fx = (x0 + x1) / 2 - fw / 2;
              const fy = (y0 + y1) / 2 - fh / 2;
              const p = progress(frame, at(m.at, 0), 16);
              const id = `flagmask-${scene.id}-${i}`;
              return (
                <g key={id} opacity={p * (m.opacity ?? 0.85)}>
                  <clipPath id={id}>
                    <path d={dd} />
                  </clipPath>
                  <image href={flagUrl(m.iso, '4x3')} x={fx} y={fy} width={Math.max(1, fw)} height={Math.max(1, fh)} preserveAspectRatio="none" clipPath={`url(#${id})`} />
                  <path d={dd} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth={2 * unit} />
                </g>
              );
            })}
            {/* Borders that draw themselves. */}
            {(d.outline ?? []).map((o) => {
              const f = byName.get(o.name);
              const dd = f ? path(f) : null;
              if (!dd) return null;
              const p = progress(frame, at(o.at, 0), 28, EASE_OUT);
              return <path key={o.name} d={dd} fill="none" stroke={o.color === 'gold' ? PALETTE.gold : PALETTE.ink} strokeWidth={3 * unit} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} strokeLinejoin="round" />;
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
            {/* Routes: great-circle lines that draw themselves, arrowhead at the tip. */}
            {(d.routes ?? []).map((r, i) => {
              const sampled = sampleRoute([r.from, ...(r.via ?? []), r.to]);
              const f0 = at(r.at, 0);
              const len = Math.round((r.duration ?? 2.5) * fps);
              const t = interpolate(frame, [f0, f0 + len], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE_IN_OUT});
              if (frame < f0) return null;
              const color = r.color === 'white' ? (PALETTE.textInk ?? PALETTE.ink) : r.color === 'red' ? '#ff3b30' : PALETTE.gold;
              const drawn = routeUpTo(sampled, t);
              const dd = path({type: 'LineString', coordinates: drawn});
              const tip = projection(drawn[drawn.length - 1]);
              const prev = drawn.length > 1 ? projection(drawn[Math.max(0, drawn.length - 3)]) : null;
              const ang = tip && prev ? Math.atan2(tip[1] - prev[1], tip[0] - prev[0]) : 0;
              const ah = 16 * unit;
              const mid = r.label ? projection(routePoint(sampled, 0.5)) : null;
              const badge = (iso: string, pt: [number, number] | null, show: number, key: string) => {
                if (!pt || show <= 0) return null;
                const rr = 26 * unit * (0.6 + 0.4 * show);
                const id = `route-${scene.id}-${i}-${key}`;
                return (
                  <g key={key} opacity={show}>
                    <circle cx={pt[0]} cy={pt[1] + 3 * unit} r={rr + 3 * unit} fill="rgba(0,0,0,0.45)" />
                    <clipPath id={id}>
                      <circle cx={pt[0]} cy={pt[1]} r={rr} />
                    </clipPath>
                    <image href={flagUrl(iso, '1x1')} x={pt[0] - rr} y={pt[1] - rr} width={2 * rr} height={2 * rr} preserveAspectRatio="none" clipPath={`url(#${id})`} />
                    <circle cx={pt[0]} cy={pt[1]} r={rr} fill="none" stroke="#ffffff" strokeWidth={3 * unit} />
                  </g>
                );
              };
              return (
                <g key={`route-${i}`}>
                  {dd ? (
                    <>
                      {/* soft dark underlay keeps the line readable over any land colour */}
                      {/* halo in the palette's background tone: dark on dark maps, light on paper */}
                      <path d={dd} fill="none" stroke={PALETTE.routeHalo ?? PALETTE.halo} strokeOpacity={PALETTE.routeHalo ? 1 : 0.7} strokeWidth={9 * unit * (r.width ?? 1)} strokeLinecap="round" strokeLinejoin="round" />
                      <path d={dd} fill="none" stroke={color} strokeWidth={4.5 * unit * (r.width ?? 1)} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={r.style === 'dashed' ? `${12 * unit} ${9 * unit}` : undefined} />
                    </>
                  ) : null}
                  {r.arrow !== false && tip && t < 1 ? (
                    <polygon
                      points={`${tip[0] + Math.cos(ang) * ah},${tip[1] + Math.sin(ang) * ah} ${tip[0] + Math.cos(ang + 2.5) * ah},${tip[1] + Math.sin(ang + 2.5) * ah} ${tip[0] + Math.cos(ang - 2.5) * ah},${tip[1] + Math.sin(ang - 2.5) * ah}`}
                      fill={color}
                      stroke={PALETTE.halo}
                      strokeWidth={1.5 * unit}
                    />
                  ) : null}
                  {r.arrow !== false && tip && t >= 1 ? <circle cx={tip[0]} cy={tip[1]} r={7 * unit} fill={color} stroke={PALETTE.halo} strokeWidth={2 * unit} /> : null}
                  {r.fromFlag ? badge(r.fromFlag, projection(r.from), progress(frame, f0, 12, EASE_OUT), 'from') : null}
                  {r.toFlag ? badge(r.toFlag, projection(r.to), progress(frame, f0 + len - 4, 12, EASE_OUT), 'to') : null}
                  {mid && r.label ? (
                    <text x={mid[0]} y={mid[1] - 18 * unit} textAnchor="middle" fill={PALETTE.ink} opacity={progress(frame, f0 + len * 0.5, 12)} style={{fontFamily: theme.fonts.body, fontSize: Math.round(ctx.type.label * 1.05), fontWeight: 700, letterSpacing: '0.14em', paintOrder: 'stroke', stroke: PALETTE.halo, strokeWidth: 5 * unit}}>
                      {r.label.toUpperCase()}
                    </text>
                  ) : null}
                </g>
              );
            })}
            {/* Round flag badges with a pop-in. */}
            {(d.flagBadges ?? []).map((b, i) => {
              const f = b.name ? byName.get(b.name) : null;
              const pt = b.lon !== undefined && b.lat !== undefined ? projection([b.lon, b.lat]) : f ? projection(geoCentroid(f)) : null;
              if (!pt) return null;
              const p = progress(frame, at(b.at, 0), 14, EASE_OUT);
              if (p <= 0) return null;
              const r = (b.size ?? 34) * unit * (0.6 + 0.4 * p);
              const id = `badge-${scene.id}-${i}`;
              return (
                <g key={id} opacity={p}>
                  <circle cx={pt[0]} cy={pt[1] + 4 * unit} r={r + 3 * unit} fill="rgba(0,0,0,0.45)" />
                  <clipPath id={id}>
                    <circle cx={pt[0]} cy={pt[1]} r={r} />
                  </clipPath>
                  <image href={flagUrl(b.iso, '1x1')} x={pt[0] - r} y={pt[1] - r} width={2 * r} height={2 * r} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${id})`} />
                  <circle cx={pt[0]} cy={pt[1]} r={r} fill="none" stroke="#ffffff" strokeWidth={3 * unit} />
                  {b.label ? (
                    <text x={pt[0]} y={pt[1] + r + 22 * unit} textAnchor="middle" fill={PALETTE.ink} style={{fontFamily: theme.fonts.body, fontSize: Math.round(ctx.type.label * 1.05), fontWeight: 700, letterSpacing: '0.14em', paintOrder: 'stroke', stroke: PALETTE.halo, strokeWidth: 5 * unit}}>
                      {b.label.toUpperCase()}
                    </text>
                  ) : null}
                </g>
              );
            })}
            {(d.labels ?? []).map((l, i) => {
              const f = l.name ? byName.get(l.name) : null;
              const pt = f ? projection(geoCentroid(f)) : l.lon !== undefined && l.lat !== undefined ? projection([l.lon, l.lat]) : null;
              if (!pt) return null;
              const p = progress(frame, at(l.at, 0), 12);
              const color = l.tone === 'gold' ? PALETTE.gold : l.tone === 'muted' ? (PALETTE.waterInk ?? (PALETTE.ink === '#ffffff' ? 'rgba(255,255,255,0.55)' : 'rgba(28,26,23,0.55)')) : PALETTE.ink;
              const halo = l.tone === 'muted' && PALETTE.waterHalo ? PALETTE.waterHalo : PALETTE.halo;
              return (
                <g key={i} opacity={p}>
                  {l.lon !== undefined && l.dot !== false ? <circle cx={pt[0]} cy={pt[1]} r={7 * unit} fill={PALETTE.gold} stroke={PALETTE.halo} strokeWidth={3 * unit} /> : null}
                  <text
                    x={pt[0] + (l.lon !== undefined && l.dot !== false ? 18 * unit : 0)}
                    y={pt[1] + (l.dy ?? 0) * ctx.type.label * 1.6}
                    textAnchor={l.lon !== undefined && l.dot !== false ? 'start' : 'middle'}
                    dominantBaseline="middle"
                    fill={color}
                    style={{fontFamily: theme.fonts.body, fontSize: Math.round(ctx.type.label * 1.15), fontWeight: 700, letterSpacing: '0.14em', paintOrder: 'stroke', stroke: halo, strokeWidth: 5 * unit}}
                  >
                    {l.text.toUpperCase()}
                  </text>
                </g>
              );
            })}
          </svg>
          </>
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
            {d.background || (PALETTE.textInk && t.style === 'sub') ? (
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
      ...(d.alt ?? []).map((g) => g.at),
      ...(d.warm ?? []).map((g) => g.at),
      d.fade?.at,
      ...(d.outline ?? []).map((g) => g.at),
      ...(d.pulse ?? []).map((g) => g.at),
      ...(d.labels ?? []).map((g) => g.at),
      ...(d.texts ?? []).flatMap((t) => [t.at, t.until]),
      ...(d.shake ?? []),
      d.layersAt,
      ...(d.flagMasks ?? []).map((m) => m.at),
      ...(d.flagBadges ?? []).map((b) => b.at),
      ...(d.routes ?? []).map((r) => r.at),
    ].filter((v): v is string => typeof v === 'string'),
};
