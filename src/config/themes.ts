/**
 * Visual themes. Restrained by design: flat colour, one accent, no gradients
 * or glow. A theme is chosen per project in project.json.
 */
export interface Theme {
  id: string;
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  accent: string;
  rule: string;
  /** Non-highlighted chart marks. */
  chartMuted: string;
  /** Land on maps: clearly visible but recessive. */
  mapLand: string;
  fonts: {
    display: string;
    body: string;
  };
}

export const THEMES: Record<string, Theme> = {
  documentary: {
    id: 'documentary',
    background: '#0f1012',
    surface: '#1a1b1e',
    text: '#f1ede6',
    textMuted: '#9b968e',
    accent: '#d4a24c',
    rule: 'rgba(241, 237, 230, 0.18)',
    chartMuted: '#4a4741',
    mapLand: '#2e2f33',
    fonts: {display: '"Source Serif 4", Georgia, serif', body: '"Inter Variable", "Segoe UI", sans-serif'},
  },
  explainer: {
    id: 'explainer',
    background: '#f4f1ea',
    surface: '#e8e3d8',
    text: '#16171a',
    textMuted: '#5f5b54',
    accent: '#c2410c',
    rule: 'rgba(22, 23, 26, 0.16)',
    chartMuted: '#c9c2b4',
    mapLand: '#d8d2c6',
    fonts: {display: '"Inter Variable", "Segoe UI", sans-serif', body: '"Inter Variable", "Segoe UI", sans-serif'},
  },
};

THEMES.atlas = {
  id: 'atlas',
  background: '#080b0f',
  surface: '#141a1f',
  text: '#f5f2ec',
  textMuted: '#9aa3a8',
  accent: '#e0a63a',
  rule: 'rgba(245, 242, 236, 0.18)',
  chartMuted: '#3a4247',
  mapLand: '#1d2421',
  fonts: {display: '"Bebas Neue", "Anton", sans-serif', body: '"Inter Variable", "Segoe UI", sans-serif'},
};

export const getTheme = (id?: string): Theme => THEMES[id ?? 'documentary'] ?? THEMES.documentary;
