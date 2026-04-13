#!/usr/bin/env bash
# Build script for Cloudflare Pages deployment.
#
# Cloudflare Pages settings:
#   Build command:          bash build-pages.sh
#   Build output directory: apps/admin-ui/dist
#   Root directory:         /  (repo root)
#
# The admin-ui prebuild script also builds the banner automatically,
# so `cd apps/admin-ui && npm ci && npm run build` also works.
set -euo pipefail

echo "=== Installing and building admin UI (includes banner prebuild) ==="
cd apps/admin-ui
npm ci
npm run build

echo "=== Build complete ==="
ls -lh dist/consent-loader.js dist/consent-bundle.js 2>/dev/null || echo "WARNING: Banner scripts not found in dist/"
