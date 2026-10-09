/**
 * Invention cards for journey scenes: a framed visual with a label strip.
 * Kinds:
 *   image  — photo/illustration, slow push-in
 *   xray   — image with a short exposure flash when focused
 *   train  — image that sweeps sideways when focused (fast lateral move)
 *   print  — carved block, then the printed sheet lowers onto it (`src2`)
 *   steam  — image with rising steam (food)
 *   qr     — drawn: a real, scannable QR code, a phone scans it, a check confirms
 *   mp3    — drawn: waveform squeezes into a small MP3 file; generic player + headphones
 * Drawn kinds use no brand marks or real interfaces.
 */
import qrcode from 'qrcode-generator';
import React, {useMemo} from 'react';
import {Img, interpolate} from 'remotion';
import {EASE_IN_OUT, EASE_OUT} from '../../animations/motion';

export type CardKind = 'image' | 'xray' | 'train' | 'print' | 'steam' | 'qr' | 'mp3';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const BLUE = '#4ea8ff';

export function qrMatrix(text: string): boolean[][] {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  const n = q.getModuleCount();
  return Array.from({length: n}, (_, r) => Array.from({length: n}, (_, c) => q.isDark(r, c)));
}

/** QR modules as one SVG path (crisp, quiet zone included by the caller). */
export const QrCode: React.FC<{text: string; x: number; y: number; size: number}> = ({text, x, y, size}) => {
  const m = useMemo(() => qrMatrix(text), [text]);
  const n = m.length;
  const s = size / n;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r][c]) d += `M${(x + c * s).toFixed(2)} ${(y + r * s).toFixed(2)}h${s.toFixed(2)}v${s.toFixed(2)}h${(-s).toFixed(2)}z`;
  return <path d={d} fill="#0b0f16" shapeRendering="crispEdges" />;
};

/** Phone scanning a QR code. t = frames since the scan starts (negative = before). */
export const QrScene: React.FC<{w: number; h: number; t: number; unit: number; text: string}> = ({w, h, t, unit, text}) => {
  const qrSize = Math.min(w, h) * 0.5;
  const pad = qrSize * 0.12;
  const cx = w / 2;
  const cy = h * 0.46;
  const phoneW = qrSize * 1.45;
  const phoneH = phoneW * 1.95;
  const enter = interpolate(t, [0, 14], [1, 0], {...clamp, easing: EASE_OUT});
  const phoneY = cy - phoneH * 0.42 + enter * h * 0.9;
  const scanP = interpolate(t, [14, 40], [0, 1], {...clamp, easing: EASE_IN_OUT});
  const done = interpolate(t, [42, 50], [0, 1], {...clamp, easing: EASE_OUT});
  const screen = {x: cx - phoneW / 2 + 10 * unit, y: phoneY + 34 * unit, w: phoneW - 20 * unit, h: phoneH - 68 * unit};
  const box = qrSize + pad * 2;
  const bracket = (bx: number, by: number, sx: number, sy: number) => <path d={`M${bx} ${by + sy * 34 * unit}V${by}H${bx + sx * 34 * unit}`} fill="none" stroke={done > 0 ? '#ffffff' : BLUE} strokeWidth={5 * unit} strokeLinecap="round" />;
  return (
    <svg width={w} height={h} style={{position: 'absolute', left: 0, top: 0}}>
      <defs>
        <linearGradient id="qr-surface" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1c2a3d" />
          <stop offset="100%" stopColor="#0a111c" />
        </linearGradient>
      </defs>
      <rect width={w} height={h} fill="url(#qr-surface)" />
      {/* printed code on a white card */}
      <rect x={cx - box / 2} y={cy - box / 2} width={box} height={box} rx={10 * unit} fill="#f5f3ee" />
      <QrCode text={text} x={cx - qrSize / 2} y={cy - qrSize / 2} size={qrSize} />
      {/* phone: dark frame, transparent screen (we look through the camera) */}
      {enter < 1 ? (
        <g>
          <rect x={cx - phoneW / 2} y={phoneY} width={phoneW} height={phoneH} rx={40 * unit} fill="none" stroke="#0d1117" strokeWidth={22 * unit} />
          <rect x={cx - phoneW / 2 - 4 * unit} y={phoneY - 4 * unit} width={phoneW + 8 * unit} height={phoneH + 8 * unit} rx={44 * unit} fill="none" stroke="#5d6b7d" strokeWidth={3 * unit} />
          <rect x={screen.x} y={screen.y} width={screen.w} height={screen.h} rx={26 * unit} fill="rgba(78,168,255,0.06)" />
          {bracket(cx - box / 2 - 10 * unit, cy - box / 2 - 10 * unit, 1, 1)}
          {bracket(cx + box / 2 + 10 * unit, cy - box / 2 - 10 * unit, -1, 1)}
          {bracket(cx - box / 2 - 10 * unit, cy + box / 2 + 10 * unit, 1, -1)}
          {bracket(cx + box / 2 + 10 * unit, cy + box / 2 + 10 * unit, -1, -1)}
          {scanP > 0 && scanP < 1 ? <rect x={cx - box / 2} y={cy - box / 2 + box * scanP - 2 * unit} width={box} height={4 * unit} fill={BLUE} opacity={0.9} /> : null}
          {done > 0 ? (
            <g opacity={done} transform={`translate(${cx + box / 2} ${cy - box / 2}) scale(${0.7 + 0.3 * done})`}>
              <circle r={34 * unit} fill={BLUE} />
              <path d={`M${-14 * unit} ${1 * unit}L${-4 * unit} ${11 * unit}L${16 * unit} ${-11 * unit}`} fill="none" stroke="#ffffff" strokeWidth={7 * unit} strokeLinecap="round" strokeLinejoin="round" />
            </g>
          ) : null}
        </g>
      ) : null}
    </svg>
  );
};

