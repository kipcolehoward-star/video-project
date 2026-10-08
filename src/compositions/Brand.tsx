/**
 * Channel identity for "Checkpoint Geo & History": logo (profile picture)
 * and banner. Independent of any video project. Sizes come from
 * BRAND_SIZES (platform specs); render with `npm run brand`.
 *
 * Mark: a globe with a gold map pin carrying a check mark: "checkpoint"
 * (a marked place) on the world (geo) — readable down to the 98 px avatar.
 */
import {geoEqualEarth, geoGraticule10, geoOrthographic, geoPath} from 'd3-geo';
import React from 'react';
import {AbsoluteFill} from 'remotion';
import {feature} from 'topojson-client';
import type {Topology} from 'topojson-specification';
import land110 from 'world-atlas/land-110m.json';
import land50 from 'world-atlas/land-50m.json';
import {loadProjectFonts} from '../config/fonts';

loadProjectFonts();

export const BRAND = {
  navy: '#0f1e2e',
  sea: '#16324b',
  land: '#e9e2d0',
  landDim: '#26405a',
  cream: '#f3eee4',
  gold: '#e8b04a',
  ink: '#0f1e2e',
  display: '"Bebas Neue", "Anton", sans-serif',
  body: '"Inter Variable", "Segoe UI", sans-serif',
};

const topo = (t: unknown) => t as Topology;
const LAND110 = feature(topo(land110), topo(land110).objects.land);
const LAND50 = feature(topo(land50), topo(land50).objects.land);
const GRATICULE = geoGraticule10();

/** Map pin with a check mark; (x, y) is the pin's tip, h its height. */
const CheckPin: React.FC<{x: number; y: number; h: number; stroke?: number}> = ({x, y, h, stroke = 0}) => {
  const r = h * 0.36; // head radius
  const cy = y - h + r; // head centre
  // Teardrop: arcs around the head, straight sides meeting at the tip.
  const a = Math.asin(r / (y - cy)); // tangent angle
  const lx = x - r * Math.cos(a);
  const ly = cy + r * Math.sin(a);
  const rx = x + r * Math.cos(a);
  const d = `M${x},${y} L${lx},${ly} A${r},${r} 0 1 1 ${rx},${ly} Z`;
  const s = r * 0.5; // check mark size
  return (
    <g>
      <path d={d} fill={BRAND.gold} stroke={BRAND.navy} strokeWidth={stroke} strokeLinejoin="round" />
      <path
        d={`M${x - s * 0.95},${cy + s * 0.05} L${x - s * 0.25},${cy + s * 0.72} L${x + s * 1.0},${cy - s * 0.62}`}
        fill="none"
        stroke={BRAND.navy}
        strokeWidth={r * 0.26}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
};

export const BrandLogo: React.FC = () => {
  const S = 800;
  const R = 268;
  const cx = S / 2 - 30;
  const cy = S / 2 + 30;
  const proj = geoOrthographic().rotate([-20, -18]).translate([cx, cy]).scale(R).clipAngle(90);
  const path = geoPath(proj);
  return (
    <AbsoluteFill style={{background: BRAND.navy}}>
      <svg width={S} height={S}>
        <path d={path({type: 'Sphere'}) ?? undefined} fill={BRAND.sea} />
        <path d={path(GRATICULE) ?? undefined} fill="none" stroke={BRAND.cream} strokeOpacity={0.16} strokeWidth={3} />
        <path d={path(LAND110) ?? undefined} fill={BRAND.land} />
        <path d={path({type: 'Sphere'}) ?? undefined} fill="none" stroke={BRAND.cream} strokeWidth={16} />
        <CheckPin x={cx + 150} y={cy - 40} h={330} stroke={18} />
      </svg>
    </AbsoluteFill>
  );
};

/** Places a channel like this keeps coming back to: straits, canals, frontiers, divided cities. */
const PINS: [number, number][] = [
  [-5.6, 36.0], // Gibraltar
  [29.0, 41.0], // Bosporus
  [32.5, 30.0], // Suez
  [56.4, 26.5], // Hormuz
  [101.5, 2.6], // Malacca
  [-79.7, 9.1], // Panama
  [13.39, 52.51], // Berlin (Checkpoint Charlie)
  [71.1, 34.1], // Khyber Pass
  [18.5, -34.4], // Cape of Good Hope
  [-70.0, -54.5], // Strait of Magellan
  [126.9, 37.9], // Korean DMZ
  [-169.0, 65.8], // Bering Strait
];

export const BrandBanner: React.FC = () => {
  const W = 2560;
  const H = 1440;
  const proj = geoEqualEarth().fitExtent([[60, 120], [W - 60, H - 60]], {type: 'Sphere'});
  const path = geoPath(proj);
  // YouTube's always-visible area (all devices): 1546 x 423, centred.
  const safe = {x: (W - 1546) / 2, y: (H - 423) / 2, w: 1546, h: 423};
  return (
    <AbsoluteFill style={{background: BRAND.navy}}>
      <svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
        <path d={path({type: 'Sphere'}) ?? undefined} fill={BRAND.sea} />
        <path d={path(GRATICULE) ?? undefined} fill="none" stroke={BRAND.cream} strokeOpacity={0.07} strokeWidth={2} />
        <path d={path(LAND50) ?? undefined} fill={BRAND.landDim} stroke={BRAND.cream} strokeOpacity={0.12} strokeWidth={1.5} />
        <path d={path({type: 'Sphere'}) ?? undefined} fill="none" stroke={BRAND.cream} strokeOpacity={0.25} strokeWidth={3} />
        {PINS.map(([lon, lat], i) => {
          const p = proj([lon, lat]);
          return p ? <CheckPin key={i} x={p[0]} y={p[1]} h={58} stroke={4} /> : null;
        })}
      </svg>
      {/* Legibility panel behind the title: a soft navy plate, not decoration. */}
      <div
        style={{
          position: 'absolute',
          left: safe.x - 40,
          top: safe.y - 10,
          width: safe.w + 80,
          height: safe.h + 20,
          background: 'rgba(15,30,46,0.82)',
          borderRadius: 18,
          boxShadow: '0 0 80px 40px rgba(15,30,46,0.82)',
        }}
      />
      <div style={{position: 'absolute', left: safe.x, top: safe.y, width: safe.w, height: safe.h, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 34}}>
          <svg width={120} height={170} viewBox="0 0 120 170">
            <CheckPin x={60} y={164} h={160} stroke={0} />
          </svg>
          <div style={{fontFamily: BRAND.display, fontSize: 250, lineHeight: 0.86, color: BRAND.cream, letterSpacing: '0.02em'}}>CHECKPOINT</div>
        </div>
        <div style={{fontFamily: BRAND.body, fontWeight: 700, fontSize: 54, letterSpacing: '0.42em', color: BRAND.gold, marginRight: '-0.42em'}}>GEO &amp; HISTORY</div>
        <div style={{fontFamily: BRAND.body, fontWeight: 500, fontSize: 30, letterSpacing: '0.2em', color: BRAND.cream, opacity: 0.7, marginTop: 14, marginRight: '-0.2em'}}>
          MAPS · BORDERS · THE STORIES BEHIND THEM
        </div>
      </div>
    </AbsoluteFill>
  );
};
