#!/usr/bin/env bash
# Render-server setup for Ubuntu 24.04 or newer (sized for 4 vCPU / 8 GB, no GPU).
#
#   sudo bash setup-ubuntu.sh    system packages, Node, swap, edge-tts, then the app steps
#   bash setup-ubuntu.sh --app   app steps only, no sudo (npm ci, Chrome Headless Shell, checks)
#   sudo bash setup-ubuntu.sh --kokoro   Kokoro voice venv (~/.venvs/kokoro, Python 3.12 via uv, CPU torch)
#
# Idempotent: safe to re-run; finished steps are skipped. The code itself is
# uploaded from Windows with scripts/server/push-to-server.ps1 (the GitHub repo
# is private, so the server needs no GitHub credentials). Never touches .env.
set -euo pipefail

NODE_MAJOR=24            # matches the Windows machine (Node 24.12)
EDGE_TTS_VERSION=7.2.8   # matches the Windows machine
SWAP_GB=4                # no swap = Linux kills a render that runs out of memory
RENDER_CONCURRENCY=3     # parallel Chrome tabs per render; 4 vCPU leaves one for FFmpeg
KOKORO_VERSION=0.9.4     # Kokoro voice (--kokoro); tested 2026-10-24

TARGET_USER="${SUDO_USER:-$(id -un)}"
TARGET_HOME="$(getent passwd "$TARGET_USER" | cut -d: -f6)"
APP_DIR="${APP_DIR:-$TARGET_HOME/video-project}"
VENV="$TARGET_HOME/.venvs/video"

say() { printf '\n== %s\n' "$*"; }
as_user() { if [ "$(id -un)" = "$TARGET_USER" ]; then "$@"; else sudo -u "$TARGET_USER" -H "$@"; fi; }
# First package name apt knows (Ubuntu 24.04+ renamed several libs with a t64 suffix).
pick() { for c in "$@"; do if apt-cache show "$c" >/dev/null 2>&1; then echo "$c"; return; fi; done; echo "missing package: $*" >&2; return 1; }

system_setup() {
  [ "$(id -u)" -eq 0 ] || { echo "Run with sudo (or use --app for the no-sudo app steps)." >&2; exit 1; }
  . /etc/os-release
  [ "${ID:-}" = ubuntu ] || echo "Warning: written for Ubuntu, this is ${PRETTY_NAME:-unknown}."
  export DEBIAN_FRONTEND=noninteractive

  say "System packages"
  apt-get update -q
  # Shared libraries for Remotion's Chrome Headless Shell, plus fonts for any fallback glyphs.
  local chrome_libs=(
    libnss3 libdbus-1-3 libxrandr2 libxkbcommon0 libxfixes3 libxcomposite1 libxdamage1
    libgbm1 libcairo2 libpango-1.0-0
    "$(pick libatk1.0-0t64 libatk1.0-0)" "$(pick libatk-bridge2.0-0t64 libatk-bridge2.0-0)"
    "$(pick libasound2t64 libasound2)" "$(pick libcups2t64 libcups2)"
  )
  apt-get install -y -q ca-certificates curl git unzip xz-utils ffmpeg python3 python3-venv \
    fontconfig fonts-noto-core fonts-noto-color-emoji fonts-noto-cjk "${chrome_libs[@]}"

  say "Node.js $NODE_MAJOR"
  if command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" = "$NODE_MAJOR" ]; then
    echo "already installed: $(node -v)"
  else
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" -o /tmp/nodesource_setup.sh
    bash /tmp/nodesource_setup.sh
    apt-get install -y -q nodejs
    rm -f /tmp/nodesource_setup.sh
  fi

  say "Swap (${SWAP_GB} GB)"
  if [ -n "$(swapon --show --noheadings)" ]; then
    echo "already on: $(swapon --show --noheadings | awk '{print $1, $3}')"
  else
    [ -f /swapfile ] || { fallocate -l "${SWAP_GB}G" /swapfile; chmod 600 /swapfile; mkswap /swapfile >/dev/null; }
    swapon /swapfile
    grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    # Use swap only as a safety net; renders crawl if Chrome actually lives in it.
    echo 'vm.swappiness=10' > /etc/sysctl.d/99-video-render.conf
    sysctl -q -p /etc/sysctl.d/99-video-render.conf
    echo "enabled"
  fi

  say "edge-tts $EDGE_TTS_VERSION (Python venv, so the system Python stays untouched)"
  [ -x "$VENV/bin/python" ] || as_user python3 -m venv "$VENV"
  as_user "$VENV/bin/pip" install -q --disable-pip-version-check "edge-tts==$EDGE_TTS_VERSION"

  say "Shell environment for $TARGET_USER"
  # The scripts call `python`, which must be the venv's. The block goes at the TOP of
  # .bashrc: Ubuntu's .bashrc stops early for non-interactive shells (e.g. `ssh host cmd`).
  local rc="$TARGET_HOME/.bashrc"
  if grep -q '>>> video-project >>>' "$rc" 2>/dev/null; then
    echo "already set in $rc"
  else
    {
      echo '# >>> video-project >>>'
      echo 'export PATH="$HOME/.venvs/video/bin:$PATH"'
      echo "export RENDER_CONCURRENCY=$RENDER_CONCURRENCY"
      echo '# <<< video-project <<<'
      [ -f "$rc" ] && cat "$rc"
    } > "$rc.tmp"
    mv "$rc.tmp" "$rc"
    chown "$TARGET_USER:" "$rc"
    echo "added to $rc"
  fi
}

