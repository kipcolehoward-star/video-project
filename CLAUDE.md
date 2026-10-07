# Video Production Framework — Claude Code guide

Local, code-driven, **multi-format** video production. Remotion (React/TS)
composes; FFmpeg processes and inspects media; everything runs on this
machine with free/open-source tools. No paid APIs or services unless the user
explicitly approves them.

## Non-negotiables

1. **No format is the default except what project.json says.** Never hard-code
   width, height, aspect ratio or fps anywhere outside `src/config/formats.ts`.
   Scenes get rectangles from the layout engine, never raw coordinates.
2. **Responsive = re-layout, not scaling.** A 9:16 version rearranges
   (row → column, chart direction, anchoring, type scale); it is never a
   stretched or letterboxed 16:9.
3. **Captions come from real timing** (word-level transcription). Never guess.
4. **Never fabricate** facts, asset sources or licenses. Unknown → write
   `"unknown"`; validation will flag it.
5. **Editorial restraint.** No gradients-for-decoration, glow, emoji, bouncy or
   random motion, gratuitous transitions or fake UI. Every element must serve
   the narration. Default to cuts; fades only where they mean something.
6. Inspect before changing; smallest appropriate change; test; report how to preview.

## Machine constraints (inspected 2026-10-06)

- Windows 10, Intel i5-5200U (2 cores / 4 threads), **3.9 GB RAM**, Intel HD 5500 (no CUDA).
- Node 24.12, npm 11.6, FFmpeg 9.0.1 (gyan full build: QSV, loudnorm,
  sidechaincompress, ebur128, blackdetect), Python 3.14, Chrome installed.
- **Close the user's Chrome/other heavy apps before rendering.** With Chrome open (≈2 GB),
  free RAM drops below 500 MB: renders fall from ~7 fps to ~1 fps and Chrome startup
  times out. Check free RAM first (PowerShell Win32_OperatingSystem.FreePhysicalMemory).
- Consequences: render concurrency 2; review edits with `render:preview --scenes …`
  (partial, 50% scale) and only render the full video at the end; an 8-minute
  photo/map-heavy video takes ~50 min at full quality; full 1080p renders run ~1–3 fps. Avoid GPU-only/PyTorch tools.
  Keep media proxies small; don't open many Chrome tabs while rendering.

## Layout of the repo

```
src/
  config/       formats.ts (presets + resolver), safeZones.ts, themes.ts,
                fonts.ts (bundled @fontsource, OFL), project.ts (types + timeline)
  layouts/      engine.ts  — PURE layout functions: format -> named Regions
                ProjectContext.tsx — useLayout/useTheme/useAsset hooks
  components/   Region, Typography, MediaFrame (focal-point crop), LowerThird, SafeZoneGuides
  animations/   motion.ts — small vocabulary: progress, riseIn, fadeOut, pushIn
  scenes/       one file per scene type + registry.ts
  compositions/ Main.tsx — storyboard -> Sequences (cuts / fades)
  Root.tsx      calculateMetadata derives size/fps/duration from props
scripts/        Node CLI (tsx). lib/: project loading, checks, qc, remotion API
templates/project/  scaffold used by `npm run create`
projects/<id>/  one folder per video (this folder is Remotion's public dir at render)
  project.json  format, fps, theme, safe-zone profile, caption style
  brief.md, research.md, script.md, storyboard.json, assets.json, transcript.json
  assets/ audio/ broll/ graphics/ previews/ output/
```

## How data flows

`scripts/lib/project.ts` loads `projects/<id>/*.json`, resolves the format
(**priority: `--format` > `VIDEO_FORMAT` env > project.json**) and builds
`MainProps`. Those props go to Remotion; `Root.calculateMetadata` turns them
into width/height/fps/duration. The same props feed `validate` and `qc`.

## Scenes

A scene module exports a `SceneDefinition`:

- `component` — React; reads regions from the layout engine.
- `regions(ctx, data)` — pure; the exact rects it draws into (with roles
  `text | overlay | media | decor`). QC and `--guides` use this, so it must
  match what the component renders.
- `textBlocks(ctx, data)` — text per region, for overflow estimation.
- `assetRefs(data)` — `asset:<id>` references, for missing-asset checks.

- `cues(data)` — narration cue words the scene animates on; `validate`
  errors if a cue word is not in the scene's narration.

