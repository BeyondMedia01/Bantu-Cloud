#!/usr/bin/env bash
# Generate the RSA key pair used to sign and verify tb_ client license tokens.
#
# Run this ONCE when setting up the platform for the first time.
# Keep the private key secret — add it to your cloud server env as CLIENT_LICENSE_PRIVATE_KEY.
# The public key ships with the desktop app — paste it into desktop/src-tauri/keys/license_public.pem.

set -euo pipefail

OUT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/desktop/src-tauri/keys"
mkdir -p "$OUT_DIR"

echo "=== Generating 2048-bit RSA key pair for client license tokens ==="

# Private key (PKCS#1 PEM) — keep on cloud server only
openssl genrsa -out "$OUT_DIR/license_private.pem" 2048

# Public key (PKCS#1 PEM) — embedded in desktop binary for offline verification
openssl rsa -in "$OUT_DIR/license_private.pem" -out "$OUT_DIR/license_public.pem" -RSAPublicKey_out

echo ""
echo "=== Done ==="
echo "  Public key:  $OUT_DIR/license_public.pem  (committed with the repo — ships in the desktop binary)"
echo "  Private key: $OUT_DIR/license_private.pem (NEVER commit — add to cloud .env as CLIENT_LICENSE_PRIVATE_KEY)"
echo ""
echo "Add to your cloud server .env:"
echo "  CLIENT_LICENSE_PRIVATE_KEY=\"\$(awk '{printf \"%s\\\\n\", \$0}' $OUT_DIR/license_private.pem)\""
echo ""
echo "Then rebuild the desktop app so the public key is re-embedded in the binary."
