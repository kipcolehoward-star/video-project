import React from 'react';
import {AbsoluteFill} from 'remotion';
import {useLayout} from '../layouts/ProjectContext';
import {MediaFrame} from './MediaFrame';

/**
 * Full-frame photo behind a typographic scene, dimmed so text stays legible.
 * `scrim` adds a directional darkening behind the text area (functional, not
 * decorative): 'bottom-left' for lower-left text, 'even' for centred text.
 */
export const Backdrop: React.FC<{asset: string; durationInFrames: number; dim?: number; scrim?: 'bottom-left' | 'even'}> = ({
  asset,
  durationInFrames,
  dim = 0.55,
  scrim = 'even',
}) => {
  const {W, H} = useLayout();
  return (
    <AbsoluteFill>
      <MediaFrame rect={{x: 0, y: 0, w: W, h: H}} asset={asset} durationInFrames={durationInFrames} />
      <AbsoluteFill style={{background: `rgba(10, 10, 12, ${dim})`}} />
      {scrim === 'bottom-left' ? (
        <AbsoluteFill style={{background: 'linear-gradient(to top right, rgba(10,10,12,0.85) 0%, rgba(10,10,12,0.35) 45%, rgba(10,10,12,0) 70%)'}} />
      ) : null}
    </AbsoluteFill>
  );
};
