#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."

echo "=== Building frontend ==="
cd "$ROOT/frontend"
npm run build

echo "=== Building backend bundle ==="
cd "$ROOT/backend"
# Bundle backend to single file using esbuild (handles JSX better than ncc)
npx esbuild index.js --bundle --platform=node --target=node20 --outfile=dist/ncc/index.js --minify --format=cjs --external:prisma --external:@prisma/client --loader:.svg=dataurl

echo "=== Compiling backend binary ==="
# Compile to native binary using pkg
# Output: backend (macOS/Linux) and backend.exe (Windows) in desktop/src-tauri/binaries/
npx pkg dist/ncc/index.js \
  --targets node20-macos-x64,node20-win-x64 \
  --output "$ROOT/desktop/src-tauri/binaries/backend" \
  --compress Brotli

echo "=== Generating pre-migrated template.db ==="
# Generate a fresh SQLite database with all migrations applied
# This runs at build time (CI/dev env where Node.js is available)
cd "$ROOT/backend"
DATABASE_URL="file:$ROOT/desktop/src-tauri/resources/template.db" \
  npx prisma migrate deploy --schema prisma/sqlite/schema.prisma

echo "=== Desktop build ready. Run: cd desktop && npm run tauri build ==="
