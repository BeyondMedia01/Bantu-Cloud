// RFC 4226 (HOTP) + RFC 6238 (TOTP) — implemented via Web Crypto (works in Cloudflare Workers)

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateSecret(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  let result = '';
  let buffer = 0, bitsLeft = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bitsLeft += 8;
    while (bitsLeft >= 5) {
      bitsLeft -= 5;
      result += BASE32_CHARS[(buffer >> bitsLeft) & 0x1f];
    }
  }
  if (bitsLeft > 0) result += BASE32_CHARS[(buffer << (5 - bitsLeft)) & 0x1f];
  return result;
}

function base32Decode(s: string): Uint8Array {
  const str = s.toUpperCase().replace(/=+$/, '');
  const bytes: number[] = [];
  let buffer = 0, bitsLeft = 0;
  for (const char of str) {
    const val = BASE32_CHARS.indexOf(char);
    if (val === -1) continue;
    buffer = (buffer << 5) | val;
    bitsLeft += 5;
    if (bitsLeft >= 8) {
      bitsLeft -= 8;
      bytes.push((buffer >> bitsLeft) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

async function hotp(secret: string, counter: number): Promise<string> {
  const key = base32Decode(secret);
  const counterBytes = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    counterBytes[i] = c & 0xff;
    c = Math.floor(c / 256);
  }

  const cryptoKey = await crypto.subtle.importKey(
    'raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'],
  );
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, counterBytes));

  const offset = sig[19] & 0xf;
  const code = ((sig[offset] & 0x7f) << 24)
    | ((sig[offset + 1] & 0xff) << 16)
    | ((sig[offset + 2] & 0xff) << 8)
    | (sig[offset + 3] & 0xff);

  return String(code % 1_000_000).padStart(6, '0');
}

export async function generateTOTP(secret: string): Promise<string> {
  return hotp(secret, Math.floor(Date.now() / 1000 / 30));
}

/** Allows ±1 window (90-second grace) */
export async function verifyTOTP(secret: string, code: string): Promise<boolean> {
  const counter = Math.floor(Date.now() / 1000 / 30);
  for (const delta of [-1, 0, 1]) {
    if (await hotp(secret, counter + delta) === code) return true;
  }
  return false;
}

export function totpUri(secret: string, email: string, issuer = 'Bantu Cloud'): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
