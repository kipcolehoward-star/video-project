#!/usr/bin/env bash
# Safe base preparation for the Checkpoint Geo production VPS.
# Target: Ubuntu 22.04 LTS. Run once as root:
#   bash scripts/server/prepare-ubuntu-22.04.sh
#
# This does NOT clone the repository, configure the firewall, install FFmpeg,
# create secrets, or start a public service. Those are separate verified steps.
set -euo pipefail

APP_USER="${APP_USER:-checkpoint}"
APP_DIR="${APP_DIR:-/srv/video-project}"
NODE_MAJOR=24
SWAP_GB=4

say() { printf '\n== %s\n' "$*"; }
fail() { echo "ERROR: $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "Run as root."
. /etc/os-release
[ "${ID:-}" = ubuntu ] || fail "Expected Ubuntu; found ${PRETTY_NAME:-unknown}."
[ "${VERSION_ID:-}" = "22.04" ] || fail "This script is specifically for Ubuntu 22.04; found ${VERSION_ID:-unknown}."
command -v apt-get >/dev/null || fail "apt-get not found."

export DEBIAN_FRONTEND=noninteractive

say "Create dedicated application account"
if id "$APP_USER" >/dev/null 2>&1; then
  echo "Account already exists: $APP_USER"
else
  useradd --create-home --shell /bin/bash "$APP_USER"
  echo "Created $APP_USER (no sudo privileges granted)."
fi
APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"
[ -n "$APP_HOME" ] || fail "Could not determine home directory for $APP_USER."

say "Install base system packages"
apt-get update
apt-get install -y --no-install-recommends \
  ca-certificates curl git unzip xz-utils tar jq \
  python3 python3-venv python3-pip \
  build-essential pkg-config \
  fontconfig fonts-noto-core fonts-noto-color-emoji fonts-noto-cjk \
  libnss3 libdbus-1-3 libxrandr2 libxkbcommon0 libxfixes3 \
  libxcomposite1 libxdamage1 libgbm1 libcairo2 libpango-1.0-0 \
  libatk1.0-0 libatk-bridge2.0-0 libasound2 libcups2 libx11-xcb1

say "Install Node.js $NODE_MAJOR"
if command -v node >/dev/null 2>&1 && [ "$(node -p 'process.versions.node.split(".")[0]')" = "$NODE_MAJOR" ]; then
  echo "Node.js already installed: $(node -v)"
else
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" -o /tmp/nodesource_setup.sh
  bash /tmp/nodesource_setup.sh
  apt-get install -y nodejs
  rm -f /tmp/nodesource_setup.sh
fi
node --version
npm --version

say "Create application directory"
install -d -m 0750 -o "$APP_USER" -g "$APP_USER" "$APP_DIR"
echo "Application path: $APP_DIR"
echo "Owner: $(stat -c '%U:%G' "$APP_DIR")"

say "Configure $SWAP_GB GiB swap safety net"
if [ -n "$(swapon --show --noheadings)" ]; then
  echo "Swap already active:"
  swapon --show
elif [ -f /swapfile ]; then
  echo "/swapfile exists but is not active; inspect it before changing anything."
else
  AVAIL_KB="$(df --output=avail -k / | tail -1 | tr -d ' ')"
  REQUIRED_KB=$((SWAP_GB * 1024 * 1024 + 524288))
  [ "$AVAIL_KB" -gt "$REQUIRED_KB" ] || fail "Insufficient free disk space for swap."
  if ! fallocate -l "${SWAP_GB}G" /swapfile 2>/dev/null; then
    dd if=/dev/zero of=/swapfile bs=1M count=$((SWAP_GB * 1024)) status=progress
  fi
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -qE '^/swapfile[[:space:]]' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  printf 'vm.swappiness=10\n' > /etc/sysctl.d/99-video-render.conf
  sysctl -q -p /etc/sysctl.d/99-video-render.conf
fi

say "Configure application user's shell"
RC="$APP_HOME/.bashrc"
touch "$RC"
if ! grep -q '>>> checkpoint-video >>>' "$RC"; then
  cat >> "$RC" <<'EOF'

# >>> checkpoint-video >>>
export PATH="$HOME/.local/bin:$PATH"
export RENDER_CONCURRENCY=3
# <<< checkpoint-video <<<
EOF
  chown "$APP_USER:$APP_USER" "$RC"
fi

say "Verify base installation"
echo "OS: $(. /etc/os-release; echo "$PRETTY_NAME")"
echo "App user: $APP_USER"
echo "App directory: $APP_DIR"
echo "Node: $(node -v)"
echo "npm: $(npm -v)"
echo "Python: $(python3 --version)"
echo "Git: $(git --version)"
echo "RAM: $(free -h | awk '/^Mem:/{print $2 " total"}')"
echo "Swap: $(free -h | awk '/^Swap:/{print $2 " total"}')"
echo
echo "BASE PREPARATION COMPLETE."
echo "No repository was cloned and no public service or firewall rule was changed."
echo "Next: configure GitHub deploy-key access, clone the approved branch, then install and test the pinned FFmpeg build."
