/**
 * Satellite globe: NASA Blue Marble (public domain) wrapped onto the
 * orthographic globe by inverse projection on a canvas, every frame.
 *
 * The texture is 10 px/degree (3600x1800) — sharp at whole-Earth scale, soft when
 * zoomed in — so the atlas scene cross-fades it into the vector map as zoom grows.
 * Frames with an unchanged camera reuse the last drawing.
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

  // Last drawn view: consecutive frames with the same camera reuse the canvas.
  const drawn = useRef('');

  // Layout effect: the canvas is painted before Remotion captures the frame.
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!texture) return;
    if (!canvas || opacity <= 0) {
      release();
      return;
    }
    // Half resolution, smoothed on upscale (the texture is softer than that anyway);
    // lower still while the globe is fading out, where detail can't be seen.
    const s = opacity > 0.6 ? 0.5 : 0.35;
    const key = [W, H, cx, cy, R, lon, lat, s].map((v) => v.toFixed(3)).join('|');
    if (key === drawn.current) {
      release();
      return;
    }
    drawn.current = key;
    const w = Math.ceil(W * s);
    const h = Math.ceil(H * s);
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext('2d')!;
    const out = g.createImageData(w, h);
    const o = out.data;
    const t = texture;
    const td = t.data;
    const tw = t.w;
    const thMax = t.h - 1;
    const invR = 1 / (R * s);
    const x0 = cx * s;
    const y0 = cy * s;
    const sinP = Math.sin(lat * RAD);
    const cosP = Math.cos(lat * RAD);
    const DEG = 180 / Math.PI;
    const uOff = lon + 180;
    // Only rows/columns the globe can cover.
    const yA = Math.max(0, Math.floor(y0 - R * s));
    const yB = Math.min(h, Math.ceil(y0 + R * s));
    const xA = Math.max(0, Math.floor(x0 - R * s));
    const xB = Math.min(w, Math.ceil(x0 + R * s));
    for (let y = yA; y < yB; y++) {
      const py = (y0 - y) * invR;
      const py2 = py * py;
      if (py2 >= 1) continue;
      const pySinP = py * sinP;
      const pyCosP = py * cosP;
      let i = (y * w + xA) * 4;
      for (let x = xA; x < xB; x++, i += 4) {
        const px = (x - x0) * invR;
        const rho2 = px * px + py2;
        if (rho2 >= 1) continue; // space: transparent
        const cosc = Math.sqrt(1 - rho2);
        // Inverse orthographic (rho cancels out of the textbook form).
        const phi = Math.asin(cosc * sinP + pyCosP);
        const lam = Math.atan2(px, cosP * cosc - pySinP) * DEG + uOff;
        let u = (lam / 360) % 1;
        if (u < 0) u += 1;
        let row = ((90 - phi * DEG) / 180) * t.h;
        row = row < 0 ? 0 : row > thMax ? thMax : row;
        const ti = ((row | 0) * tw + ((u * tw) | 0)) * 4;
        // Gentle limb darkening gives the sphere its volume.
        const shade = 0.55 + 0.45 * cosc;
        o[i] = td[ti] * shade;
        o[i + 1] = td[ti + 1] * shade;
        o[i + 2] = td[ti + 2] * shade;
        o[i + 3] = 255;
      }
    }
    g.putImageData(out, 0, 0);
    release();
  });

  if (!ready) return null;
  return <canvas ref={ref} style={{position: 'absolute', left: 0, top: 0, width: W, height: H, opacity, imageRendering: 'auto'}} />;
};
