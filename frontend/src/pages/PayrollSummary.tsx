import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Users, TrendingUp, TrendingDown, DollarSign, Banknote, ChevronDown, FileText, Eye } from 'lucide-react';
import { PayrollAPI, StatutoryExportAPI, BankFileAPI } from '../api/client';
import { useToast } from '../context/ToastContext';
import { Dropdown } from '../components/ui/dropdown';

const fmt = (n: number | null | undefined) =>
  n != null ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

const PayrollSummary: React.FC = () => {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [run, setRun] = useState<any>(null);
  const [payslips, setPayslips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState('');
  const [rerunSuccess, setRerunSuccess] = useState(false);

  useEffect(() => {
    if (!runId) return;
    Promise.all([PayrollAPI.getById(runId), PayrollAPI.getPayslips(runId)])
      .then(([r, p]) => { setRun(r.data); setPayslips(p.data); })
      .catch(() => showToast('Failed to load payroll run', 'error'))
      .finally(() => setLoading(false));
  }, [runId]);

  const isDual = run?.dualCurrency;
  const ccy = run?.currency || 'USD';

  const totals = useMemo(() => {
    if (!payslips.length) return null;
    return {
      employees: payslips.length,
      gross: payslips.reduce((s, p) => s + (p.gross ?? 0), 0),
      grossUSD: payslips.reduce((s, p) => s + (p.grossUSD ?? p.gross ?? 0), 0),
      grossZIG: payslips.reduce((s, p) => s + (p.grossZIG ?? 0), 0),
      paye: payslips.reduce((s, p) => s + (p.paye ?? 0), 0),
      nssa: payslips.reduce((s, p) => s + (p.nssaEmployee ?? 0), 0),
      aidsLevy: payslips.reduce((s, p) => s + (p.aidsLevy ?? 0), 0),
      loans: payslips.reduce((s, p) => s + (p.loanDeductions ?? 0), 0),
      net: payslips.reduce((s, p) => s + (p.netPay ?? 0), 0),
      netUSD: payslips.reduce((s, p) => s + (p.netPayUSD ?? p.netPay ?? 0), 0),
      netZIG: payslips.reduce((s, p) => s + (p.netPayZIG ?? 0), 0),
      nssaR: payslips.reduce((s, p) => s + (p.nssaEmployer ?? 0), 0),
      wcif:  payslips.reduce((s, p) => s + (p.wcifEmployer ?? 0), 0),
      sdf:   payslips.reduce((s, p) => s + (p.sdfContribution ?? 0), 0),
      zimdef: payslips.reduce((s, p) => s + (p.zimdefEmployer ?? 0), 0),
      necR:  payslips.reduce((s, p) => s + (p.necEmployer ?? 0), 0),
    };
  }, [payslips]);

  const handleExport = async (type: 'csv' | 'zimra' | 'nssa') => {
    if (!runId) return;
    setExporting(type);
    try {
      let res: any;
      let filename: string;
      if (type === 'csv') {
        res = await PayrollAPI.exportCsv(runId);
        filename = `payroll-${runId}.csv`;
      } else if (type === 'zimra') {
        res = await StatutoryExportAPI.downloadZimraPaye(runId);
        filename = `ZIMRA-PAYE-${runId}.csv`;
      } else {
        res = await StatutoryExportAPI.downloadNssa(runId);
        filename = `NSSA-${runId}.csv`;
      }
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch { showToast('Export failed', 'error'); }
    finally { setExporting(''); }
  };



  const handlePayslipSummaryDownload = async () => {
    if (!runId) return;
    setExporting('summary-detailed');
    try {
      const res = await PayrollAPI.downloadPayslipSummaryPdf(runId);
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url; a.download = `payslip-summary-${runId}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch { showToast('Failed to generate Detailed Summary', 'error'); }
    finally { setExporting(''); }
  };

  const handlePayslipSummaryPreview = async () => {
    if (!runId) return;
    setExporting('summary-preview');
    try {
      const res = await PayrollAPI.downloadPayslipSummaryPdf(runId);
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
    } catch { showToast('Failed to preview Payroll Summary', 'error'); }
    finally { setExporting(''); }
  };

  const handleBankExport = async (format: 'cbz' | 'stanbic' | 'fidelity') => {
    if (!runId) return;
    setExporting(format);
    try {
      const res = await BankFileAPI.download(format, runId);
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url; a.download = `${format.toUpperCase()}-Payments-${runId}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch { showToast('Failed to generate bank file', 'error'); }
    finally { setExporting(''); }
  };

  if (loading) return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-9 h-9 rounded-xl bg-slate-100" />
        <div className="space-y-2">
          <div className="h-5 w-40 bg-slate-100 rounded" />
          <div className="h-3 w-56 bg-slate-50 rounded" />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-primary border border-border rounded-2xl p-4 space-y-3">
            <div className="h-3 w-16 bg-slate-100 rounded" />
            <div className="h-6 w-20 bg-slate-100 rounded" />
          </div>
        ))}
      </div>
      <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto scroll-x-shadow">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-slate-50">
                {['Employee', 'Basic', 'Gross', 'PAYE', 'NSSA', 'AIDS Levy', 'Net Pay'].map((h) => (
                  <th key={h} className="px-5 py-4 text-xs font-bold text-slate-300 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-100 shrink-0" />
                      <div className="space-y-2"><div className="h-3 w-24 bg-slate-100 rounded" /><div className="h-2 w-14 bg-slate-50 rounded" /></div>
                    </div>
                  </td>
                  {Array.from({ length: 6 }).map((_, ci) => (
                    <td key={ci} className="px-5 py-4"><div className="h-3 w-16 bg-slate-100 rounded" /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const statusColor: Record<string, string> = {
    COMPLETED: 'bg-emerald-100 text-emerald-700',
    PROCESSING: 'bg-blue-100 text-blue-700',
    DRAFT: 'bg-slate-100 text-slate-600',
    ERROR: 'bg-red-100 text-red-700',
    PENDING_APPROVAL: 'bg-amber-100 text-amber-700',
    APPROVED: 'bg-teal-100 text-teal-700',
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/payroll')} aria-label="Go back" className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold">Payroll Summary</h1>
          {run && (
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-slate-500 text-sm font-medium">
                {new Date(run.startDate).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
                {' – '}
                {new Date(run.endDate).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusColor[run.status] || 'bg-slate-100 text-slate-600'}`}>
                {run.status}
              </span>
              <span className="text-slate-400 text-xs font-bold">
                {isDual ? 'USD + ZiG' : ccy}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons — single row between header and stat cards */}
      {run?.status === 'COMPLETED' && (
        <div className="flex items-center gap-2 flex-wrap">
          {!run.payrollCalendar?.isClosed && (
            <button
              onClick={async () => {
                setExporting('rerun');
                setRerunSuccess(false);
                try {
                  await PayrollAPI.process(runId!);
                  const [r, p] = await Promise.all([
                    PayrollAPI.getById(runId!),
                    PayrollAPI.getPayslips(runId!),
                  ]);
                  setRun(r.data);
                  setPayslips(p.data);
                  setRerunSuccess(true);
                  showToast('Payroll rerun completed successfully!', 'success');
                } catch (err: any) {
                  showToast(err.response?.data?.message || 'Rerun failed', 'error');
                } finally {
                  setExporting('');
                }
              }}
              disabled={!!exporting}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-full text-sm font-bold hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            >
              <TrendingUp size={14} /> {exporting === 'rerun' ? 'Processing…' : 'Rerun Payroll'}
            </button>
          )}
          <button
            onClick={handlePayslipSummaryPreview}
            disabled={!!exporting}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-full text-sm font-bold hover:bg-red-100 disabled:opacity-50 transition-colors"
          >
            <Eye size={14} /> {exporting === 'summary-preview' ? 'Loading…' : 'Preview Summary'}
          </button>
          <button
            onClick={handlePayslipSummaryDownload}
            disabled={!!exporting}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-full text-sm font-bold hover:bg-red-500 disabled:opacity-50 transition-colors"
          >
            <FileText size={14} /> {exporting === 'summary-detailed' ? 'Generating…' : 'Payslip Summary'}
          </button>
          <button
            onClick={() => handleExport('csv')}
            disabled={!!exporting}
            className="flex items-center gap-1.5 px-4 py-2 border border-border rounded-full text-sm font-bold hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            <Download size={14} /> {exporting === 'csv' ? 'Exporting…' : 'Export CSV'}
          </button>
          <button
            onClick={() => handleExport('zimra')}
            disabled={!!exporting}
            className="flex items-center gap-1.5 px-4 py-2 bg-purple-50 text-purple-700 border border-purple-100 rounded-full text-sm font-bold hover:bg-purple-100 disabled:opacity-50 transition-colors"
          >
            <FileText size={14} /> ZIMRA PAYE
          </button>
          <button
            onClick={() => handleExport('nssa')}
            disabled={!!exporting}
            className="flex items-center gap-1.5 px-4 py-2 bg-orange-50 text-orange-700 border border-orange-100 rounded-full text-sm font-bold hover:bg-orange-100 disabled:opacity-50 transition-colors"
          >
            <FileText size={14} /> NSSA
          </button>
          <Dropdown
            align="left"
            disabled={!!exporting}
            trigger={(isOpen) => (
              <button
                disabled={!!exporting}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full text-sm font-bold hover:bg-emerald-100 disabled:opacity-50 transition-colors"
              >
                <Banknote size={14} /> Bank <ChevronDown size={12} className={isOpen ? 'rotate-180' : ''} />
              </button>
            )}
            sections={[{
              items: (['cbz', 'stanbic', 'fidelity'] as const).map((fmt) => ({
                label: fmt,
                onClick: () => handleBankExport(fmt),
              })),
            }]}
          />
        </div>
      )}

      {/* Rerun success banner */}
      {rerunSuccess && (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl animate-fade-in">
          <div className="flex-shrink-0 w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
            <TrendingUp size={16} className="text-emerald-600" />
          </div>
          <div>
            <p className="font-bold text-emerald-800 text-sm">Payroll Rerun Complete</p>
            <p className="text-xs text-emerald-600">All payslips have been recalculated. The summary below reflects the updated figures.</p>
          </div>
          <button onClick={() => setRerunSuccess(false)} className="ml-auto text-emerald-400 hover:text-emerald-600 text-sm font-bold">✕</button>
        </div>
      )}

      {/* Summary cards */}
      {totals && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Employees', value: String(totals.employees), icon: Users, color: 'text-slate-600', bg: 'bg-slate-50' },
            {
              label: isDual ? 'Gross (USD)' : 'Total Gross',
              value: isDual ? `$${fmt(totals.grossUSD)}` : `${ccy} ${fmt(totals.gross)}`,
              icon: TrendingUp, color: 'text-emerald-700', bg: 'bg-emerald-50',
            },
            ...(isDual ? [{ label: 'Gross (ZiG)', value: `Z ${fmt(totals.grossZIG)}`, icon: TrendingUp, color: 'text-blue-700', bg: 'bg-blue-50' }] : []),
            { label: 'Total PAYE', value: `${isDual ? '$' : ccy + ' '}${fmt(totals.paye)}`, icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-50' },
            { label: 'Total NSSA', value: `${isDual ? '$' : ccy + ' '}${fmt(totals.nssa)}`, icon: TrendingDown, color: 'text-orange-600', bg: 'bg-orange-50' },
            {
              label: isDual ? 'Net Pay (USD)' : 'Total Net Pay',
              value: isDual ? `$${fmt(totals.netUSD)}` : `${ccy} ${fmt(totals.net)}`,
              icon: DollarSign, color: 'text-accent-green', bg: 'bg-blue-50',
            },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-primary border border-border rounded-2xl p-4 shadow-sm">
              <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mb-2`}>
                <Icon size={15} className={color} />
              </div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
              <p className="text-lg font-bold text-navy leading-tight">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Detail table */}
      {payslips.length === 0 ? (
        <div className="text-center py-16 text-slate-400 bg-primary border border-border rounded-2xl">
          <p className="font-medium">No payslips found for this run.</p>
        </div>
      ) : (
        <div className="bg-primary border border-border rounded-2xl shadow-sm overflow-x-auto">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="font-bold text-sm uppercase tracking-wider text-slate-500">Employee Breakdown</h2>
          </div>
          <table className="w-full text-left min-w-max">
            <thead>
              <tr className="border-b border-border bg-slate-50">
                {[
                  'Employee', 'Position',
                  isDual ? 'Basic (USD)' : 'Basic',
                  isDual ? 'Gross (USD)' : 'Gross Pay',
                  ...(isDual ? ['Gross (ZiG)'] : []),
                  'PAYE', 'NSSA', 'AIDS Levy',
                  ...(totals && totals.loans > 0 ? ['Loans'] : []),
                  'Total Deductions',
                  isDual ? 'Net Pay (USD)' : 'Net Pay',
                  ...(isDual ? ['Net Pay (ZiG)'] : []),
                  'NSSA Empr', 'WCIF', 'SDF', 'ZIMDEF', 'NEC Empr'
                ].map((h) => (
                  <th key={h} className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payslips.map((p: any) => {
                const grossUSD = p.grossUSD ?? p.gross ?? 0;
                const netUSD = p.netPayUSD ?? p.netPay ?? 0;
                const totalDed = (p.paye ?? 0) + (p.nssaEmployee ?? 0) + (p.aidsLevy ?? 0) + (p.loanDeductions ?? 0);
                const showLoans = totals && totals.loans > 0;

                return (
                  <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-bold text-sm">{p.employee?.firstName} {p.employee?.lastName}</p>
                      <p className="text-[11px] text-slate-400">{p.employee?.employeeCode}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{p.employee?.position || '—'}</td>
                    <td className="px-4 py-3 text-sm font-bold">{fmt(p.basicSalary ?? p.employee?.baseRate)}</td>
                    <td className="px-4 py-3 text-sm font-bold">{fmt(isDual ? grossUSD : p.gross)}</td>
                    {isDual && <td className="px-4 py-3 text-sm font-bold">{fmt(p.grossZIG)}</td>}
                    <td className="px-4 py-3 text-sm text-red-500 font-medium">{fmt(p.paye)}</td>
                    <td className="px-4 py-3 text-sm text-red-500 font-medium">{fmt(p.nssaEmployee)}</td>
                    <td className="px-4 py-3 text-sm text-red-500 font-medium">{fmt(p.aidsLevy)}</td>
                    {showLoans && <td className="px-4 py-3 text-sm text-red-500 font-medium">{fmt(p.loanDeductions)}</td>}
                    <td className="px-4 py-3 text-sm text-red-500 font-bold">{fmt(totalDed)}</td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-600">{fmt(isDual ? netUSD : p.netPay)}</td>
                    {isDual && <td className="px-4 py-3 text-sm font-bold text-emerald-600">{fmt(p.netPayZIG)}</td>}
                    <td className="px-4 py-3 text-sm text-blue-500 font-medium">{fmt(p.nssaEmployer)}</td>
                    <td className="px-4 py-3 text-sm text-blue-500 font-medium">{fmt(p.wcifEmployer)}</td>
                    <td className="px-4 py-3 text-sm text-blue-500 font-medium">{fmt(p.sdfContribution)}</td>
                    <td className="px-4 py-3 text-sm text-blue-500 font-medium">{fmt(p.zimdefEmployer)}</td>
                    <td className="px-4 py-3 text-sm text-blue-500 font-medium">{fmt(p.necEmployer)}</td>
                  </tr>
                );
              })}
            </tbody>
            {/* Totals row */}
            {totals && (
              <tfoot>
                <tr className="border-t-2 border-border bg-slate-50 font-bold">
                  <td className="px-4 py-3 text-sm" colSpan={2}>Totals</td>
                  <td className="px-4 py-3 text-sm">—</td>
                  <td className="px-4 py-3 text-sm">{fmt(isDual ? totals.grossUSD : totals.gross)}</td>
                  {isDual && <td className="px-4 py-3 text-sm">{fmt(totals.grossZIG)}</td>}
                  <td className="px-4 py-3 text-sm text-red-500">{fmt(totals.paye)}</td>
                  <td className="px-4 py-3 text-sm text-red-500">{fmt(totals.nssa)}</td>
                  <td className="px-4 py-3 text-sm text-red-500">{fmt(totals.aidsLevy)}</td>
                  {totals.loans > 0 && <td className="px-4 py-3 text-sm text-red-500">{fmt(totals.loans)}</td>}
                  <td className="px-4 py-3 text-sm text-red-500">{fmt(totals.paye + totals.nssa + totals.aidsLevy + totals.loans)}</td>
                  <td className="px-4 py-3 text-sm text-emerald-600">{fmt(isDual ? totals.netUSD : totals.net)}</td>
                  {isDual && <td className="px-4 py-3 text-sm text-emerald-600">{fmt(totals.netZIG)}</td>}
                  <td className="px-4 py-3 text-sm text-blue-500">{fmt(totals.nssaR)}</td>
                  <td className="px-4 py-3 text-sm text-blue-500">{fmt(totals.wcif)}</td>
                  <td className="px-4 py-3 text-sm text-blue-500">{fmt(totals.sdf)}</td>
                  <td className="px-4 py-3 text-sm text-blue-500">{fmt(totals.zimdef)}</td>
                  <td className="px-4 py-3 text-sm text-blue-500">{fmt(totals.necR)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
};

export default PayrollSummary;
