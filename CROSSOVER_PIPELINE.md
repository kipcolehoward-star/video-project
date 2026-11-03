# Crossover Pipeline Documentation
## Checkpoint Geo & History — "Netherlands is not Holland" (9:16 Short)

> **Audience:** Any agent picking up this project cold.  
> **Goal:** Produce a 9:16 Short (~34s) explaining that Holland is two provinces (North & South Holland), not the whole country — the country is the Netherlands (12 provinces, 17M people, 0 mountains).  
> **Style:** Kinetic Short — something visible happens every 1–2s on the spoken word; nothing frozen >1.5s.  
> **Voice:** Edge TTS `en-US-BrianMultilingualNeural` +0% rate, `maxPause: 0.2s` for continuous voice-over.  
> **Map:** `glmap` scenes with `imagery` (EOxCloudless 2016) + `terrain` (SRTM/GMTED/ETOPO1), `dusk` palette.

---

## 1. Repository Structure

```
video-project/
├── CLAUDE.md                    # Master operating manual (55 KB)
├── CROSSOVER_PIPELINE.md        # This file
├── package.json                 # deps: remotion 4.0.533, react 19, maplibre-gl 5.24, d3-geo, topojson, etc.
├── tsconfig.json                # ES2022, moduleResolution: Bundler, strict
├── remotion.config.ts           # concurrency 2, jpeg 90%, yuv420p, h264, entry: src/index.ts
├── .env                         # ELEVENLABS_API_KEY, PEXELS_API_KEY, YOUTUBE_CLIENT_ID/SECRET, RENDER_SERVER
├── .gitignore                   # node_modules, tools/, .remotion, previews, mixes, geo/ per project
├── src/
│   ├── index.ts                 # registerRoot(RemotionRoot)
│   ├── Root.tsx                 # <Composition id="Main" calculateMetadata /> + BrandLogo/BrandBanner
│   ├── components/              # Region, Typography, MediaFrame, LowerThird, SafeZoneGuides, Backdrop
│   ├── compositions/            # Main.tsx (timeline), Brand.tsx (logo/banner)
│   ├── config/
│   │   ├── formats.ts           # FORMAT_PRESETS (16:9, 9:16, 1:1, 4:5, 4k-16:9), resolveFormat()
│   │   ├── project.ts           # ProjectConfig, SceneSpec, AudioConfig, AssetMeta, storyboard types
│   │   ├── themes.ts            # THEMES: documentary, explainer, atlas, geo, paper, sketch, orbit
│   │   ├── safeZones.ts         # SAFE_ZONE_PROFILES (broadcast, social-vertical, social-square, none)
│   │   └── fonts.ts             # loadProjectFonts() — Inter Variable, Source Serif 4, Bebas Neue, Patrick Hand
│   ├── layouts/
│   │   ├── engine.ts            # createLayoutContext(), titleLayout/splitLayout/statLayout/itemsLayout/stackLayout/gridLayout/lowerThirdLayout/captionLayout
│   │   └── ProjectContext.tsx   # useLayout, useTheme, useCue, useShowGuides, useProps, useAsset
│   ├── scenes/
│   │   ├── registry.ts          # SCENES map: title, split, statistic, steps, comparison, diagram, map, photo, list, grid, atlas, journey, glmap
│   │   ├── types.ts             # SceneDefinition {component, regions, textBlocks?, assetRefs?, cues?, problems?, moments?, sounds?}
│   │   ├── AtlasScene.tsx       # orthographic globe, camera keys, flagMasks, flagBadges, routes, paleo, labels, texts
│   │   ├── GlMapScene.tsx       # MapLibre GL JS flat map, camera move/glide, beats (highlight/label/stamp/card/icon/year/tint/arrow/link/pulse/march/measure/move/ring/strike/parchment/falls/boat/river/subscribe)
│   │   ├── MapScene.tsx         # d3-geo world/USA, highlights + markers
│   │   ├── JourneyScene.tsx     # satellite globe + starfield, camera fit-to-country, cards, montage
│   │   ├── TitleScene.tsx       # kicker/title/subtitle, hero size, background, cue animation
│   │   ├── SplitScene.tsx       # media + text side-by-side (landscape) / stacked (portrait/square)
│   │   ├── StatisticScene.tsx   # big number + column/bar chart
│   │   ├── StepsScene.tsx       # numbered process
│   │   ├── ComparisonScene.tsx  # values with count-up, lead operator, highlight
│   │   ├── DiagramScene.tsx     # trilateration / call-routing / channel-depth
│   │   ├── MapScene.tsx         # d3-geo world/USA
│   │   ├── PhotoScene.tsx       # full-bleed + focal-point push-in
│   │   ├── ListScene.tsx        # display / numbered / pairs
│   │   ├── GridScene.tsx        # reference cards
│   │   └── registry.ts          # SCENES map
│   ├── graphics/
│   │   ├── geo/                 # data.ts (useGeoLayer, usePreloadImages, fixWinding, flagUrl), paleo.ts, routes.ts, Satellite.tsx
│   │   ├── glmap/               # style.ts (glStyle, GL_PALETTES), imagery.ts, terrain.ts, tiles.ts, useGlMap.ts
│   │   ├── kinetic/             # pictures.tsx (slotRect, ICONS, PaperCard, DroppedIcon, CountingYear, FallsCascade, SplashBurst, StampMark, StrikeMark, NeonRing, RiverBoat, Walker)
│   │   ├── journey/             # cards.tsx, Starfield.tsx
│   │   └── diagrams/            # Trilateration, CallRouting, ChannelDepth
│   ├── captions/                # words.ts (parseNarration, spokenText, alignScript, globalWords, buildPages, toSrt/toVtt)
│   ├── animations/              # motion.ts (progress, riseIn, fadeOut, pushIn, smoothPath, driftTime, EASE_IN_OUT), kinetic.ts (pop, slam, breathe, glowPulse, snap, legsPath, legsDrift)
│   └── types/                   # assets.d.ts
├── scripts/
│   ├── lib/
│   │   ├── project.ts           # loadProject(), pickProject(), buildProps(), resolveProjectFormat(), mixKey(), currentMix()
│   │   ├── checks.ts            # checkStoryboard, checkAssets, checkFonts, checkLayout, checkNarration, checkMoments, checkVoiceGaps, checkGeo, checkSounds
│   │   ├── speech.ts            # voiceover (piper/edge/elevenlabs/kokoro), transcribe (whisper.cpp alignScript), tightenClip()
│   │   ├── mix.ts               # buildMix() — narration + ducked music + SFX → loudnorm -16 LUFS / -1.5 dBTP
│   │   ├── chunked.ts           # renderChunked() — resumable 60s parts, watchdog, parts.json resume, MASTER_AUDIO limiter
│   │   ├── remotion.ts          # bundleProject(), renderVideo(), renderStills(), renderCompositionStill(), RENDER_DEFAULTS
│   │   ├── geodata.ts           # geoNeeds(), geoProblems(), ensureGeoData() — copies layers/flags/terrain/imagery tiles to <project>/geo/
│   │   ├── imagery.ts           # imageryTilesFor(), imageryTile() — EOxCloudless 2016 tiles
│   │   ├── terrain.ts           # terrainTilesFor() — SRTM/GMTED/ETOPO1 terrarium tiles
│   │   ├── youtube.ts           # uploadVideo, uploadCaptions, setThumbnail, myChannel, api()
│   │   ├── exec.ts              # capture() wrapper for ffmpeg/ffprobe
│   │   ├── env.ts               # .env loader
│   │   ├── tools.ts             # TOOL_PATHS (whisper-cli, piper, models), DOWNLOADS, VOICES
│   │   └── project.ts           # ROOT, PROJECTS_DIR, loadProject(), pickProject(), buildProps()
│   ├── create.ts                # scaffold projects/<slug>/ from templates/project/
│   ├── dev.ts                   # remotion studio
│   ├── render.ts                # main render (preview/final), calls bundleProject → renderChunked → qc
│   ├── validate.ts              # runs checkStoryboard, checkAssets, checkFonts, checkLayout, checkNarration, checkMoments, checkVoiceGaps, checkGeo
│   ├── transcribe.ts            # whisper.cpp alignment → transcript.json
│   ├── captions.ts              # SRT/VTT from transcript.json
│   ├── audio.ts                 # buildMix → audio/mix.wav
│   ├── voiceover.ts             # generateVoiceover() — per-scene WAV + manifest.json + timing.json
│   ├── narrate.ts               # voiceover → transcribe → captions → audio (sequential)
│   ├── stills.ts                # renderStills at exact frames per format
│   ├── qc.ts                    # ffprobe checks (resolution, fps, pix_fmt, duration, black, audio, loudnorm, true peak)
│   ├── stills.ts                # one still per scene per format + side-by-side sheets
│   ├── posters.ts               # thumbnails from posters.json
│   ├── brand.ts                 # BrandLogo (800×800) + BrandBanner (2560×1440) → channel/
│   ├── short.ts                 # create Short from long-form scenes
│   ├── upload.ts / upload-md.ts # YouTube upload via API
│   ├── geo-setup.ts             # downloads Natural Earth 1:10m layers via mapshaper → data/geo/
│   ├── paleo-setup.ts           # plate-tectonic coastlines/rotations from gws.gplates.org
│   ├── terrain-setup.ts         # downloads elevation tiles for glmap terrain
│   ├── imagery-setup.ts         # downloads EOxCloudless 2016 imagery tiles
│   ├── add-audio.ts             # download Epidemic Sound signed URL → assets.json
│   ├── image.ts                 # search/pick licensed images (NASA/Commons/Pexels) → thumbnail sheet + assets.json
│   ├── credits.ts               # attribution text for used assets
│   ├── short.ts                 # create Short from long-form scenes
│   ├── clean.ts                 # delete previews/ (never output/)
│   ├── voice-test.ts            # Piper → whisper.cpp round-trip
│   ├── voices.ts                # ElevenLabs voice list + quota
│   ├── check-secrets.mjs        # verifies .env keys not committed
│   ├── install-hooks.mjs        # git hooks
│   └── server/                  # render server scripts (kokoro_voice.py, push-to-server.ps1, pull-from-server.ps1, setup-ubuntu.sh, transcribe.py)
├── templates/
│   └── project/                 # assets.json, brief.md, project.json, research.md, script.md, storyboard.json
├── projects/
│   ├── netherlands-is-not-holland/   # <-- THIS PROJECT
│   │   ├── project.json
│   │   ├── storyboard.json
│   │   ├── brief.md
│   │   ├── research.md
│   │   ├── script.md
│   │   ├── assets.json
│   │   ├── storyboard.json
│   │   ├── transcript.json
│   │   ├── assets/
│   │   ├── audio/
│   │   │   ├── narration/      # per-scene WAV + .timing.json + manifest.json
│   │   │   ├── sfx/            # Epidemic Sound WAVs
│   │   │   ├── mix.wav         # pre-mixed narration + ducked music + SFX
│   │   │   └── mix.json        # {key, duration, narrationClips, music, sfx, duckedSpans, measured}
│   │   ├── geo/
│   │   │   ├── countries-10m.json, admin1.json, disputed.json, rivers.json, lakes.json
│   │   │   ├── flags/4x3/nl.svg, flags/1x1/nl.svg
│   │   │   ├── imagery/        # EOxCloudless tiles
│   │   │   └── terrain/        # terrarium tiles
│   │   ├── output/
│   │   │   ├── netherlands-is-not-holland.srt
│   │   │   ├── netherlands-is-not-holland.vtt
│   │   │   └── netherlands-is-not-holland_9x16_1080x1920_preview.mp4
│   │   ├── previews/
│   │   │   ├── stills/         # 9x16_1080x1920_f00042.png … f01011.png
│   │   │   └── netherlands-is-not-holland_9x16_1080x1920_preview.mp4
│   │   ├── youtube.json
│   │   └── netherlands-is-not-holland-upload.md
│   └── ... (25+ other projects)
├── data/
│   └── geo/
│       ├── countries-10m.json, admin1.json, disputed.json, rivers.json, lakes.json
│       ├── paleo/muller2019.json, muler2019-boundaries.json
│       ├── raster/bluemarble-3600.jpg
│       ├── terrain/terrarium/... (elevation tiles)
│       └── imagery/s2cloudless-2016/... (EOxCloudless tiles)
├── library/
│   ├── sfx/
│   │   ├── kit/kit.json              # sfxKit template (pop, slam, swish, click, whoosh, pulse, paper, tick, thud, flip, stamp, ping, bass, gavel, shutter, reverse, footsteps)
│   │   ├── es-*.wav (Epidemic Sound)
│   │   ├── px-*.wav (Pixabay)
│   │   └── sources/ (original MP3s)
│   └── overlays/
│       ├── subscribe-button.webm (VP9 alpha, all-keyframe)
│       └── sources/profounder_com_*.webm
└── tools/ (gitignored)
    ├── whisper/Release/whisper-cli.exe + ggml-base.en.bin
    └── piper/piper.exe + voices/
```

