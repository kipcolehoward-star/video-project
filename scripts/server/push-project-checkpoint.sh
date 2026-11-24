#!/usr/bin/env bash
# Selectively checkpoint a project from the VPS to the current GitHub branch.
# Usage: sudo -u checkpoint bash scripts/server/push-project-checkpoint.sh <project-id> <Source|Preview|Final> [--owner-approved]
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/srv/video-project}"
PROJECT="${1:-}"
STAGE="${2:-}"
OWNER_APPROVED="${3:-}"
fail(){ echo "ERROR: $*" >&2; exit 1; }

[[ "$PROJECT" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || fail "Usage: $0 <project-id> <Source|Preview|Final> [--owner-approved]"
case "$STAGE" in Source|Preview|Final) ;; *) fail "Stage must be Source, Preview or Final." ;; esac
if [ "$STAGE" = Final ] && [ "$OWNER_APPROVED" != "--owner-approved" ]; then
  fail "Final checkpoint requires the explicit --owner-approved flag after owner approval and successful QC."
fi
cd "$APP_DIR"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "Not a Git checkout: $APP_DIR"
BRANCH="$(git branch --show-current)"
[ -n "$BRANCH" ] || fail "Detached HEAD; switch to the intended working branch first."
[ "$BRANCH" != "main" ] || echo "WARNING: committing directly to main."
git diff --cached --quiet || fail "The Git index already contains staged changes. Commit or unstage them first."
[ -f "projects/$PROJECT/project.json" ] || fail "Unknown project: $PROJECT"

git lfs version >/dev/null 2>&1 || fail "Git LFS is required for preview/final MP4 checkpoints."
git lfs install >/dev/null

FILES=(
  "projects/$PROJECT/project.json"
  "projects/$PROJECT/brief.md"
  "projects/$PROJECT/research.md"
  "projects/$PROJECT/script.md"
  "projects/$PROJECT/storyboard.json"
  "projects/$PROJECT/assets.json"
  "projects/$PROJECT/transcript.json"
  "projects/$PROJECT/youtube.json"
)
for pattern in \
  "projects/$PROJECT/output/*.srt" \
  "projects/$PROJECT/output/*.vtt" \
  "projects/$PROJECT/output/*-credits.txt" \
  "projects/$PROJECT/output/*-upload.md" \
  "projects/$PROJECT/output/*-youtube.json"; do
  while IFS= read -r -d '' file; do FILES+=("$file"); done < <(compgen -G "$pattern" | while IFS= read -r f; do printf '%s\0' "$f"; done || true)
done

if [ "$STAGE" = Preview ] || [ "$STAGE" = Final ]; then
  shopt -s nullglob
  PREVIEWS=(projects/"$PROJECT"/previews/*.mp4)
  shopt -u nullglob
  [ "${#PREVIEWS[@]}" -gt 0 ] || fail "No preview MP4s found. Render previews before checkpointing."
  FILES+=("${PREVIEWS[@]}")
fi
if [ "$STAGE" = Final ]; then
  shopt -s nullglob
  FINALS=(projects/"$PROJECT"/output/*.mp4)
  shopt -u nullglob
  [ "${#FINALS[@]}" -gt 0 ] || fail "No final output MP4s found. Render and QC the final first."
  for file in "${FINALS[@]}"; do
    ffprobe -v error -show_entries format=duration -of csv=p=0 "$file" >/dev/null || fail "ffprobe failed: $file"
  done
  FILES+=("${FINALS[@]}")
fi

ADDED=0
for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then git add -- "$file"; ADDED=$((ADDED + 1)); fi
done
[ "$ADDED" -gt 0 ] || fail "No eligible files found for $STAGE."
git diff --cached --name-only | while IFS= read -r path; do
  [[ "$path" == "projects/$PROJECT/"* ]] || { echo "Unexpected staged path: $path" >&2; exit 1; }
done
echo "Staged files for $PROJECT ($STAGE):"
git diff --cached --stat
git diff --cached --name-only
git diff --cached --quiet && { echo "No changes to commit."; exit 0; }

git config user.name >/dev/null || fail "Set git user.name for the checkpoint account before committing."
git config user.email >/dev/null || fail "Set git user.email for the checkpoint account before committing."
git commit -m "Checkpoint $PROJECT ($STAGE)"
git push -u origin "$BRANCH"
echo "Checkpoint pushed to origin/$BRANCH."