/** Waveform that squeezes into a small MP3 file; a generic player with headphones below. */
const Mp3Scene: React.FC<{w: number; h: number; t: number; tc: number; unit: number}> = ({w, h, t, tc, unit}) => {
  const N = 34;
  const squeeze = interpolate(tc, [0, 16], [0, 1], {...clamp, easing: EASE_IN_OUT});
  const fileIn = interpolate(tc, [12, 22], [0, 1], {...clamp, easing: EASE_OUT});
  const waveY = h * 0.3;
  const waveW = w * 0.82;
  const fileW = w * 0.2;
  const fileH = fileW * 1.25;
  const bars = Array.from({length: N}, (_, i) => {
    const a = Math.abs(Math.sin(i * 0.9 + t / 5) * 0.6 + Math.sin(i * 0.37 + t / 9) * 0.4);
    const x0 = w / 2 - waveW / 2 + (i + 0.5) * (waveW / N);
    const x1 = w / 2 - fileW * 0.3 + (i + 0.5) * ((fileW * 0.6) / N);
    return {x: x0 + (x1 - x0) * squeeze, hh: (0.12 + 0.88 * a) * h * 0.2 * (1 - 0.7 * squeeze)};
  });
  const pw = w * 0.2;
  const ph = pw * 1.55;
  const px = w * 0.3 - pw / 2;
  const py = h * 0.6;
  const stroke = 'rgba(220,235,255,0.9)';
  return (
    <svg width={w} height={h} style={{position: 'absolute', left: 0, top: 0}}>
      <rect width={w} height={h} fill="#0c1626" />
      {bars.map((b, i) => (
        <rect key={i} x={b.x - (waveW / N) * 0.28 * (1 - 0.6 * squeeze)} y={waveY - b.hh / 2} width={(waveW / N) * 0.56 * (1 - 0.6 * squeeze)} height={b.hh} rx={2 * unit} fill={BLUE} opacity={1 - 0.8 * fileIn} />
      ))}
      {fileIn > 0 ? (
        <g opacity={fileIn} transform={`translate(${w / 2} ${waveY})`}>
          <path d={`M${-fileW / 2} ${-fileH / 2}H${fileW * 0.18}L${fileW / 2} ${-fileH * 0.24}V${fileH / 2}H${-fileW / 2}Z`} fill="#f2f6fb" />
          <path d={`M${fileW * 0.18} ${-fileH / 2}V${-fileH * 0.24}H${fileW / 2}`} fill="#c9d6e6" />
          <text y={fileH * 0.2} textAnchor="middle" fill="#0c1626" style={{fontFamily: '"Bebas Neue", sans-serif', fontSize: fileW * 0.42}}>MP3</text>
        </g>
      ) : null}
      {/* generic player: screen + two rows of buttons (no brand shape) */}
      <rect x={px} y={py} width={pw} height={ph} rx={10 * unit} fill="#1b283b" stroke={stroke} strokeWidth={2.5 * unit} />
      <rect x={px + pw * 0.12} y={py + ph * 0.1} width={pw * 0.76} height={ph * 0.42} rx={4 * unit} fill="#0a1220" stroke="rgba(78,168,255,0.7)" strokeWidth={1.5 * unit} />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={px + pw * (0.2 + i * 0.13)} y={py + ph * (0.4 - 0.18 * Math.abs(Math.sin(t / 4 + i)))} width={pw * 0.07} height={ph * 0.18 * Math.abs(Math.sin(t / 4 + i)) + 2} fill={BLUE} />
      ))}
      {[0, 1].map((r) => [0, 1, 2].map((c) => <circle key={`${r}${c}`} cx={px + pw * (0.27 + c * 0.23)} cy={py + ph * (0.66 + r * 0.17)} r={pw * 0.07} fill="none" stroke={stroke} strokeWidth={2 * unit} />))}
      {/* cable + headphones */}
      <path d={`M${px + pw / 2} ${py} C ${px + pw / 2} ${py - h * 0.08}, ${w * 0.62} ${py + ph * 0.1}, ${w * 0.66} ${py + ph * 0.05}`} fill="none" stroke={stroke} strokeWidth={2 * unit} />
      <g transform={`translate(${w * 0.7} ${py + ph * 0.3})`} fill="none" stroke={stroke} strokeWidth={4 * unit} strokeLinecap="round">
        <path d={`M${-w * 0.09} ${h * 0.02} A ${w * 0.09} ${w * 0.09} 0 0 1 ${w * 0.09} ${h * 0.02}`} />
        <rect x={-w * 0.11} y={h * 0.0} width={w * 0.04} height={h * 0.09} rx={6 * unit} fill="#1b283b" />
        <rect x={w * 0.07} y={h * 0.0} width={w * 0.04} height={h * 0.09} rx={6 * unit} fill="#1b283b" />
      </g>
    </svg>
  );
};