---

## 2. Per-Project Files (What Defines a Video)

| File | Purpose |
|------|---------|
| `project.json` | format, fps, theme, captionStyle, style, sfxKit, audio (provider/voice/rate/maxPause/music/duckDb/targetLufs/truePeak), safeZoneProfile |
| `storyboard.json` | Array of scenes: `{id, type, duration, narration, narrationOffset, narrationTail, data, sfx[], cues?, beats?}` |
| `brief.md` | Goal, audience, deliverables, tone, must-include/avoid, sources |
| `research.md` | Fact table with source URLs + verified flags |
| `script.md` | Human-readable narration per scene |
| `assets.json` | `{assetId: {type, path, source, license, provider, credit, attributionRequired, focalPoint?, original?, retrieved}}` |
| `transcript.json` | `{engine, scenes: {sceneId: {audioHash, words: [{text, start, end, emphasis, matched}]}}}` |
| `youtube.json` | `{title, description, tags[], categoryId, privacy, madeForKids}` |
| `youtube-upload.md` | Human-readable upload checklist |

---

## 3. Scene Types Used in This Project

All scenes are **`glmap`** (MapLibre GL JS flat map with tilt/rotate).

| Scene | Duration | Key Beats |
|-------|----------|-----------|
| s1-hook | 1.5s | highlight Netherlands + flag, label "HOLLAND?", strike "NOT A COUNTRY" stamp |
| s2-country | 4.0s | highlight Netherlands + flag/label, pulse, stamps "12 PROVINCES", "17M PEOPLE", "0 MOUNTAINS" |
| s3-two | 3.0s | highlight Noord-Holland/Zuid-Holland gold, labels + pulses |
| s4-cities | 4.0s | Amsterdam/Rotterdam labels + rings, "ECONOMIC GIANTS" stamp, full NL highlight + flag |
| s5-analogy | 3.0s | "10 PROVINCES NOT HOLLAND" stamp, "EVERY AMERICAN?" stamp, "LIKE CALLING US CALIFORNIA" stamp |
| s6-rebrand | 4.0s | 10 provinces highlight red, "THEY HATED IT", year 2020 count-up, "HOLLAND DROPPED" stamp + strike |
| s7-payoff | 2.0s | full NL highlight orange + pulse, subscribe button (top) |

