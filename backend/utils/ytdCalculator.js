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

module.exports = { calculateYTD };