Register in `src/scenes/registry.ts`; reference by `type` in storyboard.json.
Current: `title`, `split`, `statistic` (auto-fits the number, thousands
separators, optional bar/column chart), `steps` (numbered process),
`comparison` (values with count-up, `lead` operator, highlight), `diagram`
(animated diagram in the media slot; library in `src/graphics/diagrams/`,
currently `trilateration`), `map` (world/usa from public-domain data; shapes
highlight and pins drop on cues; tiny places are pins, not shapes), `photo`
(full-bleed photo, focal-point push-in, lower-left title on a cue), `list`
(display / numbered recap / pairs, fitted to space, optional photo backdrop),
`grid` (reference cards, e.g. country emergency numbers). `title` also takes
`cue`, `subtitleCue`, `size: "hero"` (one-word punchlines), `background`,
`fadeOut`. `comparison` items take `display` strings ("9/11", "1968", names).
Planned: timeline, quote, photo-montage, broll (video), screen-recording.

**Narration cues:** animations should land on the word that motivates them.
`useCue(scene)(word, fallbackFrame)` returns the frame where the narrator
says `word` (`"second#2"` = second occurrence), from transcript.json; before
voiceover exists it falls back to evenly spaced timing. Steps/comparison
items take `cue`; diagrams take a `cues` map (e.g. `{"ring2": "second"}`).

**Content priority:** in compact frames scenes drop optional copy (split/diagram
`body`, step `text`, comparison `note`) rather than shrinking type. The fit
test is shared with QC so render and validation agree. `itemsLayout` picks
structure by frame shape: row (landscape; square ≤3 items), 2×2 grid
(square, 4 items), column (portrait).

To add layout behaviour, add a pure function to `layouts/engine.ts` that
branches on `ctx.format.orientation` and returns Regions. Keep text regions
inside `ctx.safe`; let media bleed.

## Narration, captions and audio

Storyboard scene fields: `narration` (voiceover text; `*word*` marks keywords
for educational captions; `{shown|spoken}` is a pronunciation override, e.g.
`{999|nine-nine-nine}` — captions show "999", the voice says "nine nine nine";
hyphens, no spaces, in the spoken part), `narrationOffset`, `narrationTail`, and
`sfx: [{asset, at, gainDb}]` (`at` = seconds from scene start).
project.json: `captionStyle` (`auto` = documentary in landscape, kinetic in
portrait/square; or `documentary | kinetic | educational | none`) and `audio`
(`voice`, `speaker`, `lengthScale`, `music` asset id, `musicDb`, `duckDb`,
`targetLufs` default -16, `truePeak` default -1.5).

- **Timeline:** with narration, `duration` is a *minimum*; scenes extend to
  offset + voiceover + tail (`resolveDurations`). Remotion, the mixer, captions
  and QC all use this resolved storyboard.
- **Caption paging** breaks at clause boundaries (carries an unfinished clause
  to the next cue), never splits number phrases ("about three hundred |
  metres"), max 42 chars × 2 lines for documentary / SRT.
- **Caption text comes from the script; timing from whisper.** Alignment
  (`alignScript`) times runs of inexact words together, so "nineteen twenty"
  vs recognised "1920" still gets correct timing.
- Do NOT pass the script to whisper as `--prompt`: in testing it made whisper
  compress or skip speech. Clips are padded with 1 s of silence before
  transcription (whisper squashes timestamps at the end of a file), and
  special tokens like `<|endoftext|>` are filtered out.
- **Caption band:** when captions are on, the layout engine reserves a band at
  the bottom of the platform safe zone and shrinks `ctx.safe` so scenes can
  never collide with captions. Scenes drop optional copy (SplitScene `body`)
  when it no longer fits — content priority, not shrinking text.
- **Ducking** is a deterministic volume envelope from known narration spans
  (ramp down 0.25 s before speech, up 0.6 s after; gaps < 1.2 s stay ducked),
  not a signal-driven compressor. Narration gets only a high-pass and a light
  2.5:1 compressor; final loudness via two-pass `loudnorm`.
- Freshness is hash-based: voiceover (text+voice), transcript (audio),
  mix (timeline+inputs+levels). `validate` errors on anything stale; `render`
  rebuilds a stale mix automatically.

## Music & SFX (Epidemic Sound, user's Pro plan)

Connected via Epidemic's official MCP connector (user scope, key in the Windows
env var `EPIDEMIC_SOUND_API_KEY`, never in files). Tools: `SearchSoundEffects`,
`SearchRecordings` (bpm/mood/genre filters, stems), `DownloadSoundEffect`,
`DownloadRecording` (WAV, FULL or BASS/DRUMS/INSTRUMENTS stems), `EditRecording`
(fit a track to a length), voiceover tools.
Workflow: search → audition `lqmp3Url` previews if needed → `Download*` (WAV) →
`npm run audio:add -- --project <id> --as <assetId> --type sfx|music --url "<signed url>"
--title "<title>" --source "epidemic-sound:<uuid>"` → reference the asset in
storyboard `sfx` or `audio.music`. Signed URLs expire; download immediately.
Licence: covered by the user's subscription for content published while it is
active; the user must whitelist their YouTube channel in Epidemic to avoid
Content ID claims. Do NOT use the developer-portal API free tier (no commercial
licence). Prefer Epidemic over synthesised placeholders for music and SFX.

