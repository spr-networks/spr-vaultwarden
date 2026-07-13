#!/bin/bash
# Command-line alternative to installing through the SPR plugin UI.
set -euo pipefail
cd "$(dirname "$0")"

echo "Please enter your SPR path (/home/spr/super/)"
read -r SUPERDIR
if [ -z "$SUPERDIR" ]; then
  SUPERDIR="/home/spr/super/"
fi
SUPERDIR="${SUPERDIR%/}/"
export SUPERDIR

CONFIG_DIR="$SUPERDIR/configs/plugins/vaultwarden"
STATE_DIR="$SUPERDIR/state/plugins/vaultwarden"
mkdir -p "$CONFIG_DIR/configs" "$CONFIG_DIR/data" "$STATE_DIR"

docker compose build
docker compose up -d

echo ""
echo "[+] spr-vaultwarden installed. Configure it under Plugins > Vaultwarden."
echo "    Vaultwarden listens on port 8989 by default. Use a trusted TLS"
echo "    certificate or a localhost SSH tunnel for Bitwarden clients."
