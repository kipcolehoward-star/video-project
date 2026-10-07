import React, {createContext, useContext, useMemo} from 'react';
import {staticFile, useVideoConfig} from 'remotion';
import {findCue} from '../captions/words';
import {narrationOffset, type AssetMeta, type MainProps, type SceneSpec} from '../config/project';
import {getTheme, type Theme} from '../config/themes';
import {createLayoutContext, type LayoutContext} from './engine';

interface ProjectContextValue {
  props: MainProps;
  theme: Theme;
  layout: LayoutContext;
}

const Ctx = createContext<ProjectContextValue | null>(null);

export const ProjectProvider: React.FC<{props: MainProps; children: React.ReactNode}> = ({props, children}) => {
  const value = useMemo(
    () => ({
      props,
      theme: getTheme(props.project.theme),
      // Reserve the caption band only when there are captions to show.
      layout: createLayoutContext(props.format, props.project.safeZoneProfile, {
        captionStyle: props.transcript ? props.captionStyle : 'none',
      }),
    }),
    [props],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

const useProject = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useProject must be used inside <ProjectProvider>');
  return v;
};

export const useLayout = () => useProject().layout;
export const useTheme = () => useProject().theme;
export const useShowGuides = () => Boolean(useProject().props.showGuides);
export const useProps = () => useProject().props;

/** Resolves "asset:<id>" references from the storyboard to asset metadata + URL. */
export function useAsset(ref: string | undefined): (AssetMeta & {src: string}) | null {
  const {assets} = useProject().props;
  if (!ref) return null;
  const id = ref.startsWith('asset:') ? ref.slice(6) : ref;
  const meta = assets[id];
  if (!meta) throw new Error(`Storyboard references unknown asset "${id}". Add it to assets.json.`);
  // The project directory is the Remotion public dir, so paths resolve directly.
  return {...meta, src: staticFile(meta.path)};
}

/**
 * Narration cues: returns a function mapping a cue word ("second", "second#2")
 * to the scene-relative frame where the narrator says it. Falls back to
 * `fallback` when there is no transcript yet or the word isn't found, so
 * scenes still animate sensibly before voiceover exists.
 */
export function useCue(scene: SceneSpec<unknown>) {
  const {props} = useProject();
  const {fps} = useVideoConfig();
  return (cue: string | undefined, fallback: number): number => {
    if (!cue) return fallback;
    const words = props.transcript?.scenes[scene.id]?.words;
    if (!words) return fallback;
    const i = findCue(words, cue);
    if (i < 0) return fallback;
    const index = props.storyboard.scenes.findIndex((s) => s.id === scene.id);
    return Math.round((narrationOffset(scene, index) + words[i].start) * fps);
  };
}
