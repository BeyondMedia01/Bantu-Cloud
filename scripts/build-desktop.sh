#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."

echo "=== Building backend bundle ==="
cd "$ROOT/backend"
# Bundle backend to single file using esbuild (handles JSX better than ncc)
npx esbuild index.js --bundle --platform=node --target=node22 --outfile=dist/ncc/index.js --minify --format=cjs --external:prisma --external:@prisma/client --loader:.svg=dataurl

echo "=== Compiling backend binary for current platform ==="
# Detect platform and set Tauri sidecar naming convention
if [[ "$OSTYPE" == "darwin"* ]]; then
  ARCH=$(uname -m)
  if [[ "$ARCH" == "arm64" ]]; then
    PKG_TARGET="node20-macos-arm64"
    BINARY_SUFFIX="aarch64-apple-darwin"
  else
    PKG_TARGET="node20-macos-x64"
    BINARY_SUFFIX="x86_64-apple-darwin"
  fi
else
  # Windows (Git Bash / MSYS2 on CI)
  PKG_TARGET="node20-win-x64"
  BINARY_SUFFIX="x86_64-pc-windows-msvc"
fi

echo "Platform: $PKG_TARGET → binary suffix: $BINARY_SUFFIX"
npx @yao-pkg/pkg dist/ncc/index.js \
  --targets "$PKG_TARGET" \
  --output "$ROOT/desktop/src-tauri/binaries/backend-$BINARY_SUFFIX" \
  --compress Brotli

echo "=== Generating pre-migrated template.db ==="
# Generate a fresh SQLite database with all migrations applied
# This runs at build time (CI/dev env where Node.js is available)
cd "$ROOT/backend"
DATABASE_URL="file:$ROOT/desktop/src-tauri/resources/template.db" \
  npx prisma migrate deploy --schema prisma/sqlite/schema.prisma

echo "=== Desktop build ready. Run: cd desktop && npm run tauri build ==="
