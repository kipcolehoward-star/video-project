/**
 * A MapLibre map that renders deterministically under Remotion: no
 * interaction, no fades, the camera set synchronously for each frame, and every
 * frame held (delayRender) until the map reports "idle", i.e. everything for
 * that camera is drawn. Rendering needs WebGL in headless Chrome, which
 * scripts/lib/remotion.ts switches on for projects with a glmap scene.
 */
import type {Map as GlMap, StyleSpecification} from 'maplibre-gl';
import {useEffect, useRef, useState} from 'react';
import {cancelRender, continueRender, delayRender, useCurrentFrame} from 'remotion';

export interface GlCamera {
  lon: number;
  lat: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

const view = (c: GlCamera) => ({center: [c.lon, c.lat] as [number, number], zoom: c.zoom, pitch: c.pitch, bearing: c.bearing});

/** [layer id, paint property, value]: style values that change from frame to frame (kinetic highlights). */
export type GlPaint = [string, string, number | string];

/** `style` may be null while its data loads; the map is created once it is set. */
export function useGlMap(style: StyleSpecification | null, cam: GlCamera, paint: GlPaint[] = []) {
  const ref = useRef<HTMLDivElement>(null);
  const painted = useRef(new Map<string, number | string>());
  const frame = useCurrentFrame();
  const [map, setMap] = useState<GlMap | null>(null);
  const [loadHandle] = useState(() => delayRender('glmap: map load'));

  useEffect(() => {
    const container = ref.current;
    if (!style || !container) return;
    // Loaded here, in the browser, only when a glmap scene mounts: validate and qc import every scene in
    // Node, and other projects never download MapLibre. Its stylesheet only styles controls, which are off.
    import('maplibre-gl').then((lib) => start(lib.Map ?? (lib as unknown as {default: typeof lib}).default.Map, container, style), (e) => cancelRender(e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style]);

  function start(MapClass: typeof GlMap, container: HTMLDivElement, style: StyleSpecification) {
    let m: GlMap;
    try {
      m = new MapClass({
        container,
        style,
        ...view(cam),
        interactive: false,
        fadeDuration: 0,
        attributionControl: false,
        canvasContextAttributes: {preserveDrawingBuffer: true, antialias: true},
      });
    } catch (e) {
      cancelRender(new Error(`glmap: MapLibre could not start (WebGL unavailable?). Set RENDER_GL to angle or swangle. ${(e as Error).message}`));
      return;
    }
    m.on('error', (e) => cancelRender(e.error ?? new Error('glmap: MapLibre error')));
    m.once('idle', () => {
      setMap(m);
      continueRender(loadHandle);
    });
    // No map.remove() cleanup: Remotion's map guide warns it interferes with the render lifecycle.
  }

  // Set during render, so overlays projected with map.project() in this render use this frame's camera.
  if (map) {
    for (const [layer, prop, value] of paint) {
      const key = `${layer}|${prop}`;
      if (painted.current.get(key) === value) continue;
      painted.current.set(key, value);
      map.setPaintProperty(layer, prop as never, value);
    }
    map.jumpTo(view(cam));
  }

  useEffect(() => {
    if (!map) return;
    const handle = delayRender(`glmap: frame ${frame}`);
    map.once('idle', () => continueRender(handle));
    // A held camera schedules no redraw by itself; force one so "idle" fires for this frame.
    map.triggerRepaint();
  }, [map, frame]);

  return {ref, map};
}
