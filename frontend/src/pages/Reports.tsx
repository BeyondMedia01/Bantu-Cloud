import React, { useState, useEffect } from 'react';
import { FileText, Download, Clock, ShieldCheck, FileSpreadsheet, Scale, BarChart2, Users, BookOpen, CreditCard, TrendingUp, Info } from 'lucide-react';
import api, { ReportsAPI, IntelligenceAPI, PayrollAPI } from '../api/client';
import { getActiveCompanyId } from '../lib/companyContext';
import { useToast } from '../context/ToastContext';

const MONTHS = [
  { id: 1, name: 'January' }, { id: 2, name: 'February' }, { id: 3, name: 'March' },
  { id: 4, name: 'April' }, { id: 5, name: 'May' }, { id: 6, name: 'June' },
  { id: 7, name: 'July' }, { id: 8, name: 'August' }, { id: 9, name: 'September' },
  { id: 10, name: 'October' }, { id: 11, name: 'November' }, { id: 12, name: 'December' },
];

const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const currentYear = new Date().getFullYear();
const YEARS = [currentYear, currentYear - 1, currentYear - 2];

const Reports: React.FC = () => {
  const companyId = getActiveCompanyId();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [runs, setRuns] = useState<any[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [downloading, setDownloading] = useState<string | null>(null);
  const { showToast } = useToast();
  const [cashflow, setCashflow] = useState<any>(null);
  const [loadingCashflow, setLoadingCashflow] = useState(false);

  useEffect(() => {
    if (companyId) {
      // Fetch completed runs for EFT and other run-based reports
      api.get('/payroll', { params: { companyId, status: 'COMPLETED' } })
        .then(res => {
          const list = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
          setRuns(list);
          if (list.length > 0) setSelectedRunId(list[0].id);
        });
      
      setLoadingCashflow(true);
      IntelligenceAPI.getCashflow(companyId)
        .then(res => setCashflow(res.data))
        .finally(() => setLoadingCashflow(false));
    }
  }, [companyId]);

  const download = async (type: string, fn: () => Promise<any>, filename: string) => {
    setDownloading(type);
    try {
      const res = await fn();
      const blob = new Blob([res.data], { type: res.headers['content-type'] || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`${filename} generated successfully`, 'success');
    } catch {
      showToast('Failed to generate report.', 'error');
    } finally {
      setDownloading(null);
    }
  };

  const downloadP16 = () =>
    download('p16', () => ReportsAPI.tax({ year: String(selectedYear), format: 'pdf' }), `ZIMRA_P16_${selectedYear}.pdf`);

  const downloadP2 = () =>
    download('p2', () => ReportsAPI.p2({ month: String(selectedMonth), year: String(selectedYear) }), `ZIMRA_P2_${selectedMonth}_${selectedYear}.pdf`);

  const downloadNssa = () =>
    download('nssa', () => ReportsAPI.nssaP4a({ month: String(selectedMonth), year: String(selectedYear) }), `NSSA_P4A_${selectedMonth}_${selectedYear}.pdf`);

  const downloadEft = () => {
    if (!selectedRunId) return showToast('Please select a payroll run first.', 'warning');
    download('eft', () => ReportsAPI.eft({ runId: selectedRunId }), `Bank_EFT_${selectedRunId}.csv`);
  };

  const downloadPayslips = () => {
    if (!selectedRunId) return showToast('Please select a payroll run first.', 'warning');
    download('payslips', () => ReportsAPI.payslips({ runId: selectedRunId, format: 'csv' }), `Payslips_${selectedRunId}.csv`);
  };

  const downloadJournals = () => {
    if (!selectedRunId) return showToast('Please select a payroll run first.', 'warning');
    download('journals', () => ReportsAPI.journals({ runId: selectedRunId, format: 'csv' }), `Journals_${selectedRunId}.csv`);
  };

  const downloadLeave = () =>
    download('leave', () => ReportsAPI.leave({ format: 'csv' }), `Leave_Report.csv`);

  const downloadLoans = () =>
    download('loans', () => ReportsAPI.loans({ format: 'csv' }), `Loans_Report.csv`);

  const downloadDepartments = () =>
    download('departments', () => ReportsAPI.departments(), `Departments_Headcount.csv`);

  const downloadSummaryPdf = () => {
    if (!selectedRunId) return showToast('Please select a payroll run first.', 'warning');
    download('summary-pdf', () => PayrollAPI.downloadSummaryPdf(selectedRunId), `Payroll_Summary_${selectedRunId}.pdf`);
  };

  const downloadPension = (provider: string) => {
    const monthStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
    return download(`pension-${provider}`, () => ReportsAPI.pensionExport({ month: monthStr, type: provider }), `Pension_Export_${provider}_${selectedMonth}_${selectedYear}.csv`);
  };

  const disabled = !companyId;
  const isDownloading = (type: string) => downloading === type;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-navy">Reports</h2>
          <p className="text-slate-500 font-medium text-sm">Generate and export ZIMRA & NSSA-compliant documentation.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="bg-slate-50 border border-border rounded-xl px-3 py-2 text-sm font-bold text-navy focus:outline-none"
          >
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 flex flex-col gap-6">

          {/* Statutory Returns */}
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Statutory Returns</h3>
            <div className="flex flex-col gap-3">

              {/* ZIMRA P16 */}
              <div className="bg-primary rounded-2xl border border-border shadow-sm p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 bg-blue-50 text-accent-blue rounded-xl flex items-center justify-center shrink-0">
                    <FileText size={22} />
                  </div>
                  <div>
                    <p className="font-bold text-sm">ZIMRA P16 Annual Summary</p>
                    <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Tax Year {selectedYear}</p>
                  </div>
                </div>
                <button
                  disabled={disabled || isDownloading('p16')}
                  onClick={downloadP16}
                  className="bg-btn-primary text-navy px-5 py-2 rounded-full font-bold text-sm shadow hover:opacity-90 flex items-center gap-2 disabled:opacity-40 shrink-0"
                >
                  <Download size={15} /> {isDownloading('p16') ? 'Generating…' : 'Export P16'}
                </button>
              </div>

              {/* ZIMRA P2 */}
              <div className="bg-primary rounded-2xl border border-border shadow-sm p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center shrink-0">
                    <FileText size={22} />
                  </div>
                  <div>
                    <p className="font-bold text-sm">ZIMRA P2 Monthly Return</p>
                    <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Income Tax Remittance</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    className="bg-slate-50 border border-border rounded-xl px-3 py-2 text-sm font-bold text-navy focus:outline-none"
                  >
                    {MONTHS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <button
                    disabled={disabled || isDownloading('p2')}
                    onClick={downloadP2}
                    className="bg-btn-primary text-navy px-5 py-2 rounded-full font-bold text-sm shadow hover:opacity-90 flex items-center gap-2 disabled:opacity-40"
                  >
                    <Download size={15} /> {isDownloading('p2') ? '…' : 'Export P2'}
                  </button>
                </div>
              </div>

              {/* NSSA P4A */}
              <div className="bg-primary rounded-2xl border border-border shadow-sm p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center shrink-0">
                    <Scale size={22} />
                  </div>
                  <div>
                    <p className="font-bold text-sm">NSSA P4A Monthly Return</p>
                    <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Social Security Remittance</p>
                  </div>
                </div>
                <button
                  disabled={disabled || isDownloading('nssa')}
                  onClick={downloadNssa}
                  className="bg-btn-primary text-navy px-5 py-2 rounded-full font-bold text-sm shadow hover:opacity-90 flex items-center gap-2 disabled:opacity-40 shrink-0"
                >
                  <Download size={15} /> {isDownloading('nssa') ? 'Generating…' : 'Export P4A'}
                </button>
              </div>

              {/* Pension Fund Exports */}
              <div className="mt-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Pension Fund Exports</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { id: 'mipf', name: 'MIPF Export' },
                    { id: 'comone', name: 'Comone Export' },
                    { id: 'oldmutual', name: 'Old Mutual' }
                  ].map(p => (
                    <button
                      key={p.id}
                      disabled={disabled || isDownloading(`pension-${p.id}`)}
                      onClick={() => downloadPension(p.id)}
                      className="bg-white border border-border p-4 rounded-2xl flex flex-col gap-2 hover:border-accent-blue transition-all text-left"
                    >
                      <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400">
                        <Download size={16} />
                      </div>
                      <span className="text-xs font-bold text-navy">{p.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Operational Reports */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Operational Reports</h3>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Target Run:</span>
                <select
                  value={selectedRunId}
                  onChange={(e) => setSelectedRunId(e.target.value)}
                  className="bg-slate-50 border border-border rounded-lg px-2 py-1 text-[11px] font-bold text-navy focus:outline-none max-w-[150px]"
                >
                  <option value="">Select Run...</option>
                  {runs.map((r: any) => (
                    <option key={r.id} value={r.id}>
                      {fmtDate(r.startDate)} – {fmtDate(r.endDate)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { key: 'summary-pdf', icon: <FileText size={20} />, color: 'bg-slate-100 text-slate-700', label: 'Payroll Summary PDF', sub: 'Full summary for selected run', fn: downloadSummaryPdf },
                { key: 'eft', icon: <CreditCard size={20} />, color: 'bg-orange-50 text-orange-600', label: 'Bank EFT Export', sub: 'Bulk payment CSV', fn: downloadEft },
                { key: 'payslips', icon: <FileText size={20} />, color: 'bg-purple-50 text-purple-600', label: 'Payslips Export', sub: 'CSV for selected run', fn: downloadPayslips },
                { key: 'journals', icon: <FileSpreadsheet size={20} />, color: 'bg-indigo-50 text-indigo-600', label: 'Payroll Journals', sub: 'Transaction level export', fn: downloadJournals },
                { key: 'leave', icon: <BookOpen size={20} />, color: 'bg-amber-50 text-amber-600', label: 'Leave Report', sub: 'Leave balances & history', fn: downloadLeave },
                { key: 'loans', icon: <BarChart2 size={20} />, color: 'bg-rose-50 text-rose-600', label: 'Loans Report', sub: 'Active & settled loans', fn: downloadLoans },
                { key: 'departments', icon: <Users size={20} />, color: 'bg-teal-50 text-teal-600', label: 'Headcount Report', sub: 'Employees by dept.', fn: downloadDepartments },
              ].map(({ key, icon, color, label, sub, fn }) => (
                <button
                  key={key}
                  disabled={disabled || isDownloading(key)}
                  onClick={fn}
                  className="bg-primary rounded-2xl border border-border shadow-sm p-4 flex items-center gap-3 hover:shadow-md transition-shadow text-left disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <div className={`w-10 h-10 ${color} rounded-xl flex items-center justify-center shrink-0`}>{icon}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">{isDownloading(key) ? 'Wait…' : label}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase truncate">{sub}</p>
                  </div>
                  <Download size={14} className="text-slate-300 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-6">
          <div className="bg-navy rounded-2xl text-white p-6 relative overflow-hidden shadow-xl">
            <ShieldCheck size={100} className="absolute -right-8 -bottom-8 text-white/5" />
            <h3 className="text-lg font-bold mb-3 relative z-10">Statutory Guard</h3>
            <p className="text-blue-100 font-medium leading-relaxed mb-5 opacity-80 relative z-10 text-sm">
              Export ZIMRA and NSSA compliant forms generated from your validated payroll runs.
            </p>
            <div className="flex flex-col gap-3 relative z-10">
              <div className="flex items-center gap-3">
                <div className="px-2.5 py-1 bg-white/10 rounded-lg text-xs font-bold">ZIMRA</div>
                <span className="text-sm font-semibold text-blue-50">Authorized P16 Layout</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="px-2.5 py-1 bg-white/10 rounded-lg text-xs font-bold">NSSA</div>
                <span className="text-sm font-semibold text-blue-50">Accurate P4A Calculation</span>
              </div>
            </div>
          </div>

          <div className="bg-indigo-600 rounded-2xl text-white p-6 shadow-xl relative overflow-hidden">
             <TrendingUp size={120} className="absolute -right-8 -bottom-8 text-white/10" />
             <div className="flex items-center gap-2 mb-4 relative z-10">
               <TrendingUp size={18} className="text-indigo-200" />
               <h3 className="text-sm font-bold uppercase tracking-wider text-indigo-100">AI Cashflow Forecast</h3>
             </div>
             
             {loadingCashflow ? (
               <div className="animate-pulse flex flex-col gap-3">
                 <div className="h-8 bg-white/10 rounded w-1/2"></div>
                 <div className="h-4 bg-white/10 rounded w-3/4"></div>
               </div>
             ) : cashflow ? (
               <div className="relative z-10">
                 <div className="text-2xl font-black mb-1">
                   {cashflow.currency} {cashflow.predictedTotal?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                 </div>
                 <p className="text-xs font-medium text-indigo-100 mb-4">
                   Predicted requirement for current cycle
                 </p>
                 <div className="flex items-center gap-2 px-3 py-1.5 bg-white/10 rounded-xl w-fit">
                   <Info size={12} className="text-indigo-200" />
                   <span className="text-[10px] font-bold">
                     {cashflow.variance > 0 ? '+' : ''}{(cashflow.variance * 100).toFixed(1)}% vs historical avg
                   </span>
                 </div>
               </div>
             ) : (
               <p className="text-xs text-indigo-200 font-medium italic">No forecast data available</p>
             )}
          </div>

          <div className="bg-primary rounded-2xl border border-border p-5 shadow-sm">
            <h3 className="text-xs font-bold text-navy uppercase tracking-wider mb-4">Filing Deadlines</h3>
            <div className="flex flex-col gap-3">
              <DeadlineItem month="Jan" day="15" label="ZIMRA PAYE" sub="Monthly return" critical />
              <DeadlineItem month="Jan" day="15" label="NSSA Contributions" sub="Monthly remittance" critical />
              <DeadlineItem month="Jan" day="15" label="ZIMDEF Levy" sub="Skills levy" />
              <DeadlineItem month="Mar" day="31" label="P16 Annual" sub="Annual tax certificate" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const DeadlineItem: React.FC<{ month: string; day: string; label: string; sub: string; critical?: boolean }> = ({ month, day, label, sub, critical }) => (
  <div className="flex items-center gap-3">
    <div className={`w-10 h-10 ${critical ? 'bg-red-50 text-red-500' : 'bg-slate-50 text-slate-400'} rounded-xl flex flex-col items-center justify-center font-bold shrink-0`}>
      <span className="text-[9px] leading-none uppercase">{month}</span>
      <span className="text-base leading-none">{day}</span>
    </div>
    <div>
      <p className="text-sm font-bold">{label}</p>
      <p className={`text-[10px] font-bold uppercase tracking-wider ${critical ? 'text-red-400' : 'text-slate-400'}`}>{sub}</p>
    </div>
    <Clock size={14} className="text-slate-200 ml-auto shrink-0" />
  </div>
);

export default Reports;