## Geography toolkit (atlas scene)

Data: `npm run geo:setup` builds Natural Earth 1:10m layers (public domain) into
`data/geo/` (committed): admin1 (states/provinces), rivers, lakes, disputed
(region names in `name`, claimant in `claimant`), countries-10m. Render/stills/dev
copy only what a project uses into `<project>/geo/` (gitignored), plus flag SVGs.
Avoid GADM (non-commercial licence); OSM data needs "© OpenStreetMap contributors".

Atlas options (all timing via cue word or seconds):
- `detail`: auto (110m whole-Earth, 50m mid, 10m when any camera zoom ≥ 7) | 50m | 10m
- `layers`: ["rivers","lakes","admin1","disputed"], `layersAt`, `admin1Countries: ["South Africa"]`
- `flagMasks: [{name, iso, at, opacity}]` — flag clipped inside the country, fitted
  to the part on screen (whole flag visible even when zoomed into a big country)
- `flagBadges: [{iso, lon, lat | name, at, label, size}]` — round badge with pop-in.
  Use explicit lon/lat for countries with overseas territories (France's centroid
  is in the Atlantic because of French Guiana).
- `outline`/`labels`/`pulse` names resolve to a country, then a disputed area,
  then a state/province.
- Flags: flag-icons (MIT), ISO 3166-1 alpha-2 lowercase ("ls", "za", "in").
  `validate` errors on unknown codes or missing layers.
- `routes: [{from:[lon,lat], to, via:[[lon,lat]...], at, duration, style: solid|dashed,
  color: gold|white|red, arrow, fromFlag, toFlag, label}]` — great-circle lines that
  draw themselves with an arrowhead. Use `via` waypoints to keep sea lanes at sea
  (e.g. Malacca, Bab-el-Mandeb, Suez, offshore Iberia) and check the still.
