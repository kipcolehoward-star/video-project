import React from 'react';
import {Img, OffthreadVideo, useCurrentFrame, useVideoConfig} from 'remotion';
import {pushIn} from '../animations/motion';
import type {Rect} from '../layouts/engine';
import {useAsset} from '../layouts/ProjectContext';

/**
 * Fills a layout rect with an image or video, cropping around the asset's
 * focal point (assets.json -> focalPoint) instead of the centre. The same
 * photo can therefore be framed wide in 16:9 and tall in 9:16 without
 * losing its subject.
 */
export const MediaFrame: React.FC<{
  rect: Rect;
  asset: string;
  durationInFrames: number;
  motion?: 'none' | 'push';
}> = ({rect, asset, durationInFrames, motion = 'push'}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const a = useAsset(asset);
  if (!a) return null;
  const fx = (a.focalPoint?.x ?? 0.5) * 100;
  const fy = (a.focalPoint?.y ?? 0.5) * 100;
  const scale = motion === 'push' ? pushIn(frame, durationInFrames) : 1;

  const mediaStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: `${fx}% ${fy}%`,
    transform: `scale(${scale})`,
    transformOrigin: `${fx}% ${fy}%`,
  };

  const isVideo = a.type === 'broll' || /\.(mp4|mov|webm|mkv)$/i.test(a.path);

  return (
    <div style={{position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h, overflow: 'hidden'}}>
      {isVideo ? (
        <OffthreadVideo src={a.src} style={mediaStyle} startFrom={a.start ? Math.round(a.start * fps) : undefined} muted />
      ) : (
        <Img src={a.src} style={mediaStyle} />
      )}
    </div>
  );
};
