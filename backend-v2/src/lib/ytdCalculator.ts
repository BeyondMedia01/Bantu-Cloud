export interface YtdStats {
  basicSalary: number;
  paye: number;
  aidsLevy: number;
  nssaEmployee: number;
  necLevy: number;
  loanDeductions: number;
  nssaEmployer: number;
  zimdefEmployer: number;
  sdfContribution: number;
  wcifEmployer: number;
  necEmployer: number;
  medicalAidCredit: number;
  pensionApplied?: number;
}

export interface YtdStatsZIG {
  basicSalary: number;
  paye: number;
  aidsLevy: number;
  nssaEmployee: number;
}

export interface YtdResult {
  ytdMap: Record<string, number>;
  ytdMapZIG: Record<string, number>;
  ytdStat: YtdStats;
  ytdStatZIG: YtdStatsZIG;
}

export function calculateYTD(params: {
  currentPayslip: any;
  historicalPayslips: any[];
  currentTransactions: any[];
  historicalTransactions: any[];
}): YtdResult {
  const { currentPayslip, historicalPayslips, currentTransactions, historicalTransactions } = params;
  const ytdMap: Record<string, number> = {};
  const ytdMapZIG: Record<string, number> = {};

  const ytdStat: YtdStats = {
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

  const ytdStatZIG: YtdStatsZIG = {
    basicSalary: currentPayslip.basicSalaryApplied || 0,
    paye: currentPayslip.payeZIG || 0,
    aidsLevy: currentPayslip.aidsLevyZIG || 0,
    nssaEmployee: currentPayslip.nssaZIG || 0,
  };

  for (const ps of historicalPayslips) {
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

    ytdStatZIG.basicSalary += ps.basicSalaryApplied || 0;
    ytdStatZIG.paye += ps.payeZIG || 0;
    ytdStatZIG.aidsLevy += ps.aidsLevyZIG || 0;
    ytdStatZIG.nssaEmployee += ps.nssaZIG || 0;
  }

  const accumulateTx = (t: any) => {
    if (t.currency === 'ZiG') {
      ytdMapZIG[t.transactionCodeId] = (ytdMapZIG[t.transactionCodeId] || 0) + (t.amount || 0);
    } else {
      ytdMap[t.transactionCodeId] = (ytdMap[t.transactionCodeId] || 0) + (t.amount || 0);
    }
  };

  currentTransactions.forEach(accumulateTx);
  historicalTransactions.forEach(accumulateTx);

  return { ytdMap, ytdMapZIG, ytdStat, ytdStatZIG };
}

export function getYtdStartDate(payrollRunDate: Date | string, companyFirstPayrollDate: Date | string | null): Date {
  const runDate = new Date(payrollRunDate);

  let taxYearStart = new Date(runDate.getFullYear(), 3, 1);
  if (runDate < taxYearStart) {
    taxYearStart = new Date(runDate.getFullYear() - 1, 3, 1);
  }

  if (companyFirstPayrollDate) {
    const firstRun = new Date(companyFirstPayrollDate);
    if (!isNaN(firstRun.getTime()) && firstRun.getFullYear() > 1970 && firstRun > taxYearStart) {
      return firstRun;
    }
  }

  return taxYearStart;
}
