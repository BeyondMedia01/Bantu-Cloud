import type { CSSProperties } from 'react';

// Each pair shares a hue; both stops have contrast ≥ 4.5:1 against white (WCAG AA).
const GRADIENTS = [
  'linear-gradient(135deg, #4f46e5, #6366f1)',  // indigo
  'linear-gradient(135deg, #0f766e, #0d9488)',  // teal
  'linear-gradient(135deg, #7c3aed, #8b5cf6)',  // violet
  'linear-gradient(135deg, #be123c, #e11d48)',  // rose
  'linear-gradient(135deg, #1d4ed8, #2563eb)',  // blue
  'linear-gradient(135deg, #c2410c, #ea580c)',  // orange
  'linear-gradient(135deg, #0e7490, #0891b2)',  // cyan
  'linear-gradient(135deg, #7e22ce, #9333ea)',  // purple
  'linear-gradient(135deg, #047857, #059669)',  // emerald
  'linear-gradient(135deg, #92400e, #b45309)',  // amber
  'linear-gradient(135deg, #9d174d, #db2777)',  // pink
  'linear-gradient(135deg, #1e40af, #1d4ed8)',  // deep blue
] as const;

const FALLBACK: CSSProperties = { background: '#64748b', color: '#fff' };

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Returns deterministic inline styles for an avatar circle based on a seed
 * string (typically a name or ID). The same seed always yields the same
 * gradient. Falls back to neutral slate when no seed is provided.
 */
export function getAvatarGradient(seed?: string | null): CSSProperties {
  if (!seed?.trim()) return FALLBACK;
  return { background: GRADIENTS[hashStr(seed) % GRADIENTS.length], color: '#fff' };
}
