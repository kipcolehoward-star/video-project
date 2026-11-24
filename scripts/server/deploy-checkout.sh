#!/usr/bin/env bash
# Clone/update the private production repository and install its locked runtime.
# Run as root after bootstrap and after adding the printed SSH key to GitHub
# as a write-enabled deploy key.
set -Eeuo pipefail

APP_USER="${APP_USER:-checkpoint}"
APP_DIR="${APP_DIR:-/srv/video-project}"
BRANCH="${1:-main}"
REPO_SSH="git@github.com:Kipcolehoward-star/video-project.git"
VENV="${HOME:-/root}/.unused"
say(){ printf '\n== %s\n' "$*"; }
fail(){ echo "ERROR: $*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || fail "Run as root."
id "$APP_USER" >/dev/null 2>&1 || fail "App user $APP_USER does not exist."
APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"
[ -n "$APP_HOME" ] || fail "Cannot determine $APP_USER home."
[ -f "$APP_HOME/.ssh/id_ed25519" ] || fail "Deploy key missing. Run bootstrap first."
[[ "$BRANCH" =~ ^[A-Za-z0-9._/-]+$ ]] || fail "Invalid branch name."
[[ "$BRANCH" != *".."* ]] || fail "Invalid branch name."

as_app(){ runuser -u "$APP_USER" -- env HOME="$APP_HOME" PATH="/usr/local/bin:/usr/bin:/bin" "$@"; }

say "Verify GitHub deploy-key access"
if ! as_app ssh -T -o BatchMode=yes git@github.com 2>&1 | grep -q "successfully authenticated"; then
  echo "GitHub did not confirm this deploy key. Confirm it was added to the private repository"
  echo "Settings > Deploy keys, with Allow write access enabled."
  exit 1
fi

say "Clone or safely update repository"
if [ -d "$APP_DIR/.git" ]; then
  if [ -n "$(as_app git -C "$APP_DIR" status --porcelain)" ]; then
    fail "Working tree is not clean. Preserve/commit changes before updating."
  fi
  as_app git -C "$APP_DIR" fetch origin --prune
  if as_app git -C "$APP_DIR" show-ref --verify --quiet "refs/heads/$BRANCH"; then
    as_app git -C "$APP_DIR" switch "$BRANCH"
  else
    as_app git -C "$APP_DIR" switch --track -c "$BRANCH" "origin/$BRANCH"
  fi
  as_app git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
elif [ -z "$(find "$APP_DIR" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]; then
  as_app git clone --branch "$BRANCH" --single-branch "$REPO_SSH" "$APP_DIR"
else
  fail "$APP_DIR is not empty and is not a Git checkout. Nothing was overwritten."
fi

say "Fetch Git LFS objects"
as_app git -C "$APP_DIR" lfs pull

say "Install locked Node dependencies"
as_app npm --prefix "$APP_DIR" ci --no-audit --no-fund

say "Prepare Python voice environment"
as_app python3 -m venv "$APP_HOME/.venvs/video"
as_app "$APP_HOME/.venvs/video/bin/pip" install --disable-pip-version-check "edge-tts==7.2.8"

say "Install Remotion Chrome Headless Shell"
as_app bash -c "cd '$APP_DIR' && npx --no-install remotion browser ensure"

say "Run repository checks"
as_app bash -c "cd '$APP_DIR' && npm run typecheck"
for f in loudnorm ebur128 sidechaincompress blackdetect; do
  ffmpeg -hide_banner -filters 2>/dev/null | awk -v f="$f" '$2==f{found=1} END{exit !found}' || fail "FFmpeg filter missing: $f"
done

say "Record deployed revision"
install -d -m 0755 /var/lib/checkpoint-video
{
  echo "deployed_utc=$(date -u +%FT%TZ)"
  echo "branch=$BRANCH"
  echo "commit=$(as_app git -C "$APP_DIR" rev-parse HEAD)"
  echo "node=$(node --version)"
  echo "npm=$(npm --version)"
  echo "ffmpeg=$(ffmpeg -version | head -1)"
  echo "app_dir=$APP_DIR"
} > /var/lib/checkpoint-video/deployment-manifest.txt
chmod 0644 /var/lib/checkpoint-video/deployment-manifest.txt

echo
echo "REPOSITORY DEPLOYMENT COMPLETE."
echo "Checkout: $APP_DIR"
echo "Branch: $BRANCH"
echo "Commit: $(as_app git -C "$APP_DIR" rev-parse --short HEAD)"
echo "No dashboard service has been started; the repository currently contains the render engine, not a dashboard app."
