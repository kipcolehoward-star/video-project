/**
 * Satellite globe: NASA Blue Marble (public domain) wrapped onto the
 * orthographic globe by inverse projection on a canvas, every frame.
 *
 * The texture is 15 px/degree — sharp at whole-Earth scale, soft when zoomed
 * in — so the atlas scene cross-fades it into the vector map as zoom grows.
 */
import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {cancelRender, continueRender, delayRender, staticFile} from 'remotion';

interface Texture {
  w: number;
  h: number;
  data: Uint8ClampedArray;
}
let texture: Texture | null = null;
let loading: Promise<Texture> | null = null;

function loadTexture(): Promise<Texture> {
  loading ??= new Promise<Texture>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext('2d', {willReadFrequently: true})!;
      g.drawImage(img, 0, 0);
      texture = {w: c.width, h: c.height, data: g.getImageData(0, 0, c.width, c.height).data};
      resolve(texture);
    };
    img.onerror = () => reject(new Error('geo/bluemarble.jpg failed to load — run npm run geo:setup / check data/geo/raster'));
    img.src = staticFile('geo/bluemarble.jpg');
  });
  return loading;
}

const RAD = Math.PI / 180;

export const SatelliteGlobe: React.FC<{
  W: number;
  H: number;
  cx: number;
  cy: number;
  /** Globe radius in px. */
  R: number;
  lon: number;
  lat: number;
  opacity: number;
}> = ({W, H, cx, cy, R, lon, lat, opacity}) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const [handle] = useState(() => (texture ? null : delayRender('satellite texture')));
  const [ready, setReady] = useState(Boolean(texture));

  useEffect(() => {
    if (texture) return;
    // Only mark ready here; Remotion is released after the first draw below.
    loadTexture()
      .then(() => setReady(true))
      .catch((e) => cancelRender(e));
  }, [handle]);
  const released = useRef(false);
  const release = () => {
    if (handle !== null && !released.current) {
      released.current = true;
      continueRender(handle);
    }
  };

  // Layout effect: the canvas is painted before Remotion captures the frame.
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!texture) return;
    if (!canvas || opacity <= 0) {
      release();
      return;
    }
    // Half resolution, smoothed on upscale (the texture is softer than that anyway).
    const s = 0.5;
    const w = Math.ceil(W * s);
    const h = Math.ceil(H * s);
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext('2d')!;
    const out = g.createImageData(w, h);
    const o = out.data;
    const t = texture;
    const r = R * s;
    const x0 = cx * s;
    const y0 = cy * s;
    const sinP = Math.sin(lat * RAD);
    const cosP = Math.cos(lat * RAD);
    for (let y = 0; y < h; y++) {
      const py = (y0 - y) / r;
      for (let x = 0; x < w; x++) {
        const px = (x - x0) / r;
        const rho2 = px * px + py * py;
        if (rho2 >= 1) continue; // space: transparent
        const rho = Math.sqrt(rho2);
        const cosc = Math.sqrt(1 - rho2);
        let phi: number;
        let lam: number;
        if (rho < 1e-9) {
          phi = lat * RAD;
          lam = lon * RAD;
        } else {
          phi = Math.asin(cosc * sinP + (py * rho * cosP) / rho);
          lam = lon * RAD + Math.atan2(px * rho, rho * cosP * cosc - py * sinP * rho);
        }
        let u = ((lam / RAD + 180) / 360) % 1;
        if (u < 0) u += 1;
        const v = (90 - phi / RAD) / 180;
        const ti = (Math.min(t.h - 1, Math.max(0, Math.floor(v * t.h))) * t.w + Math.floor(u * t.w)) * 4;
        // Gentle limb darkening gives the sphere its volume.
        const shade = 0.55 + 0.45 * cosc;
        const i = (y * w + x) * 4;
        o[i] = t.data[ti] * shade;
        o[i + 1] = t.data[ti + 1] * shade;
        o[i + 2] = t.data[ti + 2] * shade;
        o[i + 3] = 255;
      }
    }
    g.putImageData(out, 0, 0);
    release();
  });

  if (!ready) return null;
  return <canvas ref={ref} style={{position: 'absolute', left: 0, top: 0, width: W, height: H, opacity, imageRendering: 'auto'}} />;
};
