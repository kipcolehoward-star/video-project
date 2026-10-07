import type {VideoFormat} from './formats';

/**
 * Safe zones are insets (fractions of frame width/height) that text and
 * critical information must stay inside. Media may bleed past them.
 *
 * Vertical social profiles reserve space for platform UI: the caption /
 * description block at the bottom and the action buttons on the right.
 * These are deliberately conservative averages across Shorts, TikTok and
 * Reels; tune per project via project.json -> safeZoneProfile.
 */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type SafeZoneProfile = 'auto' | 'broadcast' | 'social-vertical' | 'social-square' | 'none';

export const SAFE_ZONE_PROFILES: Record<Exclude<SafeZoneProfile, 'auto'>, Insets> = {
  // Modern "title safe" for web/TV landscape delivery.
  broadcast: {top: 0.06, right: 0.05, bottom: 0.07, left: 0.05},
  // Shorts/TikTok/Reels: bottom ~20% and right ~12% are covered by UI.
  'social-vertical': {top: 0.08, right: 0.12, bottom: 0.2, left: 0.06},
  'social-square': {top: 0.06, right: 0.06, bottom: 0.09, left: 0.06},
  none: {top: 0, right: 0, bottom: 0, left: 0},
};

/** A named profile, or explicit insets from project.json (e.g. {"top":0.15,"right":0.12,"bottom":0.2,"left":0.06}). */
export function resolveSafeZone(format: VideoFormat, profile: SafeZoneProfile | Insets = 'auto'): Insets {
  if (typeof profile === 'object') return profile;
  if (profile !== 'auto') return SAFE_ZONE_PROFILES[profile];
  switch (format.orientation) {
    case 'portrait':
      return SAFE_ZONE_PROFILES['social-vertical'];
    case 'square':
      return SAFE_ZONE_PROFILES['social-square'];
    default:
      return SAFE_ZONE_PROFILES.broadcast;
  }
}
