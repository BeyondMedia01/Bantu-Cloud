import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Download, Users, TrendingUp, TrendingDown,
  DollarSign, Banknote, ChevronDown, FileText, Eye, X,
} from 'lucide-react';
import { PayrollAPI, StatutoryExportAPI, BankFileAPI } from '../api/client';
import { useToast } from '../context/ToastContext';
import { Dropdown } from '../components/ui/dropdown';
import { RUN_STATUS_CLASS } from '../lib/payrollStatusColors';

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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) return;
    Promise.all([PayrollAPI.getById(runId), PayrollAPI.getPayslips(runId)])
      .then(([r, p]) => { setRun(r.data); setPayslips(p.data); })
      .catch(() => showToast('Failed to load payroll run', 'error'))
      .finally(() => setLoading(false));
  }, [runId]);

  const isDual = run?.dualCurrency;
  const ccy = run?.currency || 'USD';
  const xr: number = run?.exchangeRate ?? 1;

  const totals = useMemo(() => {
    if (!payslips.length) return null;
    const sum = (fn: (p: any) => number) => payslips.reduce((s, p) => s + (fn(p) ?? 0), 0);
    const grossUSD  = sum(p => p.grossUSD  ?? p.gross ?? 0);
    const grossZIG  = sum(p => p.grossZIG  ?? 0);
    const payeUSD   = sum(p => p.payeUSD   ?? p.paye  ?? 0);
    const payeZIG   = sum(p => p.payeZIG   ?? 0);
    const alUSD     = sum(p => p.aidsLevyUSD ?? p.aidsLevy ?? 0);
    const alZIG     = sum(p => p.aidsLevyZIG ?? 0);
    const nssaUSD   = sum(p => p.nssaUSD   ?? p.nssaEmployee ?? 0);
    const nssaZIG   = sum(p => p.nssaZIG   ?? 0);
    const netUSD    = sum(p => p.netPayUSD  ?? p.netPay ?? 0);
    const netZIG    = sum(p => p.netPayZIG  ?? 0);
    return {
      employees:  payslips.length,
      gross:      sum(p => p.gross ?? 0),
      grossUSD,   grossZIG,
      paye:       sum(p => p.paye ?? 0),
      payeUSD,    payeZIG,
      aidsLevy:   sum(p => p.aidsLevy ?? 0),
      alUSD,      alZIG,
      nssa:       sum(p => p.nssaEmployee ?? 0),
      nssaUSD,    nssaZIG,
      loans:      sum(p => p.loanDeductions ?? 0),
      net:        sum(p => p.netPay ?? 0),
      netUSD,     netZIG,
      nssaR:      sum(p => p.nssaEmployer ?? 0),
      wcif:       sum(p => p.wcifEmployer  ?? 0),
      sdf:        sum(p => p.sdfContribution ?? 0),
      zimdef:     sum(p => p.zimdefEmployer ?? 0),
      necR:       sum(p => p.necEmployer   ?? 0),
      // USD-equivalent totals (for consolidated reconciliation)
      totalDedUSD: payeUSD + alUSD + nssaUSD,
      totalDedZIG: payeZIG + alZIG + nssaZIG,
    };
  }, [payslips]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleExport = async (type: 'csv' | 'zimra' | 'nssa') => {
    if (!runId) return;
    setExporting(type);
    try {
      let res: any, filename: string;
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
      const contentType = res.headers?.['content-type'] || 'text/html';
      const url = URL.createObjectURL(new Blob([res.data], { type: contentType }));
      setPreviewUrl(url);
    } catch { showToast('Failed to generate Detailed Summary', 'error'); }
    finally { setExporting(''); }
  };

  const handlePayslipSummaryPreview = async () => {
    if (!runId) return;
    setExporting('summary-preview');
    try {
      const res = await PayrollAPI.downloadPayslipSummaryPdf(runId);
      // Backend returns HTML — use the actual content-type so the iframe renders it correctly
      const contentType = res.headers?.['content-type'] || 'text/html';
      const url = URL.createObjectURL(new Blob([res.data], { type: contentType }));
      setPreviewUrl(url);
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

  // ── Loading skeleton ─────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-9 h-9 rounded-xl bg-muted" />
        <div className="space-y-2">
          <div className="h-5 w-40 bg-muted rounded" />
          <div className="h-3 w-56 bg-muted rounded" />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="bg-primary border border-border rounded-2xl p-4 space-y-3">
            <div className="h-3 w-16 bg-muted rounded" />
            <div className="h-6 w-20 bg-muted rounded" />
          </div>
        ))}
      </div>
      <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto scroll-x-shadow">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-muted">
                {['Employee', 'Basic', 'Gross', 'PAYE', 'NSSA', 'AIDS Levy', 'Net Pay'].map(h => (
                  <th key={h} className="px-5 py-4 text-xs font-bold text-muted-foreground/50 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-muted shrink-0" />
                      <div className="space-y-2"><div className="h-3 w-24 bg-muted rounded" /><div className="h-2 w-14 bg-muted rounded" /></div>
                    </div>
                  </td>
                  {Array.from({ length: 6 }).map((_, ci) => (
                    <td key={ci} className="px-5 py-4"><div className="h-3 w-16 bg-muted rounded" /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // ── Derived helpers ──────────────────────────────────────────────────────────

  const fmtUSD = (n: number) => `$${fmt(n)}`;
  const fmtZIG = (n: number) => `Z ${fmt(n)}`;
  const usdEquiv = (usd: number, zig: number) => usd + (xr > 1 ? zig / xr : zig);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/payroll')} aria-label="Go back" className="p-2 hover:bg-muted rounded-xl transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold">Payroll Summary</h1>
          {run && (
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <p className="text-muted-foreground text-sm font-medium">
                {new Date(run.startDate).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
                {' – '}
                {new Date(run.endDate).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${RUN_STATUS_CLASS[run.status] || 'bg-muted text-foreground/80'}`}>
                {run.status}
              </span>
              {isDual ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-100 text-blue-700 border border-blue-200">
                  USD + ZiG &nbsp;·&nbsp; 1 USD = {Number(xr).toFixed(4)} ZiG
                </span>
              ) : (
                <span className="text-muted-foreground text-xs font-bold">{ccy}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Action buttons ── */}
      {run?.status === 'COMPLETED' && (
        <div className="flex items-center gap-2 flex-wrap">
          {!run.payrollCalendar?.isClosed && (
            <button
              onClick={async () => {
                setExporting('rerun');
                setRerunSuccess(false);
                try {
                  await PayrollAPI.process(runId!);
                  const [r, p] = await Promise.all([PayrollAPI.getById(runId!), PayrollAPI.getPayslips(runId!)]);
                  setRun(r.data); setPayslips(p.data);
                  setRerunSuccess(true);
                  showToast('Payroll rerun completed successfully!', 'success');
                } catch (err: any) {
                  showToast(err.message || 'Rerun failed', 'error');
                } finally { setExporting(''); }
              }}
              disabled={!!exporting}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-full text-sm font-bold hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            >
              <TrendingUp size={14} /> {exporting === 'rerun' ? 'Processing…' : 'Rerun Payroll'}
            </button>
          )}
          <button onClick={handlePayslipSummaryPreview} disabled={!!exporting}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-full text-sm font-bold hover:bg-red-100 disabled:opacity-50 transition-colors">
            <Eye size={14} /> {exporting === 'summary-preview' ? 'Loading…' : 'Preview Summary'}
          </button>
          <button onClick={handlePayslipSummaryDownload} disabled={!!exporting}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-full text-sm font-bold hover:bg-red-500 disabled:opacity-50 transition-colors">
            <FileText size={14} /> {exporting === 'summary-detailed' ? 'Generating…' : 'Payslip Summary'}
          </button>
          <button onClick={() => handleExport('csv')} disabled={!!exporting}
            className="flex items-center gap-1.5 px-4 py-2 border border-border rounded-full text-sm font-bold hover:bg-muted disabled:opacity-50 transition-colors">
            <Download size={14} /> {exporting === 'csv' ? 'Exporting…' : 'Export CSV'}
          </button>
          <button onClick={() => handleExport('zimra')} disabled={!!exporting}
            className="flex items-center gap-1.5 px-4 py-2 bg-purple-50 text-purple-700 border border-purple-100 rounded-full text-sm font-bold hover:bg-purple-100 disabled:opacity-50 transition-colors">
            <FileText size={14} /> ZIMRA PAYE
          </button>
          <button onClick={() => handleExport('nssa')} disabled={!!exporting}
            className="flex items-center gap-1.5 px-4 py-2 bg-orange-50 text-orange-700 border border-orange-100 rounded-full text-sm font-bold hover:bg-orange-100 disabled:opacity-50 transition-colors">
            <FileText size={14} /> NSSA
          </button>
          <Dropdown
            align="left"
            disabled={!!exporting}
            trigger={(isOpen) => (
              <button disabled={!!exporting}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full text-sm font-bold hover:bg-emerald-100 disabled:opacity-50 transition-colors">
                <Banknote size={14} /> Bank <ChevronDown size={12} className={isOpen ? 'rotate-180' : ''} />
              </button>
            )}
            sections={[{
              items: (['cbz', 'stanbic', 'fidelity'] as const).map(f => ({ label: f, onClick: () => handleBankExport(f) })),
            }]}
          />
        </div>
      )}

      {/* ── Rerun success banner ── */}
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

      {/* ── Summary cards ── */}
      {totals && (
        <>
          {/* Row 1 — headcount + gross + net */}
          <div className={`grid gap-3 ${isDual ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6'}`}>
            {[
              { label: 'Employees',     value: String(totals.employees), icon: Users,        color: 'text-foreground/80', bg: 'bg-muted' },
              { label: isDual ? 'Gross (USD)' : 'Total Gross',
                value: isDual ? fmtUSD(totals.grossUSD) : `${ccy} ${fmt(totals.gross)}`,
                icon: TrendingUp, color: 'text-emerald-700', bg: 'bg-emerald-50' },
              ...(isDual ? [{ label: 'Gross (ZiG)', value: fmtZIG(totals.grossZIG), icon: TrendingUp, color: 'text-blue-700', bg: 'bg-blue-50' }] : []),
              { label: isDual ? 'Net Pay (USD)' : 'Total Net Pay',
                value: isDual ? fmtUSD(totals.netUSD) : `${ccy} ${fmt(totals.net)}`,
                icon: DollarSign, color: 'text-accent-green', bg: 'bg-emerald-50' },
              ...(isDual ? [{ label: 'Net Pay (ZiG)', value: fmtZIG(totals.netZIG), icon: DollarSign, color: 'text-blue-700', bg: 'bg-blue-50' }] : []),
              ...(!isDual ? [
                { label: 'Total PAYE',  value: `${ccy} ${fmt(totals.paye)}`,  icon: TrendingDown, color: 'text-red-600',    bg: 'bg-red-50'    },
                { label: 'Total NSSA',  value: `${ccy} ${fmt(totals.nssa)}`,  icon: TrendingDown, color: 'text-orange-600', bg: 'bg-orange-50' },
              ] : []),
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className="bg-primary border border-border rounded-2xl p-4 shadow-sm">
                <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mb-2`}>
                  <Icon size={15} className={color} />
                </div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-0.5">{label}</p>
                <p className="text-lg font-bold text-navy leading-tight">{value}</p>
              </div>
            ))}
          </div>

          {/* Row 2 — deduction cards (dual mode only) */}
          {isDual && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {[
                { label: 'PAYE (USD)',      value: fmtUSD(totals.payeUSD),  color: 'text-red-600',    bg: 'bg-red-50'    },
                { label: 'PAYE (ZiG)',      value: fmtZIG(totals.payeZIG),  color: 'text-red-400',    bg: 'bg-red-50'    },
                { label: 'AIDS Levy (USD)', value: fmtUSD(totals.alUSD),    color: 'text-rose-600',   bg: 'bg-rose-50'   },
                { label: 'AIDS Levy (ZiG)', value: fmtZIG(totals.alZIG),    color: 'text-rose-400',   bg: 'bg-rose-50'   },
                { label: 'NSSA (USD)',      value: fmtUSD(totals.nssaUSD),  color: 'text-orange-600', bg: 'bg-orange-50' },
              ].map(({ label, value, color, bg }) => (
                <div key={label} className="bg-primary border border-border rounded-2xl p-4 shadow-sm">
                  <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mb-2`}>
                    <TrendingDown size={15} className={color} />
                  </div>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-0.5">{label}</p>
                  <p className="text-lg font-bold text-navy leading-tight">{value}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Multi-currency breakdown panel (dual only) ── */}
      {isDual && totals && (
        <div className="bg-primary border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Currency Breakdown</h2>
            <span className="text-xs font-bold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-1 rounded-full">
              1 USD = {Number(xr).toFixed(4)} ZiG
            </span>
          </div>
          <div className="overflow-x-auto scroll-x-shadow">
            <table className="w-full text-left min-w-[480px]">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="px-6 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider w-48">Item</th>
                  <th className="px-6 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider text-right">USD</th>
                  <th className="px-6 py-3 text-xs font-bold text-blue-600 uppercase tracking-wider text-right">ZiG</th>
                  <th className="px-6 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider text-right">USD Equiv</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  { label: 'Gross Pay',          usd: totals.grossUSD, zig: totals.grossZIG, bold: true,  green: true  },
                  { label: 'PAYE',               usd: totals.payeUSD,  zig: totals.payeZIG,  bold: false, red: true    },
                  { label: 'AIDS Levy',           usd: totals.alUSD,    zig: totals.alZIG,    bold: false, red: true    },
                  { label: 'NSSA (Employee)',     usd: totals.nssaUSD,  zig: totals.nssaZIG,  bold: false, red: true    },
                  { label: 'Total Deductions',   usd: totals.totalDedUSD, zig: totals.totalDedZIG, bold: true, red: true },
                  { label: 'Net Pay',            usd: totals.netUSD,   zig: totals.netZIG,   bold: true,  green: true  },
                ].map(({ label, usd, zig, bold, red, green }) => {
                  const equiv = usdEquiv(usd, zig);
                  const cls = bold ? 'font-bold' : 'font-medium';
                  const valCls = red ? 'text-red-500' : green ? 'text-emerald-600' : 'text-foreground';
                  return (
                    <tr key={label} className={bold ? 'bg-muted/40' : 'hover:bg-muted/20 transition-colors'}>
                      <td className={`px-6 py-3 text-sm ${cls} text-foreground`}>{label}</td>
                      <td className={`px-6 py-3 text-sm ${cls} ${valCls} text-right tabular-nums`}>{fmt(usd)}</td>
                      <td className={`px-6 py-3 text-sm ${cls} text-blue-600 text-right tabular-nums`}>{fmt(zig)}</td>
                      <td className={`px-6 py-3 text-sm ${cls} ${valCls} text-right tabular-nums`}>{fmt(equiv)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Employee detail table ── */}
      {payslips.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground bg-primary border border-border rounded-2xl">
          <p className="font-medium">No payslips found for this run.</p>
        </div>
      ) : (
        <div className="bg-primary border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Employee Breakdown</h2>
          </div>
          <div className="overflow-x-auto scroll-x-shadow">
            <table className="w-full text-left min-w-max">
              <thead>
                <tr className="border-b border-border bg-muted">
                  {[
                    'Employee', 'Position',
                    isDual ? 'Basic (USD)' : 'Basic',
                    isDual ? 'Gross (USD)' : 'Gross Pay',
                    ...(isDual ? ['Gross (ZiG)'] : []),
                    isDual ? 'PAYE (USD)' : 'PAYE',
                    ...(isDual ? ['PAYE (ZiG)'] : []),
                    isDual ? 'AIDS Levy (USD)' : 'AIDS Levy',
                    ...(isDual ? ['AIDS Levy (ZiG)'] : []),
                    isDual ? 'NSSA (USD)' : 'NSSA',
                    ...(isDual ? ['NSSA (ZiG)'] : []),
                    ...(totals && totals.loans > 0 ? ['Loans'] : []),
                    isDual ? 'Net Pay (USD)' : 'Net Pay',
                    ...(isDual ? ['Net Pay (ZiG)'] : []),
                    'NSSA Empr', 'WCIF', 'SDF', 'ZIMDEF', 'NEC Empr',
                  ].map(h => (
                    <th key={h} className="px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payslips.map((p: any) => {
                  const grossUSD  = p.grossUSD  ?? p.gross  ?? 0;
                  const netUSD    = p.netPayUSD ?? p.netPay ?? 0;
                  const payeUSD   = p.payeUSD   ?? p.paye   ?? 0;
                  const payeZIG   = p.payeZIG   ?? 0;
                  const alUSD     = p.aidsLevyUSD ?? p.aidsLevy ?? 0;
                  const alZIG     = p.aidsLevyZIG ?? 0;
                  const nssaUSD   = p.nssaUSD   ?? p.nssaEmployee ?? 0;
                  const nssaZIG   = p.nssaZIG   ?? 0;
                  const showLoans = totals && totals.loans > 0;

                  return (
                    <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-bold text-sm">{p.employee?.firstName} {p.employee?.lastName}</p>
                        <p className="text-[11px] text-muted-foreground">{p.employee?.employeeCode}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground/80">{p.employee?.position || '—'}</td>
                      <td className="px-4 py-3 text-sm font-bold tabular-nums">{fmt(p.basicSalary ?? p.employee?.baseRate)}</td>
                      <td className="px-4 py-3 text-sm font-bold tabular-nums">{fmt(isDual ? grossUSD : p.gross)}</td>
                      {isDual && <td className="px-4 py-3 text-sm font-bold text-blue-600 tabular-nums">{fmt(p.grossZIG)}</td>}
                      <td className="px-4 py-3 text-sm text-red-500 font-medium tabular-nums">{fmt(isDual ? payeUSD : p.paye)}</td>
                      {isDual && <td className="px-4 py-3 text-sm text-red-400 font-medium tabular-nums">{fmt(payeZIG)}</td>}
                      <td className="px-4 py-3 text-sm text-red-500 font-medium tabular-nums">{fmt(isDual ? alUSD : p.aidsLevy)}</td>
                      {isDual && <td className="px-4 py-3 text-sm text-red-400 font-medium tabular-nums">{fmt(alZIG)}</td>}
                      <td className="px-4 py-3 text-sm text-red-500 font-medium tabular-nums">{fmt(isDual ? nssaUSD : p.nssaEmployee)}</td>
                      {isDual && <td className="px-4 py-3 text-sm text-red-400 font-medium tabular-nums">{fmt(nssaZIG)}</td>}
                      {showLoans && <td className="px-4 py-3 text-sm text-red-500 font-medium tabular-nums">{fmt(p.loanDeductions)}</td>}
                      <td className="px-4 py-3 text-sm font-bold text-emerald-600 tabular-nums">{fmt(isDual ? netUSD : p.netPay)}</td>
                      {isDual && <td className="px-4 py-3 text-sm font-bold text-blue-600 tabular-nums">{fmt(p.netPayZIG)}</td>}
                      <td className="px-4 py-3 text-sm text-blue-500 font-medium tabular-nums">{fmt(p.nssaEmployer)}</td>
                      <td className="px-4 py-3 text-sm text-blue-500 font-medium tabular-nums">{fmt(p.wcifEmployer)}</td>
                      <td className="px-4 py-3 text-sm text-blue-500 font-medium tabular-nums">{fmt(p.sdfContribution)}</td>
                      <td className="px-4 py-3 text-sm text-blue-500 font-medium tabular-nums">{fmt(p.zimdefEmployer)}</td>
                      <td className="px-4 py-3 text-sm text-blue-500 font-medium tabular-nums">{fmt(p.necEmployer)}</td>
                    </tr>
                  );
                })}
              </tbody>

              {/* ── Totals row ── */}
              {totals && (
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted font-bold">
                    <td className="px-4 py-3 text-sm" colSpan={2}>Totals</td>
                    <td className="px-4 py-3 text-sm tabular-nums">—</td>
                    <td className="px-4 py-3 text-sm tabular-nums">{fmt(isDual ? totals.grossUSD : totals.gross)}</td>
                    {isDual && <td className="px-4 py-3 text-sm text-blue-600 tabular-nums">{fmt(totals.grossZIG)}</td>}
                    <td className="px-4 py-3 text-sm text-red-500 tabular-nums">{fmt(isDual ? totals.payeUSD : totals.paye)}</td>
                    {isDual && <td className="px-4 py-3 text-sm text-red-400 tabular-nums">{fmt(totals.payeZIG)}</td>}
                    <td className="px-4 py-3 text-sm text-red-500 tabular-nums">{fmt(isDual ? totals.alUSD : totals.aidsLevy)}</td>
                    {isDual && <td className="px-4 py-3 text-sm text-red-400 tabular-nums">{fmt(totals.alZIG)}</td>}
                    <td className="px-4 py-3 text-sm text-red-500 tabular-nums">{fmt(isDual ? totals.nssaUSD : totals.nssa)}</td>
                    {isDual && <td className="px-4 py-3 text-sm text-red-400 tabular-nums">{fmt(totals.nssaZIG)}</td>}
                    {totals.loans > 0 && <td className="px-4 py-3 text-sm text-red-500 tabular-nums">{fmt(totals.loans)}</td>}
                    <td className="px-4 py-3 text-sm text-emerald-600 tabular-nums">{fmt(isDual ? totals.netUSD : totals.net)}</td>
                    {isDual && <td className="px-4 py-3 text-sm text-blue-600 tabular-nums">{fmt(totals.netZIG)}</td>}
                    <td className="px-4 py-3 text-sm text-blue-500 tabular-nums">{fmt(totals.nssaR)}</td>
                    <td className="px-4 py-3 text-sm text-blue-500 tabular-nums">{fmt(totals.wcif)}</td>
                    <td className="px-4 py-3 text-sm text-blue-500 tabular-nums">{fmt(totals.sdf)}</td>
                    <td className="px-4 py-3 text-sm text-blue-500 tabular-nums">{fmt(totals.zimdef)}</td>
                    <td className="px-4 py-3 text-sm text-blue-500 tabular-nums">{fmt(totals.necR)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
      {/* ── PDF preview modal ── */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }}
        >
          <div
            className="relative bg-card rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            style={{ width: '90vw', maxWidth: 900, height: '90vh' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 bg-navy text-white shrink-0">
              <span className="font-bold text-sm truncate">Payroll Summary Preview</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { const win = window.open(previewUrl, '_blank'); win?.addEventListener('load', () => win.print()); }}
                  className="flex items-center gap-1.5 bg-white/10 text-white px-3 py-1.5 rounded-full text-xs font-bold hover:bg-white/20"
                >
                  <FileText size={13} /> Save as PDF
                </button>
                <button onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }} className="p-1.5 rounded-full hover:bg-white/10">
                  <X size={18} />
                </button>
              </div>
            </div>
            <iframe src={previewUrl} className="flex-1 w-full border-0" title="Payroll Summary PDF" />
          </div>
        </div>
      )}
    </div>
  );
};

export default PayrollSummary;