- `palette`: atlas (dark/amber) | geo (slate, red #FF3B30 focus, yellow #FFCC00 `alt`,
  grey #8E8E93 disputed) | paper (parchment, dark ink). Defaults from project theme
  (`geo`/`paper` themes exist). `alt: [{name, at}]` = second highlight colour.
- `basemap: "satellite"` — NASA Blue Marble (public domain, data/geo/raster) on the
  globe, cross-fading to the vector map between zoom 1.3 and 3.2. Heaviest effect
  (~2 fps at preview size): use for short globe-scale hooks, not long scenes.
- project.json `texture`: none | grain | paper — procedural grain overlay (5–12%).
Engine notes: only features in view are drawn (culling); polygons with reversed
winding (would flood the globe) are corrected per part on load (`fixWinding`) —
Natural Earth 10m Maldives and two simplified lakes needed this.
Test project: `projects/demo-geo-toolkit` (6 scenes: provinces/rivers/flags, Kashmir
disputed + masks, capital badges, shipping route, satellite dive, paper palette).
Script input: the user may write cue-sheet scripts (VOICEOVER / VISUAL_TYPE /
MAP_TARGET / OVERLAY / SFX_TRIGGER); convert them to storyboard JSON by hand, mapping
timestamps to narration cue words.

## Images (licensed sourcing)

`npm run image -- search "<query>" --project <id> --source nasa|commons|pexels`
writes a numbered thumbnail sheet (`previews/image-search/sheet.png`) — LOOK at
it before choosing. `npm run image -- pick <n> --as <assetId> --focal x,y`
downloads full-res (rejects < 1600 px long side; downscales > 3840), and writes
assets.json with source URL, author, licence, credit line, retrieval date.
- Sources: NASA (no key, generally not copyrighted), Wikimedia Commons (no key;
  only PD / CC0 / CC BY / CC BY-SA accepted; BY-SA flagged — prefer PD/CC0/BY),
  Pexels (`PEXELS_API_KEY`, Pexels License). Stock video (Pexels) is planned.
- **Accuracy rule:** keyword search returns wrong subjects (searching "GPS
  satellite" on NASA returned CubeSats and other spacecraft). Only use an image
  when its source page confirms it depicts what the narration says. Never
  present a different object as the subject.
- Use real images only when a scene genuinely needs one; typography/diagrams
  remain the default.
- `npm run credits` → `output/<id>-credits.txt` with attribution for assets
  actually used in the video (plus voice attribution when required).

## Safe zones

`auto` picks by orientation: landscape → broadcast title-safe; portrait →
`social-vertical` (reserves bottom 20% and right 12% for Shorts/TikTok/Reels
UI); square → `social-square`. Override in project.json `safeZoneProfile`.

## Commands

| Command | What it does |
|---|---|
| `npm run create -- "Topic" [--format 9:16]` | scaffold `projects/<slug>/` |
| `npm run dev -- --project <id> [--format 9:16] [--guides]` | Remotion Studio (`preview` is an alias) |
| `npm run validate -- --project <id>` | storyboard, assets, fonts, layout for 16:9/9:16/1:1 |
| `npm run stills -- --project <id> [--guides]` | one still per scene per format + side-by-side sheets |
| `npm run render:preview -- --project <id> [--format 9:16]` | 50% scale, veryfast x264, JPEG 70 → `previews/` (review drafts) |
| `npm run render:preview -- --project <id> --scenes s16,s17` | only those scenes (+ everything between), with their audio — fastest way to check an edit |
| `npm run render -- --project <id> --from s10 --to s14` | partial final-quality render of a scene range (ids or unique prefixes) |
| `npm run render -- --project <id> [--format 9:16] [--guides]` | full render → `output/`, then QC |
| `npm run render:all-formats -- --project <id>` | 16:9, 9:16, 1:1 from one bundle |
| `npm run qc -- <file.mp4> --project <id> [--format 9:16]` | QC an existing file |
| `npm run clean` | delete previews + caches (never `output/`) |
| `npm run setup:tools` | download whisper.cpp, Piper, voices, model into tools/ |
| `npm run tools:check [-- --voice <name>]` | Piper → whisper.cpp round trip with word timings |
| `npm run voices` | ElevenLabs voices on the account + remaining characters (free call) |
| `npm run voiceover -- --dry-run` | show scenes/characters that would be generated (and billed) |
| `npm run image -- search/pick ...` | licensed image search with thumbnail sheet; pick writes assets.json |
| `npm run credits` | attribution text for the video description |
| `npm run geo:setup [-- --force]` | build Natural Earth map layers into data/geo/ |
| `npm run audio:add -- ...` | download a licensed audio file (Epidemic signed URL) into the project + assets.json |
| `npm run typecheck` | tsc |
| `npm run voiceover -- [--scene <id>] [--force]` | Piper → `audio/narration/<scene>.wav` + manifest (unchanged scenes skipped) |
| `npm run transcribe -- [--force]` | whisper.cpp timings aligned to script words → `transcript.json` |
| `npm run captions` | SRT + VTT subtitle files → `output/<id>.srt/.vtt` |
| `npm run audio` | FFmpeg mix → `audio/mix.wav` (ducked music, SFX, two-pass loudnorm) |
| `npm run narrate` | voiceover → transcribe → captions → audio, in order |

## QC coverage

Pre-render (`validate`, also run by `render`): unknown scene types, duplicate
ids, scene timing, missing assets/fonts, unknown source/license, region
outside frame, text/overlay outside safe zone, text–text / text–media /
text–overlay overlaps, estimated text overflow.
Post-render (`qc`): resolution, aspect ratio, square pixels, fps, pixel
format, duration, black segments, audio presence/duration, clipping, loudness.
Narration (`validate`): missing/stale voiceover, overrun, transcript staleness, word count vs script, ordering, recognition rate < 80% (likely mispronunciation), caption pages too short / overlapping / past the end, stale mix, required voice attribution. Post-render adds loudness vs target ±1 LU, true peak, required audio.
Not yet: image-crop quality.

## Local speech toolchain (installed in tools/, gitignored)

Reproduce with `npm run setup:tools`; verify with `npm run tools:check`.
Versions, URLs and licences are recorded in `scripts/lib/tools.ts`.

| Stage | Tool | Notes |
|---|---|---|
| Composition | Remotion 4.0.533 + React 19 + TS | npm |
| Media / encode / mix / QC | FFmpeg 9 (system) | |
| TTS | Piper 1.2.0 standalone (`tools/piper/piper.exe`) | ~1.5–2.5x real time on this CPU |
| Transcription | whisper.cpp b5454 CPU (`tools/whisper/Release/whisper-cli.exe`) + `ggml-base.en` | ~1x real time on short clips (incl. model load); 16 kHz mono WAV input; `-ojf` gives token timings |
| Fonts | @fontsource Inter + Source Serif 4 (OFL) | npm |

**Voice providers** (`project.json` → `audio.provider`):
- `piper` (default) — local, free, robotic-ish. Voices below.
- `edge` — Microsoft Edge online voices via the `edge-tts` Python package
  (`scripts/lib/tts/edge_tts_cli.py`); returns word boundaries for exact
  timing. **Unofficial endpoint, no publishing rights granted → personal /
  non-monetised only.** The same voices (e.g. `en-US-BrianMultilingualNeural`)
  are licensed for commercial use via Azure AI Speech **paid** tier (F0 free
  tier has no commercial rights) — the upgrade path is a provider switch.
  Edge reads "999" as "nine hundred ninety-nine" and "112" as "one hundred
  twelve": use pronunciation overrides.
- `elevenlabs` — paid API, approved by the user 2026-10-06 for realistic VO.
  Needs `ELEVENLABS_API_KEY` in `.env` (gitignored; never print it). Set
  `audio.voice` to a voice_id (`npm run voices` lists them + quota) and
  `audio.model` (`eleven_multilingual_v2` default; `eleven_v4` = ElevenLabs'
  top narration model per their docs, 2026). Each scene is generated with the
  neighbouring narration as `previous_text`/`next_text` for continuous prosody.
  Uses `/with-timestamps`: captions are timed from the engine's character
  alignment (exact); `npm run transcribe -- --verify` cross-checks with whisper.
  **Licence:** free plan = non-commercial + "elevenlabs.io" in the title; paid
  plans include commercial rights. Credits are billed per character: the
  voiceover step skips unchanged scenes, persists after every clip, checks
  remaining quota first, and supports `--dry-run`. Never use `--force` with
  ElevenLabs unless the user wants to pay for regeneration.

Voices (licences checked from each MODEL_CARD):
- `en_US-joe-medium` — CC0. Default.
- `en_US-libritts_r-medium` — CC BY 4.0; **credit required**:
  "Voice: Piper en_US-libritts_r, trained on LibriTTS-R (CC BY 4.0)." Multi-speaker (`--speaker <id>`).
- Do NOT add `lessac` (Blizzard research licence) or `ryan` (CC BY-NC-SA) for monetised work.
  Check MODEL_CARD before adding any voice.

**Caption rule learned in testing:** whisper mis-hears words (e.g. "coasts" →
"coast"). Captions must display the *script* text and use whisper only for
*timing* (align script words to whisper word timestamps).

Avoid on this machine: WhisperX / PyTorch stacks (no CUDA, 4 GB RAM, Python 3.14
wheel gaps). `edge-tts` is installed system-wide but is an **online Microsoft
service**, not local — only use with explicit user approval.

## Roadmap (pipeline stages)

brief → research → script → scene breakdown → storyboard → voiceover (Piper, installed)
→ transcription (whisper.cpp, installed) → asset collection → B-roll mapping → motion
graphics → captions → audio mix (FFmpeg ducking + loudnorm) → composition →
preview → QC → final render. Each stage writes files into `projects/<id>/`.

## Productions

| Project | Format | Length | Status |
|---|---|---|---|
| `example-project` | 16:9 + 9:16 | 24.8 s | format/caption/audio test bed |
| `how-gps-knows-where-you-are` | 16:9 | 88.2 s | first real video, rendered 2026-10-06; no music (none licensed); research.md cites every claim |
| `facts-about-911` | 16:9 | 8:06 | user's script verbatim; Edge voice Brian (non-monetised); 8 licensed photos; synthesised phone ring; captions off (SRT exported) |

## Backup (git)

Private repo: https://github.com/kipcolehoward-star/video-project (branch `main`).
- Commit + push after meaningful work (a finished video, a framework change).
- Never commit `.env` (gitignored). A pre-commit hook (`scripts/check-secrets.mjs`,
  install with `npm run hooks:install` after a fresh clone) blocks commits containing
  `.env` values, secret-looking env vars (e.g. EPIDEMIC_SOUND_API_KEY) or known key
  formats. Never print a suspected secret when investigating — report the file only.
- Not in git (by design): `node_modules/`, `tools/` (npm install / npm run
  setup:tools), previews, mixes (npm run audio), Epidemic music WAVs
  (re-download by ID from assets.json), and final MP4s — back those up
  separately (e.g. OneDrive). Subtitles and credits files are committed.
