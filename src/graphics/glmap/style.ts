/**
 * MapLibre style for the glmap scene, built only from local data: Natural
 * Earth land (copied into the project's geo/ folder) and, with `terrain`,
 * elevation tiles in geo/terrain/ (see terrain.ts). No token, no network.
 */
import type {ExpressionSpecification, LayerSpecification, SourceSpecification, StyleSpecification} from 'maplibre-gl';
import type {FC} from '../geo/data';
import {TERRAIN_MAX_ZOOM, TERRAIN_ZOOMS} from './terrain';

export const GL_PALETTES = {
  // Deep teal sea, muted land, pale coastline: a calm documentary night map.
  teal: {
    sea: '#0d2b35', shelf: '#1f5866', land: '#2c3630', coast: 'rgba(216,228,214,0.6)',
    gold: '#e8b04a', white: '#f4efe2', red: '#e0533f', ship: '#f4efe2', orange: '#f08a3c', blue: '#3fa7e0',
    ink: '#f1ede6', water: 'rgba(168,214,224,0.9)', halo: 'rgba(6,20,26,0.75)',
    // terrain: sea colour by depth (m, deepest first) and land tint by height (m), both muted
    depth: [[-6000, '#071c25'], [-3000, '#0a2631'], [-1000, '#0d2f3b'], [-200, '#123c4a'], [-60, '#185062'], [-15, '#1f6273'], [-1, '#2a7282']],
    tint: [[0, '#2f3b31'], [150, '#34422f'], [500, '#404731'], [1000, '#4e4c37'], [1800, '#5c5644'], [3000, '#6c6659']],
  },
  // Lifted navy sea and grey-green land, matching the atlas "dusk" palette.
  dusk: {
    sea: '#16344f', shelf: '#2a5c86', land: '#3b4740', coast: 'rgba(255,255,255,0.55)',
    gold: '#e8b04a', white: '#ffffff', red: '#e0533f', ship: '#ffffff', orange: '#f08a3c', blue: '#3fa7e0',
    ink: '#ffffff', water: 'rgba(190,220,240,0.9)', halo: 'rgba(10,22,34,0.75)',
    depth: [[-6000, '#0e2236'], [-3000, '#122b44'], [-1000, '#16344f'], [-200, '#1d4466'], [-60, '#25567e'], [-15, '#2e6690'], [-1, '#3a75a0']],
    // Above 3,000 m: bare rock, then snow (the ramp used to stop at 3,000 m, leaving the Himalayas uncoloured).
    tint: [[0, '#3b4740'], [150, '#414d3e'], [500, '#4c5240'], [1000, '#585746'], [1800, '#656053'], [3000, '#747066'], [4300, '#86786a'], [5100, '#968d84'], [5900, '#d3d6da'], [6800, '#f4f6f8']],
  },
} as const;
export type GlPaletteName = keyof typeof GL_PALETTES;
export type GlPalette = (typeof GL_PALETTES)[GlPaletteName];

export interface GlTerrain {
  /** Tile URL template ending in /{z}/{x}/{y}.png (absolute: MapLibre fetches tiles in a worker). */
  tiles: string;
  bounds: [number, number, number, number];
  /** Hillshade strength 0–1 (0 = no shading). */
  relief: number;
  tint: boolean;
  depth: boolean;
}

const ramp = (stops: readonly (readonly [number, string])[], below: string | null, above: string | null): ExpressionSpecification => {
  const flat: (number | string)[] = [];
  if (below) flat.push(stops[0][0] - 1, below);
  for (const [v, c] of stops) flat.push(v, c);
  if (above) flat.push(stops[stops.length - 1][0] + 1, above);
  return ['interpolate', ['linear'], ['elevation'], ...flat] as unknown as ExpressionSpecification;
};
const CLEAR = 'rgba(0,0,0,0)';

/** Satellite imagery under everything (imagery.ts): tile URL template, the plan's zooms and bounds, colour grade. */
export interface GlImagery {
  tiles: string;
  bounds: [number, number, number, number];
  minzoom: number;
  maxzoom: number;
  /** -1..1 adjustments on top of the source colours. */
  saturation: number;
  contrast: number;
  brightness: number;
}

/**
 * Sea by depth under satellite imagery: EOX's imagery has real water only in a
 * strip along the coasts and a flat blue beyond it, which leaves a visible band;
 * the depth data replaces both with one bathymetric sea. It stops at -3 m: land
 * slightly below sea level (the Vistula delta, the Netherlands) keeps its imagery.
 */
const SATELLITE_DEPTH = [[-6000, '#06203f'], [-2000, '#0a2d57'], [-500, '#0f3c6f'], [-150, '#164f88'], [-50, '#1d609b'], [-15, '#2a72ab'], [-3, '#3a84b8']] as const;

/** Colours a highlight or link may use. */
export const GL_ACCENTS = ['red', 'gold', 'orange', 'blue', 'white'] as const;
export type GlAccent = (typeof GL_ACCENTS)[number];

/**
 * A region that lights up on a beat (kinetic style). Its layers start fully
 * transparent; the scene animates their opacity and glow width every frame
 * (highlightPaint), so MapLibre draws the shape exactly, under any tilt.
 */
export interface GlHighlight {
  shape: FC;
  color: string;
}

export const highlightLayers = (i: number) => ({glow: `hl-${i}-glow`, fill: `hl-${i}-fill`, line: `hl-${i}-line`});