**All scenes:** `palette: "dusk"`, `imagery` (EOxCloudless 2016, slight desaturation), `terrain` (relief 0.35, depth true), `camera` with `move` + `ease: "snap"/"glide"`, `sfx` from sfxKit.

---

## 4. Production Pipeline (The Exact Commands)

### 4.1 Create Project (once)
```bash
npm run create -- "Netherlands is not Holland" --format 9:16 --theme geo
```

### 4.2 Write Project Files
Edit: `project.json`, `storyboard.json`, `brief.md`, `research.md`, `script.md`, `assets.json`

### 4.3 Geo Data Setup (once per machine, then per-project copy)
```bash
npm run geo:setup                    # builds data/geo/ from Natural Earth
npm run terrain:setup -- --project netherlands-is-not-holland
npm run imagery:setup -- --project netherlands-is-not-holland
```
→ copies required layers/flags/terrain/imagery tiles to `projects/<id>/geo/`

### 4.4 Assets
```bash
npm run image -- search "Amsterdam" --project netherlands-is-not-holland --source commons
npm run image -- pick 1 --as amsterdam-photo --project netherlands-is-not-holland --focal 0.5,0.5
npm run audio:add -- --project netherlands-is-not-holland --as es-pop --type sfx --url "<signed_url>" --title "UI Click" --source "epidemic-sound:..."
```

