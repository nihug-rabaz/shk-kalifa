#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="$HOME/Library/Application Support/SignageKiosk"
CONFIG_FILE="$CONFIG_DIR/config.json"

mkdir -p "$CONFIG_DIR"

cat > "$CONFIG_FILE" <<EOF
{
  "url": "http://localhost:3000/display",
  "projectPath": "$ROOT",
  "port": 3000
}
EOF

echo "→ Config: $CONFIG_FILE"
echo "→ Project: $ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "✖ Node.js לא מותקן. התקן מ-https://nodejs.org"
  exit 1
fi

if [ ! -f "$ROOT/.env.local" ]; then
  echo "✖ חסר $ROOT/.env.local עם DATABASE_URL ו-AUTH_SECRET"
  exit 1
fi

cd "$ROOT"
echo "→ npm install…"
npm install
echo "→ npm run build…"
npm run build

echo ""
echo "✔ מוכן. פתח את SignageKiosk.app"
echo "  האפליקציה תפעיל npm start אוטומטית ותתחבר ל-Neon DB."