export function glStyle(land: FC, p: GlPalette, terrain?: GlTerrain, highlights: GlHighlight[] = [], imagery?: GlImagery): StyleSpecification {
  const sources: Record<string, SourceSpecification> = {
    // Lower simplification than the default (0.375) keeps coastlines close to the data.
    land: {type: 'geojson', data: land, tolerance: 0.2},
  };
  if (terrain) {
    sources.dem = {type: 'raster-dem', tiles: [terrain.tiles], tileSize: 256, encoding: 'terrarium', minzoom: TERRAIN_ZOOMS[0], maxzoom: TERRAIN_MAX_ZOOM, bounds: terrain.bounds};
    // Sea depth reads the same tiles but only up to zoom 6, about the seabed data's own detail (ETOPO1, 1 arc-minute).
    // The finer sea tiles add speckle, and depth values differ slightly between zoom levels, which drew a straight
    // colour seam where a tilted view switches from one level to the next.
    sources.demSea = {...sources.dem, maxzoom: 6};
  }
  const layers: LayerSpecification[] = [{id: 'sea', type: 'background', paint: {'background-color': p.sea}}];
  if (imagery) {
    // The picture replaces the drawn sea, shelf and land; only borders and coasts are drawn over it.
    sources.imagery = {type: 'raster', tiles: [imagery.tiles], tileSize: 256, minzoom: imagery.minzoom, maxzoom: imagery.maxzoom, bounds: imagery.bounds};
    const b = imagery.brightness;
    layers.push({
      id: 'imagery',
      type: 'raster',
      source: 'imagery',
      paint: {
        'raster-fade-duration': 0,
        'raster-resampling': 'linear',
        'raster-saturation': imagery.saturation,
        'raster-contrast': imagery.contrast,
        'raster-brightness-min': Math.max(0, b),
        'raster-brightness-max': Math.min(1, 1 + b),
      },
    });
  }
  if (!imagery && !terrain?.depth) {
    // Without depth data: a wide, fully blurred line along every coast suggests shallow water; the land fill covers its inner half.
    layers.push({
      id: 'shelf',
      type: 'line',
      source: 'land',
      layout: {'line-join': 'round'},
      paint: {
        'line-color': p.shelf,
        'line-width': ['interpolate', ['exponential', 2], ['zoom'], 4, 4, 8, 64],
        'line-blur': ['interpolate', ['exponential', 2], ['zoom'], 4, 4, 8, 64],
        'line-opacity': 0.6,
      },
    });
  }
  if (!imagery) layers.push({id: 'land', type: 'fill', source: 'land', paint: {'fill-color': p.land}});
  if (terrain?.tint && !imagery) {
    // Land tinted by height over the flat land fill; sea values are transparent.
    layers.push({id: 'tint', type: 'color-relief', source: 'dem', paint: {'color-relief-color': ramp(p.tint, CLEAR, null)}});
  }
  if (terrain && terrain.relief > 0) {
    // Light from the north-west, the cartographic convention, so ridges read as raised rather than carved.
    layers.push({
      id: 'relief',
      type: 'hillshade',
      source: 'dem',
      paint: {
        'hillshade-exaggeration': terrain.relief,
        'hillshade-illumination-direction': 315,
        'hillshade-shadow-color': 'rgba(0,0,0,0.6)',
        'hillshade-highlight-color': 'rgba(255,244,226,0.22)',
        'hillshade-accent-color': 'rgba(0,0,0,0.3)',
      },
    });
  }
  if (terrain?.depth) {
    // Real depth: shallow water lighter, deep water darker; land heights are transparent. Drawn after the
    // relief so it covers most of the seabed shading, which shows the same speckle and seams. 10% lets the deep ridges show.
    // Over imagery it is fully opaque, so none of the imagery's sea shows.
    layers.push({
      id: 'depth',
      type: 'color-relief',
      source: 'demSea',
      // Over imagery it fades out from map zoom 7.5 to 9: the seabed data is too coarse for a city view (it drew
      // blobs over lagoons and river mouths), and that close the imagery's own water near the coast is real.
      paint: {'color-relief-color': ramp(imagery ? SATELLITE_DEPTH : p.depth, null, CLEAR), 'color-relief-opacity': imagery ? ['interpolate', ['linear'], ['zoom'], 7.5, 1, 9, 0] : 0.9},
    });
  }
  layers.push({
    id: 'coast',
    type: 'line',
    source: 'land',
    layout: {'line-join': 'round'},
    paint: imagery
      ? {'line-color': 'rgba(255,255,255,0.5)', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.7, 8, 1.6]}
      : {'line-color': p.coast, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.6, 8, 1.4]},
  });
  highlights.forEach((h, i) => {
    const id = highlightLayers(i);
    sources[`hl-${i}`] = {type: 'geojson', data: h.shape, tolerance: 0.2};
    // A wide blurred line under the fill is the glow; the crisp line on top is the outline.
    layers.push({id: id.glow, type: 'line', source: `hl-${i}`, layout: {'line-join': 'round'}, paint: {'line-color': h.color, 'line-width': 0, 'line-blur': 0, 'line-opacity': 0}});
    layers.push({id: id.fill, type: 'fill', source: `hl-${i}`, paint: {'fill-color': h.color, 'fill-opacity': 0}});
    layers.push({id: id.line, type: 'line', source: `hl-${i}`, layout: {'line-join': 'round'}, paint: {'line-color': '#ffffff', 'line-width': 2, 'line-opacity': 0}});
  });
  return {version: 8, sources, layers};
}