const Steam: React.FC<{w: number; h: number; t: number}> = ({w, h, t}) => (
  <svg width={w} height={h} style={{position: 'absolute', left: 0, top: 0, filter: `blur(${Math.max(2, w * 0.012)}px)`}}>
    {[0, 1, 2].map((i) => {
      const phase = ((t + i * 25) % 75) / 75;
      const x = w * (0.38 + i * 0.12);
      const y0 = h * (0.62 - phase * 0.5);
      const sway = Math.sin((t + i * 30) / 14) * w * 0.04;
      return (
        <path
          key={i}
          d={`M${x} ${y0 + h * 0.2} C ${x + sway} ${y0 + h * 0.12}, ${x - sway} ${y0 + h * 0.06}, ${x + sway * 0.5} ${y0}`}
          fill="none"
          stroke="#ffffff"
          strokeWidth={w * 0.035}
          strokeLinecap="round"
          opacity={0.32 * Math.sin(phase * Math.PI)}
        />
      );
    })}
  </svg>
);

export interface CardVisual {
  kind: CardKind;
  src?: string;
  src2?: string;
  focal?: {x: number; y: number};
  qrText?: string;
}

/**
 * The card body. `t` = frames since this card's focus cue (negative before);
 * `tAlt` = frames since its secondary cue (mp3 squeeze, print press); `age` = frames since cards appeared.
 */