### 4.5 Audio Pipeline (sequential, each step skips unchanged work)
```bash
npm run voiceover -- --project netherlands-is-not-holland   # Edge TTS BrianMultilingualNeural +0%, maxPause 0.2 → audio/narration/*.wav + .timing.json + manifest.json
npm run transcribe -- --project netherlands-is-not-holland  # aligns script to Edge word timings → transcript.json
npm run captions -- --project netherlands-is-not-holland    # → output/*.srt + .vtt
npm run audio -- --project netherlands-is-not-holland       # FFmpeg mix (narration + ducked music + SFX) → audio/mix.wav + mix.json
```
**Or one-liner:** `npm run narrate -- --project netherlands-is-not-holland`

### 4.6 Validation (must pass 0 errors)
```bash
npm run validate -- --project netherlands-is-not-holland
```
Checks: storyboard integrity, assets exist + source+license, fonts, layout (safe zones, overlaps, overflow), moments (≤2s gap for kinetic), voice gaps (≤0.35s), narration freshness, caption pages, geo data present.

### 4.6 Stills (review before render)
```bash
npm run stills -- --project netherlands-is-not-holland --formats 9:16
```
→ `previews/stills/9x16_1080x1920_fXXXXX.png` (one per scene at key frames)

### 4.7 Preview Render (review before final)
```bash
npm run render:preview -- --project netherlands-is-not-holland --scale 0.25 --concurrency 1
```
→ `previews/netherlands-is-not-holland_9x16_1080x1920_preview.mp4` (25% scale, fast)
→ QC runs automatically after render.

