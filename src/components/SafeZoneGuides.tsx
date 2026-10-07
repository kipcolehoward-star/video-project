import React from 'react';
import {captionLayout, type Region} from '../layouts/engine';
import {useLayout} from '../layouts/ProjectContext';

const ROLE_COLORS: Record<string, string> = {
  text: '#22d3ee',
  overlay: '#f472b6',
  media: '#a3e635',
  decor: '#94a3b8',
};

/**
 * Debug overlay (render with --guides). Shows the safe zone and every layout
 * region with its role, so layout decisions can be verified visually.
 */
export const SafeZoneGuides: React.FC<{regions?: Record<string, Region>}> = ({regions: sceneRegions = {}}) => {
  let regions = sceneRegions;
  const ctx = useLayout();
  const {platformSafe: safe, format, unit} = ctx;
  const cap = captionLayout(ctx);
  if (cap) regions = {...regions, captions: cap};
  const label: React.CSSProperties = {
    position: 'absolute',
    top: 4 * unit,
    left: 6 * unit,
    fontFamily: 'monospace',
    fontSize: 18 * unit,
    padding: `${2 * unit}px ${6 * unit}px`,
    background: 'rgba(0,0,0,0.6)',
  };
  return (
    <div style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}>
      <div
        style={{
          position: 'absolute',
          left: safe.x,
          top: safe.y,
          width: safe.w,
          height: safe.h,
          outline: `${2 * unit}px dashed #facc15`,
        }}
      >
        <span style={{...label, color: '#facc15', top: 'auto', bottom: 4 * unit}}>
          SAFE {format.id} {format.width}x{format.height}
        </span>
      </div>
      {Object.entries(regions).map(([name, r]) => (
        <div
          key={name}
          style={{
            position: 'absolute',
            left: r.x,
            top: r.y,
            width: r.w,
            height: r.h,
            outline: `${2 * unit}px solid ${ROLE_COLORS[r.role]}`,
          }}
        >
          <span style={{...label, color: ROLE_COLORS[r.role]}}>
            {name} · {r.role}
          </span>
        </div>
      ))}
    </div>
  );
};
