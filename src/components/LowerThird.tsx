import React from 'react';
import {useCurrentFrame} from 'remotion';
import {progress} from '../animations/motion';
import type {Region} from '../layouts/engine';
import {useLayout, useTheme} from '../layouts/ProjectContext';

/** Name/role identifier. Solid panel for legibility over any footage. */
export const LowerThird: React.FC<{region: Region; name: string; role?: string; delay?: number}> = ({
  region,
  name,
  role,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const {type, unit, gutter} = useLayout();
  const theme = useTheme();
  const p = progress(frame, delay, 16);
  const textP = progress(frame, delay + 6, 16);

  return (
    <div
      style={{
        position: 'absolute',
        left: region.x,
        top: region.y,
        height: region.h,
        maxWidth: region.w,
        display: 'flex',
        alignItems: 'stretch',
      }}
    >
      <div style={{width: Math.round(6 * unit), background: theme.accent, transform: `scaleY(${p})`, transformOrigin: 'bottom'}} />
      <div
        style={{
          background: 'rgba(15, 16, 18, 0.88)',
          padding: `${gutter * 0.45}px ${gutter * 0.8}px`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          clipPath: `inset(0 ${(1 - p) * 100}% 0 0)`,
        }}
      >
        <div
          style={{
            fontFamily: theme.fonts.display,
            fontSize: type.h2,
            fontWeight: 600,
            color: '#f1ede6',
            lineHeight: 1.1,
            whiteSpace: 'nowrap',
            opacity: textP,
          }}
        >
          {name}
        </div>
        {role ? (
          <div
            style={{
              fontFamily: theme.fonts.body,
              fontSize: type.label,
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#b9b3aa',
              marginTop: 10 * unit,
              whiteSpace: 'nowrap',
              opacity: textP,
            }}
          >
            {role}
          </div>
        ) : null}
      </div>
    </div>
  );
};
