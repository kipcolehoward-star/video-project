import {geoAlbersUsa, geoNaturalEarth1, geoPath, type GeoProjection} from 'd3-geo';
import type {Feature, FeatureCollection, Geometry} from 'geojson';
import React, {useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {feature} from 'topojson-client';
import type {GeometryCollection, Topology} from 'topojson-specification';
import usTopo from 'us-atlas/states-10m.json';
import worldTopo from 'world-atlas/countries-110m.json';
import {progress, riseIn} from '../animations/motion';
import {Region} from '../components/Region';
import {SafeZoneGuides} from '../components/SafeZoneGuides';
import {Body, Headline, Kicker} from '../components/Typography';
import {splitLayout, stackLayout, type LayoutContext, type Rect} from '../layouts/engine';
import {useCue, useLayout, useShowGuides, useTheme} from '../layouts/ProjectContext';
import type {SceneDefinition, SceneProps} from './types';

/**
 * Maps from public-domain data (Natural Earth via world-atlas; US Census via
 * us-atlas). Highlights and markers reveal on narration cues.
 *   view "world": countries by Natural Earth name ("United States of America").
 *   view "usa":   states by name ("Alabama"), Albers USA projection.
 * Places too small to draw at map scale are markers (lon/lat), not shapes.
 */
export interface MapData {
  view: 'world' | 'usa';
  layout?: 'split' | 'full';
  kicker?: string;
  heading?: string;
  body?: string;
  highlight?: {name: string; cue?: string; label?: string}[];
  markers?: {label: string; lon: number; lat: number; cue?: string; labelSide?: 'left' | 'right'}[];
}

type Props = {name: string};
const WORLD = feature(worldTopo as unknown as Topology, (worldTopo as unknown as Topology).objects.countries as GeometryCollection<Props>) as FeatureCollection<Geometry, Props>;
const USA = feature(usTopo as unknown as Topology, (usTopo as unknown as Topology).objects.states as GeometryCollection<Props>) as FeatureCollection<Geometry, Props>;

function layoutFor(ctx: LayoutContext, d: MapData) {
  if (d.layout === 'full') {
    const {regions} = stackLayout(ctx, {heading: Boolean(d.heading || d.kicker)});
    // The map uses the full width under the heading, not the reading measure.
    return {mapRect: {...regions.body, w: ctx.safe.w}, textRect: regions.heading ?? null, regions: {...regions, body: {...regions.body, w: ctx.safe.w, role: 'media' as const}}};
  }
  const {regions} = splitLayout(ctx);
  return {mapRect: regions.media as Rect, textRect: regions.text as Rect, regions};
}

const MapView: React.FC<SceneProps<MapData>> = ({scene, durationInFrames}) => {
  const frame = useCurrentFrame();
  const ctx = useLayout();
  const theme = useTheme();
  const guides = useShowGuides();
  const cueAt = useCue(scene);
  const d = scene.data;
  const {mapRect, textRect, regions} = layoutFor(ctx, d);
  const pad = ctx.gutter;

  const {projection, path, features} = useMemo(() => {
    const fc = d.view === 'usa' ? USA : WORLD;
    // Antarctica adds nothing here and wastes vertical space.
    const shown = d.view === 'world' ? {...fc, features: fc.features.filter((f) => f.properties.name !== 'Antarctica')} : fc;
    const proj: GeoProjection = (d.view === 'usa' ? geoAlbersUsa() : geoNaturalEarth1()) as GeoProjection;
    proj.fitExtent(
      [
        [pad, pad],
        [mapRect.w - pad, mapRect.h - pad],
      ],
      shown,
    );
    return {projection: proj, path: geoPath(proj), features: shown.features};
  }, [d.view, mapRect.w, mapRect.h, pad]);

  const base = progress(frame, 0, 18);
  const step = durationInFrames / ((d.highlight?.length ?? 0) + (d.markers?.length ?? 0) + 2);
  const hi = new Map((d.highlight ?? []).map((h, i) => [h.name, {...h, at: cueAt(h.cue, Math.round(step * (i + 1)))}]));
  const markerStart = (d.highlight?.length ?? 0) + 1;
  const rise = 24 * ctx.unit;
  const labelSize = Math.round(ctx.type.label * 1.05);

  return (
    <AbsoluteFill style={{background: theme.background}}>
      <div style={{position: 'absolute', left: mapRect.x, top: mapRect.y, width: mapRect.w, height: mapRect.h, overflow: 'hidden', opacity: base}}>
        <svg width={mapRect.w} height={mapRect.h}>
          {features.map((f: Feature<Geometry, Props>, i) => {
            const h = hi.get(f.properties.name);
            const p = h ? progress(frame, h.at, 14) : 0;
            return (
              <path
                key={i}
                d={path(f) ?? undefined}
                fill={h && p > 0 ? theme.accent : theme.mapLand}
                fillOpacity={h && p > 0 ? 0.25 + 0.75 * p : 1}
                stroke={theme.background}
                strokeWidth={Math.max(0.5, 0.8 * ctx.unit)}
              />
            );
          })}
          {/* Labels for highlighted shapes, at their centroid. */}
          {[...hi.values()].map((h) => {
            const f = features.find((x) => x.properties.name === h.name);
            if (!f || !h.label) return null;
            const [x, y] = path.centroid(f);
            return (
              <text key={h.name} x={x} y={y} textAnchor="middle" dominantBaseline="middle" opacity={progress(frame, h.at + 6, 12)} fill={theme.text} style={{fontFamily: theme.fonts.body, fontSize: labelSize, fontWeight: 600, paintOrder: 'stroke', stroke: theme.background, strokeWidth: 4 * ctx.unit}}>
                {h.label}
              </text>
            );
          })}
          {(d.markers ?? []).map((m, i) => {
            const pt = projection([m.lon, m.lat]);
            if (!pt) return null;
            const at = cueAt(m.cue, Math.round(step * (markerStart + i)));
            const p = progress(frame, at, 14);
            const pulse = progress(frame, at, 30);
            const left = m.labelSide === 'left';
            return (
              <g key={m.label} opacity={p}>
                <circle cx={pt[0]} cy={pt[1]} r={(8 + 26 * pulse) * ctx.unit} fill="none" stroke={theme.accent} strokeWidth={2 * ctx.unit} opacity={1 - pulse} />
                {/* Light dot with dark edge: reads on land, sea and highlighted (accent) shapes. */}
                <circle cx={pt[0]} cy={pt[1]} r={8 * ctx.unit} fill={theme.text} stroke={theme.background} strokeWidth={3 * ctx.unit} />
                <text x={pt[0] + (left ? -16 : 16) * ctx.unit} y={pt[1]} textAnchor={left ? 'end' : 'start'} dominantBaseline="middle" fill={theme.text} style={{fontFamily: theme.fonts.body, fontSize: labelSize, fontWeight: 600, paintOrder: 'stroke', stroke: theme.background, strokeWidth: 4 * ctx.unit}}>
                  {m.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {textRect ? (
        <Region rect={textRect} justify={d.layout === 'full' ? 'end' : 'center'}>
          {d.kicker ? <Kicker style={riseIn(frame, 4, rise)}>{d.kicker}</Kicker> : null}
          {d.heading ? (
            <Headline size={d.layout === 'full' ? 'h1' : 'h1'} style={riseIn(frame, 8, rise)}>
              {d.heading}
            </Headline>
          ) : null}
          {d.body && d.layout !== 'full' ? <Body style={riseIn(frame, 16, rise)}>{d.body}</Body> : null}
        </Region>
      ) : null}
      {guides ? <SafeZoneGuides regions={regions} /> : null}
    </AbsoluteFill>
  );
};

export const MapScene: SceneDefinition<MapData> = {
  component: MapView,
  regions: (ctx, d) => layoutFor(ctx, d).regions,
  textBlocks: (ctx, d) => {
    const key = d.layout === 'full' ? 'heading' : 'text';
    return [
      ...(d.heading ? [{region: key, text: d.heading, fontSize: ctx.type.h1, lineHeight: 1.06}] : []),
      ...(d.body && d.layout !== 'full' ? [{region: key, text: d.body, fontSize: ctx.type.body, lineHeight: 1.45}] : []),
    ];
  },
  cues: (d) => [...(d.highlight ?? []), ...(d.markers ?? [])].flatMap((x) => (x.cue ? [x.cue] : [])),
};
