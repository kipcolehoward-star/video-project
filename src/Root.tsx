import React from 'react';
import {Composition, type CalculateMetadataFunction} from 'remotion';
import {Main} from './compositions/Main';
import {buildTimeline, type MainProps} from './config/project';
import studioProps from './generated/studio-props.json';

/**
 * Dimensions, fps and duration are derived from the props (project format +
 * storyboard) — never hard-coded here. The render script builds the props
 * from projects/<id>/ and passes them in; the Studio uses the last props
 * written by `npm run dev`.
 */
const calculateMetadata: CalculateMetadataFunction<MainProps> = ({props}) => {
  const {format, storyboard} = props;
  return {
    width: format.width,
    height: format.height,
    fps: format.fps,
    durationInFrames: buildTimeline(storyboard, format.fps).durationInFrames,
  };
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Main"
    component={Main}
    defaultProps={studioProps as unknown as MainProps}
    calculateMetadata={calculateMetadata}
    // Placeholders; calculateMetadata always overrides them.
    width={1920}
    height={1080}
    fps={30}
    durationInFrames={1}
  />
);
