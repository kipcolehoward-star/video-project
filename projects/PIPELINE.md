# Video production pipeline — quick reference

Quick lookup for the steps, commands and file discipline used to go from a topic to a published Short or long-form video. Full architecture is in `../CLAUDE.md`.

## Tech stack

| Layer | Tool | Notes |
|---|---|---|
| Composition | **Remotion 4.0.533** + React 19 + TypeScript | headless Chrome render |
| Media / encode / mix / QC | **FFmpeg 9** (gyan full build) | QSV, loudnorm, ebur128, blackdetect |
| TTS (local) | **Piper 1.2.0** (`tools/piper/`) | ~1.5–2.5× real time; default voice `en_US-joe-medium` (CC0) |
| TTS (online) | **edge-tts** Python package | free, unofficial endpoint → personal/non-monetised only; or **ElevenLabs** paid API |
| Transcription | **whisper.cpp** CPU (`tools/whisper/`) + `ggml-base.en` | ~1× real time on short clips; 16 kHz mono WAV in; `-ojf` gives token timings |
| Maps | **MapLibre GL JS** 5.24 (BSD) + Natural Earth 1:10m | no token, offline at render |
| Fonts | @fontsource Inter, Bebas Neue, Patrick Hand, Source Serif 4 (OFL) | bundled |
| Images | NASA PD / Wikimedia Commons PD/CC0/BY / Pexels License | `npm run image` writes source+licence into `assets.json`; keyword searches are unreliable — verify the subject on the source page before using |
| YouTube upload | YouTube Data API v3 via user's own GCP project | `YOUTUBE_CLIENT_ID/SECRET` in `.env`; refresh token stored outside repo at `~/.video-project/youtube-token.json` |
| Git | private repo `kipcolehoward-star/video-project`; MP4 previews/finals tracked with Git LFS | pre-commit hook blocks secrets |

## One-shot audio chain

```bash
npm run narrate                         # voiceover → transcribe → captions → audio, each step skips unchanged work
```

Re-run individual stages if needed:
```bash
npm run voiceover -- [--scene <id>] [--force]    # Piper/ElevenLabs/Edge → audio/narration/*.wav + manifest
npm run transcribe -- [--force]                   # whisper.cpp → transcript.json (word-level timing)
npm run captions                                  # SRT + VTT → output/<id>.srt/.vtt
npm run audio                                     # FFmpeg mix → audio/mix.wav (ducking + two-pass loudnorm)
```

## Step-by-step workflow

### 0 · Setup (one-time per clone)

```bash
npm install
npm run setup:tools          # downloads whisper.cpp, Piper voices, model into tools/
npm run hooks:install        # pre-commit hook that blocks .env / secrets
npm run geo:setup            # builds Natural Earth 1:10m layers into data/geo/
npm run paleo:setup          # plate-model coastlines for deep-time maps (one-off online fetch)
```

### 1 · Scaffold

```bash
npm run create -- "Your Topic" [--format 9:16] [--theme documentary|kinetic]
```
Creates `projects/<slug>/` with empty `project.json`, `brief.md`, `script.md`, `storyboard.json`, `assets.json`, `transcript.json`.

Extract a Short from an existing long-form video:
```bash
npm run short -- --project <long-id> --scenes s1a,s1b,s10a [--outro "..."] [--portrait-zoom 1.6] [--force]
```

### 2 · Write creative docs (manual)

Fill these in `projects/<slug>/`:

- `brief.md` — goal, audience, deliverables, must include / avoid
- `research.md` — every factual claim sourced
- `script.md` — one block per scene with `NARRATION:` and `VISUAL:` headings
- `storyboard.json` — scene array. Each scene has `type`, `data` (camera keys, beat params, palette, etc.), and `narration` text:
  - `*word*` marks keywords for educational captions
  - `{spoken|shown}` overrides pronunciation (e.g. `{999|nine-nine-nine}`)
  - `cue` words drive animation timing (`useCue(scene)(word)`)

