/**
 * Calculates Year-To-Date (YTD) totals for a payslip and its transactions.
 *
 * @param {Object} params
 * @param {Object} params.currentPayslip - Current payslip record
 * @param {Array} params.historicalPayslips - Previous payslips in the same tax year
 * @param {Array} params.currentTransactions - Transactions for the current payslip
 * @param {Array} params.historicalTransactions - Previous transactions for the same tax year
 */
function calculateYTD({ currentPayslip, historicalPayslips, currentTransactions, historicalTransactions }) {
  const ytdMap = {};

  const ytdStat = {
    basicSalary: currentPayslip.basicSalaryApplied || 0,
    paye: currentPayslip.paye || 0,
    aidsLevy: currentPayslip.aidsLevy || 0,
    nssaEmployee: currentPayslip.nssaEmployee || 0,
    necLevy: currentPayslip.necLevy || 0,
    loanDeductions: currentPayslip.loanDeductions || 0,
    nssaEmployer: currentPayslip.nssaEmployer || 0,
    zimdefEmployer: currentPayslip.zimdefEmployer || 0,
    sdfContribution: currentPayslip.sdfContribution || 0,
    wcifEmployer: currentPayslip.wcifEmployer || 0,
    necEmployer: currentPayslip.necEmployer || 0,
    medicalAidCredit: currentPayslip.medicalAidCredit || 0,
  };

  // Add historical payslip totals
  historicalPayslips.forEach(ps => {
    ytdStat.basicSalary += ps.basicSalaryApplied || 0;
    ytdStat.paye += ps.paye || 0;
    ytdStat.aidsLevy += ps.aidsLevy || 0;
    ytdStat.nssaEmployee += ps.nssaEmployee || 0;
    ytdStat.necLevy += ps.necLevy || 0;
    ytdStat.loanDeductions += ps.loanDeductions || 0;
    ytdStat.nssaEmployer += ps.nssaEmployer || 0;
    ytdStat.zimdefEmployer += ps.zimdefEmployer || 0;
    ytdStat.sdfContribution += ps.sdfContribution || 0;
    ytdStat.wcifEmployer += ps.wcifEmployer || 0;
    ytdStat.necEmployer += ps.necEmployer || 0;
    ytdStat.medicalAidCredit += ps.medicalAidCredit || 0;
  });

  // Calculate YTD for each transaction code
  currentTransactions.forEach(t => {
    ytdMap[t.transactionCodeId] = (ytdMap[t.transactionCodeId] || 0) + (t.amount || 0);
  });

  historicalTransactions.forEach(t => {
    ytdMap[t.transactionCodeId] = (ytdMap[t.transactionCodeId] || 0) + (t.amount || 0);
  });

  return { ytdMap, ytdStat };
}

/**
 * Returns the YTD window start date for Zimbabwe payroll.
 *
 * Business rule (confirmed with client):
 *   - Zimbabwe tax year starts April 1.
 *   - If a company's first payroll run was after April 1 (e.g. a company that
 *     started mid-year), YTD accumulates from that first run date — not from
 *     April 1 — to avoid phantom zero months.
 *   - YTD start = MAX(April 1 of the current tax year, companyFirstPayrollDate)
 *
 * @param {Date|string} payrollRunDate       - The startDate of the current payroll run.
 * @param {Date|string|null} companyFirstPayrollDate - The earliest payroll run startDate
 *                                             for this company (may be null for legacy data).
 * @returns {Date}
 */
function getYtdStartDate(payrollRunDate, companyFirstPayrollDate) {
  const runDate = new Date(payrollRunDate);

  // April 1 of the Zimbabwe tax year that contains runDate.
  // Jan–Mar belong to the tax year that started the previous April.
  let taxYearStart = new Date(runDate.getFullYear(), 3, 1); // April 1 of current calendar year
  if (runDate < taxYearStart) {
    // We're in Jan–Mar: tax year started April 1 of last calendar year
    taxYearStart = new Date(runDate.getFullYear() - 1, 3, 1);
  }

  if (companyFirstPayrollDate) {
    const firstRun = new Date(companyFirstPayrollDate);
    // Guard against invalid / epoch dates (new Date(null) === 1970-01-01)
    if (!isNaN(firstRun.getTime()) && firstRun.getFullYear() > 1970 && firstRun > taxYearStart) {
      return firstRun;
    }
  }

  return taxYearStart;
}

module.exports = { calculateYTD, getYtdStartDate };
