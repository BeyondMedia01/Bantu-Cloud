// Zimbabwe-specific validators

export const ZW_NATIONAL_ID_REGEX = /^\d{2}-\d{7}\s[A-Z]\s\d{2}$/;

export function normalizePhone(value: string): string {
  return value.replace(/[\s-]/g, '');
}

export function isValidZwPhone(value: string): boolean {
  const n = normalizePhone(value);
  return /^07\d{8}$/.test(n) || /^2637\d{8}$/.test(n);
}

// Luhn algorithm
function luhn(number: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = number.length - 1; i >= 0; i--) {
    let n = parseInt(number[i], 10);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export type CardType = 'Visa' | 'Mastercard' | 'Verve' | 'Bank Account' | 'Unknown';

export function detectCardType(raw: string): CardType {
  const num = raw.replace(/[\s-]/g, '');
  if (!num || !/^\d+$/.test(num)) return 'Unknown';

  const len = num.length;
  const p2 = parseInt(num.substring(0, 2), 10);
  const p4 = parseInt(num.substring(0, 4), 10);

  // Visa: starts with 4, length 13/16/19
  if (num[0] === '4' && (len === 13 || len === 16 || len === 19)) {
    return luhn(num) ? 'Visa' : 'Unknown';
  }

  // Mastercard: 51-55 or 2221-2720, length 16
  if (len === 16 && ((p2 >= 51 && p2 <= 55) || (p4 >= 2221 && p4 <= 2720))) {
    return luhn(num) ? 'Mastercard' : 'Unknown';
  }

  // Verve: specific prefixes, length 16-19
  if (len >= 16 && len <= 19 &&
    (num.startsWith('5060') || num.startsWith('5061') ||
     num.startsWith('5078') || num.startsWith('5079') ||
     num.startsWith('6500'))) {
    return luhn(num) ? 'Verve' : 'Unknown';
  }

  // Standard bank account: 8-20 digits
  if (len >= 8 && len <= 20) return 'Bank Account';

  return 'Unknown';
}

export function isValidAccountNumber(raw: string): boolean {
  const num = raw.replace(/[\s-]/g, '');
  if (!/^\d+$/.test(num)) return false;
  return detectCardType(num) !== 'Unknown';
}