**Review the preview.** If changes needed → edit storyboard → re-run audio/validate/preview.

### 4.8 Final HQ Render
```bash
npm run render -- --project netherlands-is-not-holland
```
→ `output/netherlands-is-not-holland_9x16_1080x1920.mp4` (full 1080×1920, CRF 18)
→ Auto-chunks into 60s parts if >2 min (resumable via `parts.json`).
→ QC runs automatically.

### 4.9 Post-Render QC (optional, render does it)
```bash
npm run qc -- output/netherlands-is-not-holland_9x16_1080x1920.mp4 --project netherlands-is-not-holland --format 9:16
```

### 4.10 Publish Artifacts
```bash
npm run credits -- --project netherlands-is-not-holland     # → output/...-credits.txt
npm run posters -- --project netherlands-is-not-holland      # → output/...-thumb-*.png from posters.json
npm run upload -- --project netherlands-is-not-holland       # YouTube upload (private until manual publish)
```

---

## 5. Key Concepts Any Agent Must Know

| Concept | Rule |
|---------|------|
| **Format single source** | Never hardcode width/height/fps. Use `resolveFormat()` from `project.json` + `--format` flag. |
| **Responsive = re-layout** | Scenes get `LayoutContext.regions` from `engine.ts` — never hardcode coordinates. |
| **Captions = script text + whisper timing** | Never guess timing. `alignScript()` aligns script tokens to whisper word boundaries. |
| **Audio mix = deterministic** | Ducking = known narration spans (ramp down 0.25s before, up 0.6s after; gaps <1.2s stay ducked). Two-pass `loudnorm`. |
| **SFX kit** | Project declares `sfxKit` mapping sound kinds → assets. Scenes declare `beats` with `sfx` kinds; loader injects actual SFX entries. |
| **Kinetic moments** | Every scene must declare `moments()` (cue words or seconds). Validate errors if gap >2s. |
| **Geo data** | `scripts/lib/geodata.ts` computes needed layers/flags/tiles per project. `ensureGeoData()` copies to `<project>/geo/`. Missing → error. |
| **Render chunking** | Videos >2 min auto-split into ~60s parts (`<output>.parts/` + `parts.json`). Re-run resumes. |
| **Stills first** | Always `npm run stills` before preview/final render. |
| **Preview first** | Always `render:preview` (25% scale, fast) → human approval → `render` (full quality). |
| **No code changes without approval** | Any `src/`/`scripts/` change → document → ask before commit → ask before push. |
| **Secrets** | `.env` has keys (never committed). `ELEVENLABS_API_KEY`, `PEXELS_API_KEY`, `YOUTUBE_CLIENT_ID/SECRET`, `RENDER_SERVER`. |
| **Machine constraints** | 2-core i5-5200U, 3.9 GB RAM, no CUDA. `concurrency: 2` default, `--concurrency 1` for heavy glmap. Close Chrome before render. |

