#!/usr/bin/env bash
# Install Checkpoint Geo Studio as a private, authenticated service behind Caddy HTTPS.
set -Eeuo pipefail
APP_USER="${APP_USER:-checkpoint}"
APP_DIR="${APP_DIR:-/srv/video-project}"
DOMAIN="${DASHBOARD_DOMAIN:-studio.checkpointgeo.nx.kg}"
ENV_FILE="/etc/checkpoint-video/dashboard.env"
fail(){ echo "ERROR: $*" >&2; exit 1; }
say(){ printf '\n== %s\n' "$*"; }
[ "$(id -u)" -eq 0 ] || fail "Run as root."
id "$APP_USER" >/dev/null 2>&1 || fail "Missing application account: $APP_USER"
[ -f "$APP_DIR/scripts/dashboard/server.ts" ] || fail "Dashboard source missing from $APP_DIR"

say "Create dashboard credentials (first install only)"
install -d -m 0750 -o root -g "$APP_USER" /etc/checkpoint-video
if [ ! -f "$ENV_FILE" ]; then
  node "$APP_DIR/scripts/dashboard/generate-credentials.mjs" "$ENV_FILE"
  chown root:"$APP_USER" "$ENV_FILE"
  chmod 0640 "$ENV_FILE"
  chown root:root "$ENV_FILE.initial.txt"
  chmod 0600 "$ENV_FILE.initial.txt"
else
  echo "Existing dashboard credentials preserved."
fi

say "Install Caddy HTTPS reverse proxy"
apt-get install -y --no-install-recommends ca-certificates curl gnupg debian-keyring debian-archive-keyring apt-transport-https
if [ ! -f /usr/share/keyrings/caddy-stable-archive-keyring.gpg ]; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
fi
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' -o /etc/apt/sources.list.d/caddy-stable.list
apt-get update
apt-get install -y caddy

say "Configure dashboard service"
cat > /etc/systemd/system/checkpoint-dashboard.service <<EOF
[Unit]
Description=Checkpoint Geo Studio dashboard and render queue
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=DASHBOARD_HOST=127.0.0.1
Environment=DASHBOARD_PORT=3100
Environment=RENDER_CONCURRENCY=3
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/npm run dashboard
Restart=always
RestartSec=5
KillSignal=SIGTERM
TimeoutStopSec=30
UMask=0027
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=$APP_DIR/projects $APP_DIR/src/generated $APP_DIR/tools /var/lib/checkpoint-video

[Install]
WantedBy=multi-user.target
EOF

say "Configure HTTPS domain"
cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
  encode zstd gzip
  reverse_proxy 127.0.0.1:3100
}
EOF
caddy validate --config /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl enable --now checkpoint-dashboard
systemctl enable --now caddy
systemctl restart checkpoint-dashboard
systemctl reload caddy

echo
echo "CHECKPOINT GEO STUDIO INSTALLED."
echo "URL: https://$DOMAIN"
echo "Dashboard service: checkpoint-dashboard"
echo "Reverse proxy: Caddy (automatic HTTPS certificate)"
echo "Credentials file: $ENV_FILE (hashes only)"