### 3 · Collect licensed media

```bash
# Images — search returns a thumbnail sheet; look at it before choosing
npm run image -- search "<query>" --project <id> --source nasa|commons|pexels
# Then pick:
npm run image -- pick <n> --as <assetId> --focal x,y
# writes assets.json with URL, author, licence, retrieval date

# Audio / SFX
npm run audio:add -- ...      # downloads into project/assets/ + assets.json
```

Accuracy rule: keyword search returns wrong subjects. Only use an image when its source page confirms it depicts what the narration says.

### 4 · Review interactively

```bash
npm run dev -- --project <id> [--format 9:16] [--guides]
```
Opens Remotion Studio on port 3000. Only one Studio instance at a time.

### 5 · Validate (before any render)

```bash
npm run validate -- --project <id>
```
Checks unknown scene types, duplicate ids, missing assets/fonts/sources/licenses, region-out-of-frame, text overlaps, narration gaps > 0.35 s, stale mix, caption page length / overflow, frozen-frame budget (kinetic), glmap field validity. Fix errors before rendering.

### 6 · Render preview (iterative edit loop)

```bash
npm run render:preview -- --project <id> [--format 9:16] [--scale 0.25]
npm run render:preview -- --project <id> --scenes s16,s17   # only those scenes (+ everything between)
```
Outputs to `previews/`. `--scale 0.25` → 270×480 for a 9:16 video, about 3 fps for a glmap scene on the laptop. Faster feedback while editing animations and cues.

**Server rendering rules:**
- Preview and final rendering run on the VPS, not the 4 GB Windows laptop.
- The laptop is used to access the dashboard, review MP4s and pull completed project folders.
- If a preview MP4 is open in a player, close it before regenerating that preview.

### 7 · Final render

```bash
npm run render -- --project <id> [--format 9:16] [--guides] [--chunk <s>] [--no-chunks] [--keep-parts]
```
- Writes `output/<id>_<orientation>_<W>x<H>.mp4`
- Validates → renders → runs QC automatically
- Videos > 2 min auto-chunk into ~60 s parts (resumable: re-run the same command after a crash/interruption); parts joined with stream copy, master `audio/mix.wav` muxed in, frame count verified
- All formats at once: `npm run render:all-formats -- --project <id>` (16:9 + 9:16 + 1:1 from one bundle)

### 8 · Post-render QC

```bash
npm run qc -- <file.mp4> --project <id> [--format 9:16]
```
Resolution, aspect ratio, square pixels, fps, pixel format, duration, black segments, audio presence/duration, clipping, loudness vs target ±1 LU, true peak.

Still frames if needed:
```bash
npm run stills -- --project <id> [--formats 9:16] [--at 1.5,12]
```

Open finished previews/finals in your player immediately so you can watch them.

### 9 · Credits & caption outputs

```bash
npm run credits           # output/<id>-credits.txt (asset attributions + voice credit if required)
npm run captions          # regenerate SRT/VTT if script changed but audio didn't
```

### 10 · Prepare upload metadata

```bash
# Write projects/<id>/youtube.json manually:
# { title, description (intro + sources + hashtags), tags (exactly 4), categoryId "27",
#   privacy "private", madeForKids false }

npm run upload:md -- --project <id>
# → output/<id>-upload.md (title, tags, settings, full description with credits, paths to MP4/SRT/VTT)
# validates against YouTube size / character limits
```

### 11 · Upload (only after you approve that specific video)

```bash
npm run upload -- --login          # one-time browser sign-in; shows which channel
npm run upload -- --project <id>   # uploads MP4 + credits + SRT; writes output/<id>-youtube.json
npm run upload -- --project <id> --dry-run   # inspect without uploading
```