---

## 6. This Project's Specific Settings

| Setting | Value |
|---------|-------|
| Format | 9:16 (1080×1920) @ 30fps |
| Theme | `geo` (dusk palette) |
| Caption style | `kinetic` (auto for 9:16) |
| Style | `kinetic` (2s moment gap, frozen ≤1.5s) |
| Voice | `en-US-BrianMultilingualNeural`, rate `+0%`, `maxPause: 0.2` |
| Music | none |
| SFX Kit | full kinetic kit (pop, slam, swish, click, whoosh, pulse, paper, tick, thud, flip, stamp, ping) |
| Imagery | EOxCloudless 2016, saturation -0.05, contrast 0.06, brightness 0.02 |
| Terrain | relief 0.35, tint false, depth true |
| Camera | `move` on every key after first, `ease: "snap"` (default) or `"glide"`, drift 0.02 |
| Safe zone | `auto` → `social-vertical` (bottom 20%, right 12%) |
| Subscribe button | `asset:ov-subscribe` (library/overlays/subscribe-button.webm) |

---

## 7. What "Push" Means

After you approve the final HQ render and publish artifacts:

1. **Commit** all new/changed files in `projects/netherlands-is-not-holland/` + any modified `src/`/`scripts/` (if any were changed with approval).
2. **Push** to `origin/main` (GitHub: `kipcolehoward-star/video-project`).
3. **Upload** to YouTube via `npm run upload` (or manual via Studio using `youtube-upload.md`).

The repo currently has **25+ untracked projects** (most made since last push). A clean push would include only this project + any approved code changes.

---

## 8. Quick Reference: Command Cheatsheet

```bash
# One-liner full pipeline (after files written)
npm run narrate -- --project netherlands-is-not-holland && \
npm run validate -- --project netherlands-is-not-holland && \
npm run stills -- --project netherlands-is-not-holland --formats 9:16 && \
npm run render:preview -- --project netherlands-is-not-holland --scale 0.25 --concurrency 1
# → review preview → if good:
npm run render -- --project netherlands-is-not-holland
npm run credits -- --project netherlands-is-not-holland
npm run posters -- --project netherlands-is-not-holland
npm run upload -- --project netherlands-is-not-holland
```

---

## 9. What Could Go Wrong (Common Issues)

| Symptom | Fix |
|---------|-----|
| `validate` → "moments gap >2s" | Add more `beats` with `on: <cue>` or numeric `at: <seconds>` in the gap range |
| `validate` → "voice gap >0.35s" | Reduce `maxPause` or add `narrationOffset: 0`/`narrationTail: 0` |
| `render` timeout on glmap | `--concurrency 1 --scale 0.25` for preview; `--concurrency 1` for final; close Chrome |
| `audio` → "sfx not in assets.json" | Add SFX to `assets.json` + copy WAV to `audio/sfx/` |
| `validate` → "geo-data missing tiles" | Run `npm run terrain:setup -- --project <id>` / `npm run imagery:setup -- --project <id>` |
| `render` → EPERM on rename | Close media player that has the output file open |

---

## 10. Current State of This Project

| Step | Status |
|------|--------|
| Project scaffolded | ✅ |
| Project files written | ✅ |
| Geo data + flags copied | ✅ |
| SFX copied | ✅ |
| Voiceover (Edge TTS) | ✅ |
| Transcribe (Edge timing) | ✅ |
| Captions (SRT/VTT) | ✅ |
| Audio mix (55 SFX, -16.4 LUFS) | ✅ |
| Validate (0 errors, 67 moments) | ✅ |
| Stills (7 frames) | ✅ |
| Preview render (25% scale, QC pass) | ✅ |
| **Awaiting your preview approval** | ⏳ |

---

**Next action after your approval:** Run final HQ render → credits → posters → upload.

---

*End of crossover pipeline documentation. Any agent with this file + repo access can execute the full pipeline.*