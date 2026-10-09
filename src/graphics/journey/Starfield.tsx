/**
 * Deterministic star background for globe-in-space shots. Stars drift with
 * the camera longitude (a little parallax), and a few twinkle slowly.
 */
import React, {useMemo} from 'react';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const Starfield: React.FC<{W: number; H: number; lon: number; frame: number; unit: number; opacity?: number}> = ({W, H, lon, frame, unit, opacity = 1}) => {
  const stars = useMemo(() => {
    const r = rng(1994);
    return Array.from({length: 260}, () => ({x: r(), y: r(), s: 0.5 + r() * r() * 1.8, b: 0.25 + r() * 0.6, tw: r() < 0.15 ? r() * 6 : 0}));
  }, []);
  const shift = lon / 360;
  return (
    <svg width={W} height={H} style={{position: 'absolute', left: 0, top: 0, opacity}}>
      <defs>
        <radialGradient id="space-bg" cx="50%" cy="45%" r="75%">
          <stop offset="0%" stopColor="#0a1426" />
          <stop offset="100%" stopColor="#02050b" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill="url(#space-bg)" />
      {stars.map((st, i) => {
        const x = (((st.x - shift * 0.6) % 1) + 1) % 1;
        const tw = st.tw ? 0.65 + 0.35 * Math.sin(frame / 18 + st.tw) : 1;
        return <circle key={i} cx={x * W} cy={st.y * H} r={st.s * unit} fill="#dbe8ff" opacity={st.b * tw} />;
      })}
    </svg>
  );
};

/** A soft point of light (white core, blue halo). */
export const Spark: React.FC<{x: number; y: number; r: number; opacity: number}> = ({x, y, r, opacity}) =>
  opacity <= 0 || r <= 0 ? null : (
    <g opacity={opacity}>
      <circle cx={x} cy={y} r={r * 3.2} fill="url(#spark-halo)" />
      <circle cx={x} cy={y} r={r} fill="#ffffff" />
    </g>
  );

export const SparkDefs: React.FC = () => (
  <defs>
    <radialGradient id="spark-halo">
      <stop offset="0%" stopColor="#bfe0ff" stopOpacity={0.9} />
      <stop offset="35%" stopColor="#4ea8ff" stopOpacity={0.45} />
      <stop offset="100%" stopColor="#4ea8ff" stopOpacity={0} />
    </radialGradient>
  </defs>
);
