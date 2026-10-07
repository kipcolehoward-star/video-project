/**
 * Fonts are bundled from open-source @fontsource packages (OFL licensed) so
 * rendering never depends on the network or on system-installed fonts.
 * loadFont() blocks rendering until the faces are ready.
 */
import {loadFont} from '@remotion/fonts';
import interVariable from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2';
import serif400 from '@fontsource/source-serif-4/files/source-serif-4-latin-400-normal.woff2';
import serif600 from '@fontsource/source-serif-4/files/source-serif-4-latin-600-normal.woff2';
import bebas from '@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff2';

let loaded = false;

export function loadProjectFonts() {
  if (loaded) return;
  loaded = true;
  loadFont({family: 'Inter Variable', url: interVariable, weight: '100 900'});
  loadFont({family: 'Source Serif 4', url: serif400, weight: '400'});
  loadFont({family: 'Source Serif 4', url: serif600, weight: '600'});
  loadFont({family: 'Bebas Neue', url: bebas, weight: '400'});
}