⚠️ Until your GCP project passes Google's YouTube API audit, API uploads come back **private and lockable** (can't be made public in Studio). In that case upload via youtube.com manually using the prepared `*-upload.md`. Composio was tried and dropped — its shared account exhausted its daily quota.

Custom thumbnails need a phone-verified channel.

### 12 · Channel branding (one-time or when updated)

```bash
npm run brand          # logo 800×800 + banner 2560×1440 from Brand.tsx → channel/
npm run posters -- --project <id> [--only a,b]    # thumbnails / logo / banner PNGs → output/
```

## Repository layout

```
src/
  config/       formats.ts, safeZones.ts, themes.ts, fonts.ts, project.ts
  layouts/      engine.ts (pure rects), ProjectContext.tsx (hooks)
  components/   Region, Typography, MediaFrame, LowerThird, SafeZoneGuides
  animations/   motion.ts (progress, riseIn, fadeOut, pushIn, kinetic easings)
  scenes/       one file per scene type + registry.ts
  compositions/ Main.tsx (storyboard → Sequences)
  Root.tsx      calculateMetadata derives size/fps/duration from props
scripts/        Node CLI (tsx). lib/: project loading, checks, qc, remotion API
templates/project/  scaffold used by `npm run create`
projects/<id>/  one folder per video (Remotion's public dir at render)
  project.json  format, fps, theme, safe-zone profile, caption style, audio config
  brief.md, research.md, script.md, storyboard.json, assets.json, transcript.json, youtube.json
  assets/ audio/ broll/ graphics/ previews/ output/
library/sfx/kit/    approved sound-effect library; edit here, don't apply per-project until agreed
data/geo/           committed Natural Earth layers + paleo plates
channel/            logo, banner, CHANNEL-SETUP.md
tools/              gitignored (whisper.cpp, Piper voices/model) — populated by `setup:tools`
.env                gitignored (API keys)
```

## Files written per completed video

| File | Written by | Committed? |
|---|---|---|
| `projects/<id>/project.json` | `create` / hand-edit | ✅ |
| `projects/<id>/brief.md` | hand | ✅ |
| `projects/<id>/research.md` | hand | ✅ |
| `projects/<id>/script.md` | hand | ✅ |
| `projects/<id>/storyboard.json` | hand | ✅ |
| `projects/<id>/assets.json` | `image` / `audio:add` | ✅ |
| `projects/<id>/transcript.json` | `transcribe` | ✅ |
| `projects/<id>/youtube.json` | hand | ✅ |
| `projects/<id>/audio/mix.wav` | `audio` / `narrate` | ❌ gitignored |
| `projects/<id>/audio/narration/*.wav` | `voiceover` | ❌ |
| `projects/<id>/output/*.mp4` | `render` | ✅ Git LFS after QC / finalization |
| `projects/<id>/output/*.srt/.vtt` | `captions` | ✅ |
| `projects/<id>/output/*-credits.txt` | `credits` | ✅ |
| `projects/<id>/output/*-upload.md` | `upload:md` | ✅ |
| `projects/<id>/output/*-youtube.json` | `upload` | ✅ |
| `projects/<id>/previews/*.mp4` | `render:preview` | ✅ Git LFS before requesting final-render approval |

---

## Daily checklist

1. **Channel numbers first** — check `/shorts` retention, stayed-%, drop-off points
2. **Pick the next topic** — top entry in `projects/video-ideas.txt` under the active category
3. **Draft script** following the playbook template: hook question → straight answer → open loop → cause/effect story → twist → ironic punchline → unfinished clause for the loop
4. **Storyboard + assets** → `validate` → `render:preview` → iterate
5. **Approved preview** → `render` → `qc` → `credits` → `upload:md`
6. **Show you the final MP4** — you approve, then upload (or prep for manual upload)
7. Commit + push key project documents/manifests and the review preview MP4 (Git LFS); after approval and QC, push the final MP4 too. Never commit secrets, `node_modules/` or `tools/`.
