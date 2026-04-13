#!/usr/bin/env bash
# Ensure banner scripts exist in public/ before the admin-ui Vite build.
# If the banner hasn't been built yet, build it first.
set -euo pipefail

BANNER_DIR="../banner"
BANNER_DIST="$BANNER_DIR/dist"

if [ ! -f "$BANNER_DIST/consent-loader.js" ]; then
  echo "[prebuild] Banner not built yet — building now..."
  (cd "$BANNER_DIR" && npm ci && npm run build)
fi

echo "[prebuild] Copying banner scripts to public/"
mkdir -p public
cp "$BANNER_DIST/consent-loader.js" public/
cp "$BANNER_DIST/consent-bundle.js" public/
[ -f "$BANNER_DIST/consent-bundle.js.map" ] && cp "$BANNER_DIST/consent-bundle.js.map" public/
echo "[prebuild] Done — $(ls public/consent-loader.js)"
