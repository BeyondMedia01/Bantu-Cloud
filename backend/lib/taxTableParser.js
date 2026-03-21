const { parse } = require('csv-parse/sync');
const pdf = require('pdf-parse');
const XLSX = require('xlsx');

/**
 * Parses an Excel buffer into tax brackets
 * Expects the first sheet to have columns: lowerBound, upperBound, rate, fixedAmount
 */
const parseTaxExcel = (buffer) => {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const records = XLSX.utils.sheet_to_json(worksheet);

  return records
    .map((r) => {
      const lb = r.lowerBound ?? r.LowerBound;
      const ub = r.upperBound ?? r.UpperBound;
      const rt = r.rate ?? r.Rate;
      const fa = r.fixedAmount ?? r.FixedAmount;
      return {
        lowerBound: lb !== undefined && lb !== '' ? parseFloat(lb) : NaN,
        upperBound: ub !== undefined && ub !== null && ub !== '' ? parseFloat(ub) : null,
        rate: rt !== undefined && rt !== '' ? parseFloat(rt) : NaN,
        fixedAmount: fa !== undefined && fa !== '' ? parseFloat(fa) : 0,
      };
    })
    .filter((r) => !isNaN(r.lowerBound) && !isNaN(r.rate));
};

/**
 * Parses a CSV buffer into tax brackets
 * Expects headers like: lowerBound, upperBound, rate, fixedAmount
 */
const parseTaxCSV = (buffer) => {
  const records = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  return records
    .map((r) => {
      const lb = r.lowerBound ?? r.LowerBound;
      const ub = r.upperBound ?? r.UpperBound;
      const rt = r.rate ?? r.Rate;
      const fa = r.fixedAmount ?? r.FixedAmount;
      return {
        lowerBound: lb !== undefined && lb !== '' ? parseFloat(lb) : NaN,
        upperBound: ub !== undefined && ub !== null && ub !== '' ? parseFloat(ub) : null,
        rate: rt !== undefined && rt !== '' ? parseFloat(rt) : NaN,
        fixedAmount: fa !== undefined && fa !== '' ? parseFloat(fa) : 0,
      };
    })
    .filter((r) => !isNaN(r.lowerBound) && !isNaN(r.rate));
};

/**
 * Parses a PDF buffer by looking for patterns that look like tax brackets
 * This is heuristics-based and works best for standard tabular layouts
 */
const parseTaxPDF = async (buffer) => {
  const data = await pdf(buffer);
  const text = data.text;
  
  // Look for lines that contain numbers separated by spaces or tabs
  // Patterns like: 0 1000 0.1 0
  const lines = text.split('\n');
  const brackets = [];

  for (const line of lines) {
    // Regex to find 3 or 4 numbers in a row (lower, upper, rate, fixed)
    // Some formats might omit fixedAmount or upperBound
    const matches = line.match(/(\d+[\.\d]*)\s+(\d+[\.\d]*|max|MAX|and above)\s+(\d+[\.\d]*)\s*(\d+[\.\d]*)?/i);
    
    if (matches) {
      const lower = parseFloat(matches[1]);
      const upperStr = matches[2].toLowerCase();
      const upper = (upperStr.includes('max') || upperStr.includes('above')) ? null : parseFloat(upperStr);
      const rate = parseFloat(matches[3]);
      const fixed = matches[4] ? parseFloat(matches[4]) : 0;

      // Validate that it looks like a real bracket (lowerBound < upperBound if applicable)
      if (!isNaN(lower) && !isNaN(rate)) {
        brackets.push({
          lowerBound: lower,
          upperBound: upper,
          rate: rate > 1 ? rate / 100 : rate, // Handle both 0.1 and 10% formats
          fixedAmount: fixed,
        });
      }
    }
  }

  // Sort by lowerBound
  return brackets.sort((a, b) => a.lowerBound - b.lowerBound);
};

module.exports = {
  parseTaxCSV,
  parseTaxPDF,
  parseTaxExcel,
};
