#!/usr/bin/env bash
# One-pass Ubuntu 22.04 VPS bootstrap for Checkpoint Geo.
# Run as root. Safe to re-run; does not clone private code or create secrets.
set -Eeuo pipefail

APP_USER="${APP_USER:-checkpoint}"
APP_DIR="${APP_DIR:-/srv/video-project}"
NODE_MAJOR=24
SWAP_GB=4
FFMPEG_REPO="BtbN/FFmpeg-Builds"
STATE_DIR="/var/lib/checkpoint-video"

say(){ printf '\n== %s\n' "$*"; }
fail(){ echo "ERROR: $*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || fail "Run as root."
. /etc/os-release
[ "${ID:-}" = ubuntu ] && [ "${VERSION_ID:-}" = "22.04" ] || fail "Requires Ubuntu 22.04; found ${PRETTY_NAME:-unknown}."
[ "$(uname -m)" = x86_64 ] || fail "This FFmpeg asset is for x86_64."
export DEBIAN_FRONTEND=noninteractive

say "Create unprivileged app account"
if ! id "$APP_USER" >/dev/null 2>&1; then useradd --create-home --shell /bin/bash "$APP_USER"; fi
APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"
[ -n "$APP_HOME" ] || fail "Cannot determine app user's home."
install -d -m 0750 -o "$APP_USER" -g "$APP_USER" "$APP_DIR"
install -d -m 0755 "$STATE_DIR"

say "Install OS and Remotion runtime dependencies"
apt-get update
apt-get install -y --no-install-recommends \
  ca-certificates curl git git-lfs openssh-client unzip xz-utils tar jq python3 python3-venv python3-pip \
  build-essential cmake pkg-config fontconfig fonts-noto-core fonts-noto-color-emoji fonts-noto-cjk \
  libnss3 libdbus-1-3 libxrandr2 libxkbcommon0 libxfixes3 libxcomposite1 libxdamage1 \
  libgbm1 libcairo2 libpango-1.0-0 libatk1.0-0 libatk-bridge2.0-0 libasound2 \
  libcups2 libx11-xcb1

say "Install Node.js $NODE_MAJOR"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" != "$NODE_MAJOR" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" -o /tmp/nodesource_setup.sh
  bash /tmp/nodesource_setup.sh
  apt-get install -y nodejs
  rm -f /tmp/nodesource_setup.sh
fi

say "Install pinned FFmpeg 9.0.1 Linux x86_64 GPL static build"
if command -v ffmpeg >/dev/null 2>&1 && ffmpeg -version | head -1 | grep -q '9\.0\.1' &&
   ffmpeg -hide_banner -filters 2>/dev/null | grep -qw loudnorm &&
   ffmpeg -hide_banner -filters 2>/dev/null | grep -qw ebur128 &&
   ffmpeg -hide_banner -filters 2>/dev/null | grep -qw sidechaincompress &&
   ffmpeg -hide_banner -filters 2>/dev/null | grep -qw blackdetect; then
  echo "Compatible FFmpeg 9.0.1 already installed; keeping it."
else
  ASSET_JSON="$(curl -fsSL -H 'Accept: application/vnd.github+json' "https://api.github.com/repos/${FFMPEG_REPO}/releases?per_page=100")"
  ASSET_URL="$(printf '%s' "$ASSET_JSON" | jq -r '[.[] | .assets[] | select(.name | test("^ffmpeg-n9\\.0\\.1-.*-linux64-gpl-9\\.0\\.tar\\.xz$"))] | first | .browser_download_url // empty')"
  ASSET_NAME="$(printf '%s' "$ASSET_JSON" | jq -r '[.[] | .assets[] | select(.name | test("^ffmpeg-n9\\.0\\.1-.*-linux64-gpl-9\\.0\\.tar\\.xz$"))] | first | .name // empty')"
  ASSET_DIGEST="$(printf '%s' "$ASSET_JSON" | jq -r '[.[] | .assets[] | select(.name | test("^ffmpeg-n9\\.0\\.1-.*-linux64-gpl-9\\.0\\.tar\\.xz$"))] | first | .digest // empty')"
  [ -n "$ASSET_URL" ] && [ -n "$ASSET_NAME" ] || fail "Could not find a BtbN FFmpeg 9.0.1 Linux x86_64 static release asset."
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  curl -fL --retry 3 "$ASSET_URL" -o "$TMP/ffmpeg.tar.xz"
  ARCHIVE_SHA="$(sha256sum "$TMP/ffmpeg.tar.xz" | awk '{print $1}')"
  if [[ "$ASSET_DIGEST" == sha256:* ]]; then
    [ "$ARCHIVE_SHA" = "${ASSET_DIGEST#sha256:}" ] || fail "FFmpeg archive SHA-256 does not match GitHub's published digest."
    DIGEST_STATUS="verified-against-github"
  else
    DIGEST_STATUS="observed-no-published-digest"
    echo "WARNING: GitHub did not provide an asset digest; recording downloaded SHA-256 only."
  fi
  tar -xJf "$TMP/ffmpeg.tar.xz" -C "$TMP"
  FFMPEG_BIN="$(find "$TMP" -type f -path '*/bin/ffmpeg' -print -quit)"
  FFPROBE_BIN="$(find "$TMP" -type f -path '*/bin/ffprobe' -print -quit)"
  [ -n "$FFMPEG_BIN" ] && [ -n "$FFPROBE_BIN" ] || fail "FFmpeg archive did not contain ffmpeg and ffprobe binaries."
  install -m 0755 "$FFMPEG_BIN" /usr/local/bin/ffmpeg
  install -m 0755 "$FFPROBE_BIN" /usr/local/bin/ffprobe
  printf 'asset=%s\\nurl=%s\\nsha256=%s\\ndigest_status=%s\\n' "$ASSET_NAME" "$ASSET_URL" "$ARCHIVE_SHA" "$DIGEST_STATUS" > "$STATE_DIR/ffmpeg-build.txt"
  chmod 0644 "$STATE_DIR/ffmpeg-build.txt"
  rm -rf "$TMP"
  trap - EXIT
fi
for f in loudnorm ebur128 sidechaincompress blackdetect; do
  ffmpeg -hide_banner -filters 2>/dev/null | awk -v f="$f" '$2==f{found=1} END{exit !found}' || fail "Required FFmpeg filter missing: $f"
done

say "Configure 4 GiB swap safety net"
if [ -n "$(swapon --show --noheadings)" ]; then
  echo "Existing swap detected; leaving it unchanged."
elif [ -f /swapfile ]; then
  echo "/swapfile exists but is not active; leaving it untouched."
else
  AVAIL_KB="$(df --output=avail -k / | tail -1 | tr -d ' ')"
  [ "$AVAIL_KB" -gt $((SWAP_GB * 1024 * 1024 + 524288)) ] || fail "Not enough free disk for swap."
  fallocate -l "${SWAP_GB}G" /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=$((SWAP_GB * 1024)) status=progress
  chmod 600 /swapfile; mkswap /swapfile >/dev/null; swapon /swapfile
  grep -qE '^/swapfile[[:space:]]' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  printf 'vm.swappiness=10\n' > /etc/sysctl.d/99-video-render.conf
  sysctl -q -p /etc/sysctl.d/99-video-render.conf
fi

say "Prepare GitHub deploy-key authentication"
SSH_DIR="$APP_HOME/.ssh"
install -d -m 0700 -o "$APP_USER" -g "$APP_USER" "$SSH_DIR"
if [ ! -f "$SSH_DIR/id_ed25519" ]; then
  runuser -u "$APP_USER" -- env HOME="$APP_HOME" ssh-keygen -t ed25519 -N "" -C "checkpoint-vps-video-project" -f "$SSH_DIR/id_ed25519"
fi
chown -R "$APP_USER:$APP_USER" "$SSH_DIR"
chmod 0600 "$SSH_DIR/id_ed25519"
chmod 0644 "$SSH_DIR/id_ed25519.pub"
touch "$SSH_DIR/known_hosts"
ssh-keyscan -H github.com >> "$SSH_DIR/known_hosts" 2>/dev/null || true
chown "$APP_USER:$APP_USER" "$SSH_DIR/known_hosts"
chmod 0644 "$SSH_DIR/known_hosts"
cat > "$SSH_DIR/config" <<'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
EOF
chown "$APP_USER:$APP_USER" "$SSH_DIR/config"
chmod 0600 "$SSH_DIR/config"
runuser -u "$APP_USER" -- env HOME="$APP_HOME" git lfs install

say "Configure app-user environment"
RC="$APP_HOME/.bashrc"
touch "$RC"
if ! grep -q '>>> checkpoint-video >>>' "$RC"; then
  {
    printf '%s\\n' '# >>> checkpoint-video >>>' 'export PATH="$HOME/.venvs/video/bin:$HOME/.local/bin:$PATH"' 'export RENDER_CONCURRENCY=3' '# <<< checkpoint-video <<<'
    cat "$RC"
  } > "$RC.tmp"
  mv "$RC.tmp" "$RC"
  chown "$APP_USER:$APP_USER" "$RC"
fi

say "Configure firewall without risking SSH lockout"
apt-get install -y ufw
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
if ufw status | grep -q 'Status: inactive'; then ufw --force enable; fi
ufw status verbose

say "Record machine and toolchain manifest"
{
  echo "date_utc=$(date -u +%FT%TZ)"
  echo "os=$PRETTY_NAME"
  echo "arch=$(uname -m)"
  echo "cpu_count=$(nproc)"
  echo "node=$(node --version)"
  echo "npm=$(npm --version)"
  echo "python=$(python3 --version 2>&1)"
  echo "git=$(git --version)"
  echo "ffmpeg=$(ffmpeg -version | head -1)"
  echo "app_user=$APP_USER"
  echo "app_dir=$APP_DIR"
  echo "render_concurrency=3"
  cat "$STATE_DIR/ffmpeg-build.txt"
} > "$STATE_DIR/server-manifest.txt"
chmod 0644 "$STATE_DIR/server-manifest.txt"

say "Bootstrap complete"
echo "App account: $APP_USER (no sudo)"
echo "App directory: $APP_DIR"
echo "Node: $(node --version)"
echo "FFmpeg: $(ffmpeg -version | head -1)"
echo "Required filters: loudnorm ebur128 sidechaincompress blackdetect (all verified)"
echo "Swap: $(free -h | awk '/^Swap:/{print $2}')"
echo "Firewall: SSH/80/443 allowed; UFW enabled."
echo "Manifest: $STATE_DIR/server-manifest.txt"
echo "NEXT: add this SSH public key to the private GitHub repository as a WRITE-ENABLED deploy key:"\necho "----------------------------------------------------------------"\ncat "$SSH_DIR/id_ed25519.pub"\necho "----------------------------------------------------------------"\necho "Then run scripts/server/deploy-checkout.sh as root to clone the selected branch."
echo "No project code, dashboard, secrets, or public web service has been installed."