app_setup() {
  export PATH="$VENV/bin:$PATH" RENDER_CONCURRENCY="${RENDER_CONCURRENCY}"
  if [ ! -f "$APP_DIR/package.json" ]; then
    say "Code not uploaded yet"
    echo "On Windows, run: .\\scripts\\server\\push-to-server.ps1 -Server $TARGET_USER@<server-ip> -Project <id>"
    echo "It uploads the code and finishes this setup."
    return
  fi
  cd "$APP_DIR"

  say "npm dependencies"
  local lock_sha; lock_sha="$(sha1sum package-lock.json | cut -d' ' -f1)"
  if [ -f node_modules/.lock-sha ] && [ "$(cat node_modules/.lock-sha)" = "$lock_sha" ]; then
    echo "up to date"
  else
    as_user npm ci --no-audit --no-fund
    as_user sh -c "echo $lock_sha > node_modules/.lock-sha"
  fi

  say "Chrome Headless Shell (Remotion's renderer browser)"
  as_user npx --no-install remotion browser ensure

  say "Checks"
  local ok=1
  echo "node     $(node -v)"
  echo "ffmpeg   $(ffmpeg -hide_banner -version | head -1 | cut -d' ' -f3)"
  local filters; filters="$(ffmpeg -hide_banner -filters 2>/dev/null)"
  for f in loudnorm ebur128 sidechaincompress blackdetect; do
    grep -qw "$f" <<<"$filters" || { echo "ffmpeg is missing the $f filter"; ok=0; }
  done
  if python -c 'import edge_tts' 2>/dev/null; then echo "edge-tts $(python -c 'import importlib.metadata as m; print(m.version("edge-tts"))')"; else echo "edge-tts not importable from python"; ok=0; fi
  echo "memory   $(free -h | awk '/^Mem:/{print $2" total, "$7" available"}'), swap $(free -h | awk '/^Swap:/{print $2}')"
  echo "render   concurrency $RENDER_CONCURRENCY"
  [ -f .env ] && echo ".env     present" || echo ".env     not copied (only needed for ElevenLabs/Pexels; push with -WithEnv)"
  if [ "$ok" = 1 ]; then
    say "Ready. Test render: cd ~/video-project && npm run render -- --project <id>"
  else
    say "Setup finished with problems (see above)"; exit 1
  fi
}

# Kokoro voice (scripts/server/kokoro_voice.py): its own venv with Python 3.12, because kokoro 0.9.4 needs < 3.13.
# uv (in its own small venv) fetches that Python; torch is the CPU build (~200 MB instead of the CUDA build's 2 GB+).
kokoro_setup() {
  [ "$(id -u)" -eq 0 ] || { echo "Run with sudo: espeak-ng is a system package." >&2; exit 1; }
  say "Kokoro voice ($KOKORO_VERSION, Python 3.12, CPU)"
  apt-get install -y -q espeak-ng >/dev/null
  local uv="$TARGET_HOME/.venvs/uv-tool/bin/uv" kv="$TARGET_HOME/.venvs/kokoro"
  [ -x "$uv" ] || { as_user python3 -m venv "$TARGET_HOME/.venvs/uv-tool"; as_user "$TARGET_HOME/.venvs/uv-tool/bin/pip" install -q uv; }
  as_user "$uv" python install 3.12
  [ -x "$kv/bin/python" ] || as_user "$uv" venv --python 3.12 "$kv"
  as_user env VIRTUAL_ENV="$kv" "$uv" pip install -q --index-url https://download.pytorch.org/whl/cpu torch
  # pip itself: misaki downloads its spaCy English model with pip.
  as_user env VIRTUAL_ENV="$kv" "$uv" pip install -q "kokoro==$KOKORO_VERSION" soundfile pip
  as_user "$kv/bin/python" -m spacy download en_core_web_sm >/dev/null
  as_user "$kv/bin/python" -c 'import torch, kokoro; print("kokoro ok, torch", torch.__version__)'
}

case "${1:-}" in
  --app) app_setup ;;
  --kokoro) kokoro_setup ;;
  "") system_setup; app_setup ;;
  *) echo "Usage: sudo bash $0   |   bash $0 --app   |   sudo bash $0 --kokoro" >&2; exit 2 ;;
esac
