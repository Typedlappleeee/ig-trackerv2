#!/usr/bin/env bash
# ScaleFlow · installation du serveur iRemoTech (PC éteint) sur un serveur Linux Ubuntu / Debian.
# Usage (en root, dans la console du serveur) :
#   curl -fsSL https://scaleflow.company/irt-worker/install.sh | bash
# Le script demande l'adresse Supabase et la clé service_role (Supabase › Project Settings › API), installe Node,
# le navigateur sans écran et le service « sf-irt-worker » (redémarrage automatique + mise à jour à chaque démarrage).
set -euo pipefail
ORIGIN="${SF_ORIGIN:-https://scaleflow.company}"
DIR=/opt/sf-irt-worker
ENVF=/etc/sf-irt-worker.env

if [ "$(id -u)" != "0" ]; then echo "Lance ce script en root (sudo -i)."; exit 1; fi

if [ ! -f "$ENVF" ]; then
  echo "== Configuration (une seule fois) =="
  read -rp "Adresse Supabase (https://xxxx.supabase.co) : " SUPA_URL < /dev/tty
  read -rsp "Clé service_role Supabase (cachée) : " SUPA_KEY < /dev/tty; echo
  read -rp "Sessions en même temps [4] : " MAXR < /dev/tty
  umask 077
  printf 'SUPABASE_URL=%s\nSUPABASE_SERVICE_ROLE_KEY=%s\nSF_ORIGIN=%s\nMAX_RUNS=%s\n' "$SUPA_URL" "$SUPA_KEY" "$ORIGIN" "${MAXR:-4}" > "$ENVF"
  chmod 600 "$ENVF"
fi

echo "== Node.js =="
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  apt-get update -y && apt-get install -y curl ca-certificates
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo "== Programme ScaleFlow =="
mkdir -p "$DIR" && cd "$DIR"
[ -f package.json ] || printf '{ "name": "sf-irt-worker", "private": true, "type": "module" }\n' > package.json
npm install --no-audit --no-fund playwright@1 @supabase/supabase-js@2
npx playwright install --with-deps chromium
curl -fsSL "$ORIGIN/irt-worker/worker.mjs" -o worker.mjs

echo "== Service (démarrage auto, mise à jour à chaque démarrage) =="
cat > /etc/systemd/system/sf-irt-worker.service <<UNIT
[Unit]
Description=ScaleFlow - serveur iRemoTech
After=network-online.target
Wants=network-online.target

[Service]
EnvironmentFile=$ENVF
WorkingDirectory=$DIR
ExecStartPre=-/usr/bin/curl -fsSL $ORIGIN/irt-worker/worker.mjs -o $DIR/worker.mjs
ExecStart=/usr/bin/node $DIR/worker.mjs
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now sf-irt-worker
# mise à jour : le programme vérifie lui-même chaque heure s'il y a une nouvelle version et redémarre quand il est libre
sleep 3
systemctl --no-pager status sf-irt-worker | head -n 12
echo
echo "✅ Serveur iRemoTech installé. Dans ScaleFlow (iRemoTech › Posting) : « Serveur : en ligne »."
echo "   Journal : journalctl -u sf-irt-worker -f"
