'use strict';

/**
 * Convert a currency value to integer cents.
 * Rounds to 2dp before multiplying to avoid floating-point errors.
 * Safe for null/undefined/string input from SQL drivers.
 * ZIMRA requires cent-accurate payroll figures.
 */
const toCents = (val) =>
  Math.round(parseFloat(parseFloat(val || 0).toFixed(2)) * 100);

module.exports = { toCents };