export const CardBody: React.FC<{v: CardVisual; w: number; h: number; t: number; tAlt: number; age: number; unit: number}> = ({v, w, h, t, tAlt, age, unit}) => {
  const fx = (v.focal?.x ?? 0.5) * 100;
  const fy = (v.focal?.y ?? 0.5) * 100;
  const img = (src: string, style: React.CSSProperties = {}) => (
    <Img src={src} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${fx}% ${fy}%`, transformOrigin: `${fx}% ${fy}%`, ...style}} />
  );
  const push = 1.04 + 0.08 * Math.min(1, Math.max(0, age) / 360);
  switch (v.kind) {
    case 'qr':
      return <QrScene w={w} h={h} t={t} unit={unit * Math.min(1, w / 700)} text={v.qrText ?? ''} />;
    case 'mp3':
      return <Mp3Scene w={w} h={h} t={age} tc={tAlt} unit={unit * Math.min(1, w / 500)} />;
    case 'train': {
      const sweep = interpolate(t, [0, 20], [16, -4], {...clamp, easing: EASE_OUT}) + interpolate(t, [20, 200], [0, -5], clamp);
      const lines = interpolate(t, [0, 6, 22], [0, 1, 0], clamp);
      return (
        <>
          {img(v.src!, {transform: `scale(1.3) translateX(${sweep}%)`})}
          {lines > 0 ? (
            <svg width={w} height={h} style={{position: 'absolute', left: 0, top: 0, opacity: lines}}>
              {[0.32, 0.44, 0.58, 0.7].map((y, i) => (
                <rect key={i} x={((t * 60 + i * 97) % (w * 1.6)) - w * 0.3} y={h * y} width={w * 0.35} height={2.5 * unit} fill="#ffffff" opacity={0.45} />
              ))}
            </svg>
          ) : null}
        </>
      );
    }
    case 'print': {
      const drop = interpolate(tAlt, [0, 9], [-105, 0], {...clamp, easing: EASE_IN_OUT});
      return (
        <>
          {img(v.src!, {transform: `scale(${push})`})}
          {tAlt >= 0 && v.src2 ? (
            <div style={{position: 'absolute', inset: 0, transform: `translateY(${drop}%)`, boxShadow: `0 ${10 * unit}px ${30 * unit}px rgba(0,0,0,0.6)`}}>
              <Img src={v.src2} style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: '62% 50%'}} />
            </div>
          ) : null}
        </>
      );
    }
    case 'xray': {
      const flash = interpolate(t, [0, 2, 12], [0, 0.75, 0], clamp);
      return (
        <>
          {img(v.src!, {transform: `scale(${push})`})}
          <div style={{position: 'absolute', inset: 0, background: '#dcefff', opacity: flash, mixBlendMode: 'screen'}} />
        </>
      );
    }
    case 'steam':
      return (
        <>
          {img(v.src!, {transform: `scale(${push})`})}
          <Steam w={w} h={h} t={age} />
        </>
      );
    default:
      return img(v.src!, {transform: `scale(${push})`});
  }
};

/** Label strip: "TEXT · 1886" with the separator and date in the accent colour. */
export const CardLabel: React.FC<{text: string; size: number; p: number; unit: number}> = ({text, size, p, unit}) => {
  const [main, ...rest] = text.split('·').map((s) => s.trim());
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        padding: `${size * 1.1}px ${size * 0.4}px ${size * 0.35}px`,
        background: 'linear-gradient(to bottom, rgba(2,6,14,0), rgba(2,6,14,0.88) 55%)',
        textAlign: 'center',
        opacity: p,
        transform: `translateY(${(1 - p) * 12 * unit}px)`,
      }}
    >
      <div style={{width: `${Math.round(30 * p)}%`, height: 3 * unit, background: BLUE, margin: `0 auto ${size * 0.18}px`}} />
      <div style={{fontFamily: '"Bebas Neue", sans-serif', fontSize: size, lineHeight: 1, letterSpacing: '0.04em', color: '#ffffff', whiteSpace: 'nowrap'}}>
        {main}
        {rest.length ? <span style={{color: BLUE}}>{` · ${rest.join(' · ')}`}</span> : null}
      </div>
    </div>
  );
};
