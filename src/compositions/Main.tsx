import React, {useMemo} from 'react';
import {AbsoluteFill, Audio, interpolate, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {Captions} from '../captions/Captions';
import {globalWords} from '../captions/words';
import {loadProjectFonts} from '../config/fonts';
import {buildTimeline, type MainProps, type TimedScene} from '../config/project';
import {ProjectProvider, useTheme} from '../layouts/ProjectContext';
import {SCENES} from '../scenes/registry';

loadProjectFonts();

const SceneSlot: React.FC<{timed: TimedScene}> = ({timed}) => {
  const frame = useCurrentFrame();
  const def = SCENES[timed.scene.type];
  if (!def) throw new Error(`Unknown scene type "${timed.scene.type}" (scene "${timed.scene.id}"). Register it in src/scenes/registry.ts.`);
  const opacity = timed.fadeInFrames
    ? interpolate(frame, [0, timed.fadeInFrames], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})
    : 1;
  const Scene = def.component;
  return (
    <AbsoluteFill style={{opacity}}>
      <Scene scene={timed.scene} durationInFrames={timed.durationInFrames} />
    </AbsoluteFill>
  );
};

/**
 * Procedural surface texture (no image asset): static fractal noise blended
 * at low opacity. Grain takes the flat digital edge off; paper adds fibre.
 */
const Texture: React.FC<{kind: 'grain' | 'paper'}> = ({kind}) => (
  <AbsoluteFill style={{pointerEvents: 'none', mixBlendMode: kind === 'paper' ? 'multiply' : 'overlay', opacity: kind === 'paper' ? 0.12 : 0.07}}>
    <svg width="100%" height="100%">
      <filter id={`tex-${kind}`}>
        <feTurbulence type="fractalNoise" baseFrequency={kind === 'paper' ? '0.035 0.9' : '0.9'} numOctaves={kind === 'paper' ? 3 : 2} seed={7} stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter={`url(#tex-${kind})`} />
    </svg>
  </AbsoluteFill>
);

const Timeline: React.FC<{props: MainProps}> = ({props}) => {
  const theme = useTheme();
  const {scenes} = buildTimeline(props.storyboard, props.format.fps);
  const words = useMemo(() => globalWords(props.storyboard, props.transcript, props.format.fps), [props]);
  return (
    <AbsoluteFill style={{background: theme.background}}>
      {scenes.map((t) => (
        <Sequence key={t.scene.id} name={`${t.scene.type}:${t.scene.id}`} from={t.from} durationInFrames={t.durationInFrames}>
          <SceneSlot timed={t} />
        </Sequence>
      ))}
      {props.project.texture && props.project.texture !== 'none' ? <Texture kind={props.project.texture} /> : null}
      {/* Captions sit above every scene and ignore scene fades. */}
      <Captions words={words} style={props.captionStyle} />
      {/* One pre-mixed track (narration + ducked music + SFX), built by `npm run audio`. */}
      {props.audioMix ? <Audio src={staticFile(props.audioMix)} /> : null}
    </AbsoluteFill>
  );
};

export const Main: React.FC<MainProps> = (props) => (
  <ProjectProvider props={props}>
    <Timeline props={props} />
  </ProjectProvider>
);
