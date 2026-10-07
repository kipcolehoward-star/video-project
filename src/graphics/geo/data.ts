/**
 * On-demand geo data for the atlas scene.
 *
 * Large layers (countries 1:10m, admin-1, rivers, lakes, disputed areas) and
 * flag SVGs are copied into the project's `geo/` folder by the render script
 * (scripts/lib/geodata.ts) and fetched here with delayRender, so a frame is
 * never captured before its data or flags are ready.
 */
import {geoArea, geoBounds, geoCentroid, geoDistance} from 'd3-geo';
import type {Feature, FeatureCollection, Geometry} from 'geojson';
import {useEffect, useState} from 'react';
import {cancelRender, continueRender, delayRender, staticFile} from 'remotion';
import {feature} from 'topojson-client';
import type {GeometryCollection, Topology} from 'topojson-specification';

export type GeoProps = Record<string, string | number | null | undefined> & {name?: string};
export type FC = FeatureCollection<Geometry, GeoProps>;

const cache = new Map<string, FC>();
const pending = new Map<string, Promise<FC>>();

function load(name: string): Promise<FC> {
  let p = pending.get(name);
  if (!p) {
    p = fetch(staticFile(`geo/${name}.json`))
      .then((r) => {
        if (!r.ok) throw new Error(`geo/${name}.json not found (HTTP ${r.status}) — run npm run geo:setup`);
        return r.json() as Promise<Topology>;
      })
      .then((topo) => {
        const key = Object.keys(topo.objects)[0];
        const fc = fixWinding(feature(topo, topo.objects[key] as GeometryCollection<GeoProps>) as unknown as FC);
        cache.set(name, fc);
        return fc;
      });
    pending.set(name, p);
  }
  return p;
}

/** Feature collection for a layer in project geo/, or null if not requested / not yet loaded. */
export function useGeoLayer(name: string | null): FC | null {
  const [handle] = useState(() => (name && !cache.has(name) ? delayRender(`geo layer ${name}`) : null));
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!name || cache.has(name)) {
      if (handle !== null) continueRender(handle);
      return;
    }
    load(name)
      .then(() => {
        setTick((t) => t + 1);
        if (handle !== null) continueRender(handle);
      })
      .catch((e) => cancelRender(e));
  }, [name, handle]);
  return name ? (cache.get(name) ?? null) : null;
}

const flagLoaded = new Set<string>();
/** Preloads flag images so SVG <image> never renders blank on the captured frame. */
export function usePreloadImages(urls: string[]) {
  const key = urls.join('|');
  const [handle] = useState(() => (urls.some((u) => !flagLoaded.has(u)) ? delayRender(`flags ${urls.length}`) : null));
  useEffect(() => {
    const todo = urls.filter((u) => !flagLoaded.has(u));
    if (!todo.length) {
      if (handle !== null) continueRender(handle);
      return;
    }
    Promise.all(
      todo.map(
        (u) =>
          new Promise<void>((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
              flagLoaded.add(u);
              resolve();
            };
            img.onerror = () => reject(new Error(`flag image failed to load: ${u}`));
            img.src = u;
          }),
      ),
    )
      .then(() => handle !== null && continueRender(handle))
      .catch((e) => cancelRender(e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, handle]);
}

export const flagUrl = (iso: string, shape: '4x3' | '1x1' = '4x3') => staticFile(`geo/flags/${shape}/${iso.toLowerCase()}.svg`);

// ---------------------------------------------------------------- culling
interface Extent {
  c: [number, number];
  r: number;
}
const extents = new WeakMap<object, Extent>();

/** Centroid + angular radius (radians) of a feature, cached. */
export function extentOf(f: Feature<Geometry, GeoProps>): Extent {
  let e = extents.get(f);
  if (!e) {
    const c = geoCentroid(f) as [number, number];
    const [[x0, y0], [x1, y1]] = geoBounds(f);
    const corners: [number, number][] = [
      [x0, y0],
      [x0, y1],
      [x1, y0],
      [x1, y1],
    ];
    const r = Math.max(...corners.map((p) => geoDistance(c, p)));
    e = {c, r: Number.isFinite(r) ? r : Math.PI};
    extents.set(f, e);
  }
  return e;
}

/**
 * Angular radius (radians) of the visible region for an orthographic view
 * centred on `center`, at globe radius `R` px, in a frame whose farthest
 * corner is `farPx` from the projection centre.
 */
export const visibleAngle = (R: number, farPx: number) => (farPx >= R ? Math.PI / 2 : Math.asin(farPx / R));

/** True when a feature may intersect the view (cheap; errs on the side of drawing). */
export function inView(f: Feature<Geometry, GeoProps>, center: [number, number], visAngle: number) {
  const e = extentOf(f);
  return geoDistance(e.c, center) - e.r < visAngle + 0.02;
}

/**
 * d3 draws polygons on the sphere: a ring with reversed winding means
 * "everything except this shape" and floods the whole view. Simplification
 * (or source data — e.g. the Maldives in Natural Earth 1:10m) can produce
 * such rings. Rewind any polygon covering more than a hemisphere; drop it if
 * that does not fix it.
 */
export function fixWinding<T extends FeatureCollection<Geometry, never> | FC>(fc: T): T {
  const H = 2 * Math.PI;
  // Fix each polygon part on its own: a MultiPolygon (e.g. an island nation)
  // can mix correct and reversed parts.
  const fixPart = (rings: number[][][]): number[][][] | null => {
    if (geoArea({type: 'Polygon', coordinates: rings}) <= H) return rings;
    const rev = rings.map((r) => [...r].reverse());
    return geoArea({type: 'Polygon', coordinates: rev}) <= H ? rev : null;
  };
  const features = (fc.features as Feature<Geometry, GeoProps>[]).flatMap((f) => {
    const g = f.geometry;
    if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon') || geoArea(f) <= H) return [f];
    if (g.type === 'Polygon') {
      const rings = fixPart(g.coordinates as number[][][]);
      return rings ? [{...f, geometry: {...g, coordinates: rings}}] : [];
    }
    const parts = (g.coordinates as number[][][][]).map(fixPart).filter((x): x is number[][][] => x !== null);
    return parts.length ? [{...f, geometry: {...g, coordinates: parts}}] : [];
  });
  return {...fc, features} as T;
}
