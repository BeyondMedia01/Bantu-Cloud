import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Download, Users, TrendingUp, TrendingDown,
  DollarSign, Banknote, ChevronDown, FileText, Eye, X,
} from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { PayrollAPI, StatutoryExportAPI, BankFileAPI } from '../api/client';
import { useToast } from '../context/ToastContext';
import { Dropdown } from '../components/ui/dropdown';
import { StatusBadge } from '@/components/common/StatusBadge';
import { DataTable } from '@/components/ui/data-table';

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

  // ── Payslip columns ──────────────────────────────────────────────────────────
  // Must be declared BEFORE any early return to satisfy the Rules of Hooks.

  const payslipColumns = useMemo<ColumnDef<any, any>[]>(() => {
    const numCell = (val: number, className?: string) => (
      <span className={`tabular-num ${className ?? ''}`}>{fmt(val)}</span>
    );

    return [
      {
        id: 'employee',
        header: 'Employee',
        size: 200,
        enableSorting: true,
        accessorFn: (p) => `${p.employee?.firstName} ${p.employee?.lastName}`,
        cell: ({ row }) => {
          const p = row.original;
          return (
            <div className="min-w-0">
              <p className="font-semibold text-sm text-foreground truncate">
                {p.employee?.firstName} {p.employee?.lastName}
              </p>
              <p className="text-xs text-muted-foreground font-mono-financial">{p.employee?.employeeCode}</p>
            </div>
          );
        },
      },
      {
        id: 'position',
        header: 'Position',
        size: 140,
        enableSorting: true,
        accessorFn: (p) => p.employee?.position ?? '',
        cell: ({ getValue }) => <span className="text-foreground/70">{getValue() || '—'}</span>,
      },
      {
        id: 'basic',
        header: isDual ? 'Basic (USD)' : 'Basic',
        size: 110,
        enableSorting: true,
        accessorFn: (p) => p.basicSalary ?? p.employee?.baseRate ?? 0,
        cell: ({ getValue }) => numCell(getValue()),
      },
      {
        id: 'gross',
        header: isDual ? 'Gross (USD)' : 'Gross Pay',
        size: 120,
        enableSorting: true,
        accessorFn: (p) => isDual ? (p.grossUSD ?? p.gross ?? 0) : (p.gross ?? 0),
        cell: ({ getValue }) => numCell(getValue(), 'font-semibold'),
      },
      ...(isDual ? [{
        id: 'grossZIG',
        header: 'Gross (ZiG)',
        size: 120,
        enableSorting: true,
        accessorFn: (p: any) => p.grossZIG ?? 0,
        cell: ({ getValue }: any) => numCell(getValue(), 'currency-zig font-semibold'),
      }] : []),
      {
        id: 'paye',
        header: isDual ? 'PAYE (USD)' : 'PAYE',
        size: 110,
        enableSorting: true,
        accessorFn: (p) => isDual ? (p.payeUSD ?? p.paye ?? 0) : (p.paye ?? 0),
        cell: ({ getValue }) => numCell(getValue(), 'text-destructive'),
      },
      ...(isDual ? [{
        id: 'payeZIG',
        header: 'PAYE (ZiG)',
        size: 110,
        enableSorting: true,
        accessorFn: (p: any) => p.payeZIG ?? 0,
        cell: ({ getValue }: any) => numCell(getValue(), 'currency-zig opacity-80'),
      }] : []),
      {
        id: 'aidsLevy',
        header: isDual ? 'AIDS Levy (USD)' : 'AIDS Levy',
        size: 130,
        enableSorting: true,
        accessorFn: (p) => isDual ? (p.aidsLevyUSD ?? p.aidsLevy ?? 0) : (p.aidsLevy ?? 0),
        cell: ({ getValue }) => numCell(getValue(), 'text-destructive'),
      },
      ...(isDual ? [{
        id: 'alZIG',
        header: 'AIDS Levy (ZiG)',
        size: 130,
        enableSorting: true,
        accessorFn: (p: any) => p.aidsLevyZIG ?? 0,
        cell: ({ getValue }: any) => numCell(getValue(), 'currency-zig opacity-80'),
      }] : []),
      {
        id: 'nssa',
        header: isDual ? 'NSSA (USD)' : 'NSSA',
        size: 110,
        enableSorting: true,
        accessorFn: (p) => isDual ? (p.nssaUSD ?? p.nssaEmployee ?? 0) : (p.nssaEmployee ?? 0),
        cell: ({ getValue }) => numCell(getValue(), 'text-destructive'),
      },
      ...(isDual ? [{
        id: 'nssaZIG',
        header: 'NSSA (ZiG)',
        size: 110,
        enableSorting: true,
        accessorFn: (p: any) => p.nssaZIG ?? 0,
        cell: ({ getValue }: any) => numCell(getValue(), 'currency-zig opacity-80'),
      }] : []),
      ...(totals && totals.loans > 0 ? [{
        id: 'loans',
        header: 'Loans',
        size: 100,
        enableSorting: true,
        accessorFn: (p: any) => p.loanDeductions ?? 0,
        cell: ({ getValue }: any) => numCell(getValue(), 'text-destructive'),
      }] : []),
      {
        id: 'net',
        header: isDual ? 'Net Pay (USD)' : 'Net Pay',
        size: 120,
        enableSorting: true,
        accessorFn: (p) => isDual ? (p.netPayUSD ?? p.netPay ?? 0) : (p.netPay ?? 0),
        cell: ({ getValue }) => numCell(getValue(), 'text-success font-bold'),
      },
      ...(isDual ? [{
        id: 'netZIG',
        header: 'Net Pay (ZiG)',
        size: 120,
        enableSorting: true,
        accessorFn: (p: any) => p.netPayZIG ?? 0,
        cell: ({ getValue }: any) => numCell(getValue(), 'currency-zig font-bold'),
      }] : []),
      {
        id: 'nssaEmpr',
        header: 'NSSA Empr',
        size: 100,
        enableSorting: true,
        accessorFn: (p) => p.nssaEmployer ?? 0,
        cell: ({ getValue }) => numCell(getValue(), 'currency-usd opacity-70'),
      },
      {
        id: 'wcif',
        header: 'WCIF',
        size: 90,
        enableSorting: true,
        accessorFn: (p) => p.wcifEmployer ?? 0,
        cell: ({ getValue }) => numCell(getValue(), 'currency-usd opacity-70'),
      },
      {
        id: 'sdf',
        header: 'SDF',
        size: 90,
        enableSorting: true,
        accessorFn: (p) => p.sdfContribution ?? 0,
        cell: ({ getValue }) => numCell(getValue(), 'currency-usd opacity-70'),
      },
      {
        id: 'zimdef',
        header: 'ZIMDEF',
        size: 90,
        enableSorting: true,
        accessorFn: (p) => p.zimdefEmployer ?? 0,
        cell: ({ getValue }) => numCell(getValue(), 'currency-usd opacity-70'),
      },
      {
        id: 'necEmpr',
        header: 'NEC Empr',
        size: 90,
        enableSorting: true,
        accessorFn: (p) => p.necEmployer ?? 0,
        cell: ({ getValue }) => numCell(getValue(), 'currency-usd opacity-70'),
      },
    ];
  }, [isDual, totals]);

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
    <div className="flex flex-col gap-4">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/payroll')} aria-label="Go back" className="p-2 hover:bg-muted rounded-xl transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold">Payroll Run</h1>
          {run && (
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <p className="text-muted-foreground text-sm">
                {new Date(run.startDate).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
                {' – '}
                {new Date(run.endDate).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              <StatusBadge status={run.status} context="payroll_run" />
              {isDual ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase currency-usd-badge border border-transparent">
                  USD + ZiG &nbsp;·&nbsp; 1 USD = {Number(xr).toFixed(4)} ZiG
                </span>
              ) : (
                <span className="text-muted-foreground text-xs font-semibold tabular-num">{ccy}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Rerun success banner ── */}
      {rerunSuccess && (
        <div className="flex items-center gap-3 p-4 bg-success-bg border border-success-border rounded-2xl">
          <div className="w-8 h-8 bg-success/20 rounded-full flex items-center justify-center shrink-0">
            <TrendingUp size={16} className="text-success" />
          </div>
          <div>
            <p className="font-semibold text-sm text-foreground">Payroll Rerun Complete</p>
            <p className="text-xs text-muted-foreground">All payslips have been recalculated with the latest figures.</p>
          </div>
          <button onClick={() => setRerunSuccess(false)} className="ml-auto text-muted-foreground hover:text-foreground p-1">
            <X size={16} />
          </button>
        </div>
      )}

      {/* ── Two-column layout: sticky summary + scrollable employee table ── */}
      <div className="flex gap-5 items-start">

        {/* ── LEFT: Sticky summary panel ── */}
        <div className="hidden lg:flex flex-col gap-4 w-64 shrink-0 sticky top-4">

          {/* Run totals */}
          {totals ? (
            <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <p className="sidebar-group-label !text-muted-foreground">Run Totals</p>
              </div>
              <div className="flex flex-col divide-y divide-border">
                <SummaryRow icon={<Users size={14} />} label="Employees" value={String(totals.employees)} />
                <SummaryRow
                  icon={<TrendingUp size={14} />}
                  label={isDual ? 'Gross (USD)' : 'Gross Pay'}
                  value={isDual ? fmtUSD(totals.grossUSD) : `${ccy} ${fmt(totals.gross)}`}
                  valueClass="text-success"
                />
                {isDual && (
                  <SummaryRow icon={<TrendingUp size={14} />} label="Gross (ZiG)" value={fmtZIG(totals.grossZIG)} valueClass="currency-zig" />
                )}
                <SummaryRow
                  icon={<TrendingDown size={14} />}
                  label={isDual ? 'PAYE (USD)' : 'PAYE'}
                  value={isDual ? fmtUSD(totals.payeUSD) : `${ccy} ${fmt(totals.paye)}`}
                  valueClass="text-destructive"
                />
                <SummaryRow
                  icon={<TrendingDown size={14} />}
                  label={isDual ? 'NSSA (USD)' : 'NSSA'}
                  value={isDual ? fmtUSD(totals.nssaUSD) : `${ccy} ${fmt(totals.nssa)}`}
                  valueClass="text-destructive"
                />
                <SummaryRow
                  icon={<DollarSign size={14} />}
                  label={isDual ? 'Net Pay (USD)' : 'Net Pay'}
                  value={isDual ? fmtUSD(totals.netUSD) : `${ccy} ${fmt(totals.net)}`}
                  valueClass="text-success font-bold"
                  large
                />
                {isDual && (
                  <SummaryRow icon={<DollarSign size={14} />} label="Net Pay (ZiG)" value={fmtZIG(totals.netZIG)} valueClass="currency-zig font-bold" large />
                )}
              </div>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-2xl h-48 animate-pulse" />
          )}

          {/* Action buttons — inside summary panel for proximity to totals */}
          {run?.status === 'COMPLETED' && (
            <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <p className="sidebar-group-label !text-muted-foreground">Exports</p>
              </div>
              <div className="flex flex-col gap-1 p-2">
                {!run.payrollCalendar?.isClosed && (
                  <ActionButton
                    label={exporting === 'rerun' ? 'Processing…' : 'Rerun Payroll'}
                    icon={<TrendingUp size={13} />}
                    onClick={async () => {
                      setExporting('rerun'); setRerunSuccess(false);
                      try {
                        await PayrollAPI.process(runId!);
                        const [r, p] = await Promise.all([PayrollAPI.getById(runId!), PayrollAPI.getPayslips(runId!)]);
                        setRun(r.data); setPayslips(p.data);
                        setRerunSuccess(true);
                        showToast('Payroll rerun completed!', 'success');
                      } catch (e: any) { showToast(e.message || 'Rerun failed', 'error'); }
                      finally { setExporting(''); }
                    }}
                    disabled={!!exporting}
                    className="bg-info text-white hover:bg-info/90"
                  />
                )}
                <ActionButton label={exporting === 'summary-preview' ? 'Loading…' : 'Preview Summary'} icon={<Eye size={13} />} onClick={handlePayslipSummaryPreview} disabled={!!exporting} />
                <ActionButton label={exporting === 'summary-detailed' ? 'Generating…' : 'Payslip Summary PDF'} icon={<FileText size={13} />} onClick={handlePayslipSummaryDownload} disabled={!!exporting} />
                <ActionButton label={exporting === 'csv' ? 'Exporting…' : 'Export CSV'} icon={<Download size={13} />} onClick={() => handleExport('csv')} disabled={!!exporting} />
                <ActionButton label="ZIMRA PAYE" icon={<FileText size={13} />} onClick={() => handleExport('zimra')} disabled={!!exporting} />
                <ActionButton label="NSSA P4A" icon={<FileText size={13} />} onClick={() => handleExport('nssa')} disabled={!!exporting} />
                <Dropdown
                  align="right"
                  disabled={!!exporting}
                  trigger={(isOpen) => (
                    <button disabled={!!exporting}
                      className="w-full flex items-center justify-between gap-1.5 px-3 py-2 text-xs font-medium rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
                      <span className="flex items-center gap-1.5"><Banknote size={13} /> Bank EFT</span>
                      <ChevronDown size={11} className={isOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
                    </button>
                  )}
                  sections={[{
                    items: (['cbz', 'stanbic', 'fidelity'] as const).map(f => ({ label: f.toUpperCase(), onClick: () => handleBankExport(f) })),
                  }]}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: Employee breakdown table ── */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">

          {/* Mobile action bar (only visible < lg) */}
          {run?.status === 'COMPLETED' && (
            <div className="flex lg:hidden items-center gap-2 flex-wrap">
              <button onClick={handlePayslipSummaryPreview} disabled={!!exporting}
                className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-xs font-medium hover:bg-muted disabled:opacity-50 transition-colors">
                <Eye size={13} /> Preview
              </button>
              <button onClick={() => handleExport('csv')} disabled={!!exporting}
                className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-xs font-medium hover:bg-muted disabled:opacity-50 transition-colors">
                <Download size={13} /> CSV
              </button>
            </div>
          )}

          {/* Employee table */}
          {payslips.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground bg-card border border-border rounded-2xl">
              <p className="font-medium">No payslips found for this run.</p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Employee Breakdown</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{payslips.length} employees</p>
                </div>
              </div>
              <DataTable
                data={payslips}
                columns={payslipColumns}
                frozenColumns={1}
                virtual={payslips.length > 50}
                maxHeight={560}
                showDensityToggle
              />
              {/* Totals footer */}
              {totals && (
                <div className="border-t-2 border-border bg-muted/50 px-5 py-3 flex items-center gap-6 flex-wrap text-xs font-semibold">
                  <span className="text-muted-foreground uppercase tracking-wider">Totals</span>
                  <span className="tabular-num text-success">
                    Gross: {isDual ? fmtUSD(totals.grossUSD) : `${ccy} ${fmt(totals.gross)}`}
                  </span>
                  {isDual && <span className="tabular-num currency-zig">Gross ZiG: {fmtZIG(totals.grossZIG)}</span>}
                  <span className="tabular-num text-destructive">PAYE: {isDual ? fmtUSD(totals.payeUSD) : `${ccy} ${fmt(totals.paye)}`}</span>
                  <span className="tabular-num text-success font-bold">
                    Net: {isDual ? fmtUSD(totals.netUSD) : `${ccy} ${fmt(totals.net)}`}
                  </span>
                  {isDual && <span className="tabular-num currency-zig font-bold">Net ZiG: {fmtZIG(totals.netZIG)}</span>}
                </div>
              )}
            </div>
          )}

          {/* Multi-currency breakdown (dual only) */}
          {isDual && totals && (
            <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
                <h2 className="text-sm font-semibold">Currency Breakdown</h2>
                <span className="text-xs font-semibold currency-usd-badge px-2 py-1 rounded-full">
                  1 USD = {Number(xr).toFixed(4)} ZiG
                </span>
              </div>
              <div className="overflow-x-auto scroll-x-shadow">
                <table className="w-full text-left min-w-[480px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/60">
                      <th className="px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-44">Item</th>
                      <th className="px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">USD</th>
                      <th className="px-5 py-3 text-xs font-semibold currency-zig uppercase tracking-wider text-right">ZiG</th>
                      <th className="px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">USD Equiv</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {[
                      { label: 'Gross Pay',        usd: totals.grossUSD,    zig: totals.grossZIG,    bold: true,  positive: true  },
                      { label: 'PAYE',             usd: totals.payeUSD,     zig: totals.payeZIG,     bold: false, negative: true  },
                      { label: 'AIDS Levy',         usd: totals.alUSD,       zig: totals.alZIG,       bold: false, negative: true  },
                      { label: 'NSSA (Employee)',   usd: totals.nssaUSD,     zig: totals.nssaZIG,     bold: false, negative: true  },
                      { label: 'Total Deductions', usd: totals.totalDedUSD, zig: totals.totalDedZIG, bold: true,  negative: true  },
                      { label: 'Net Pay',          usd: totals.netUSD,      zig: totals.netZIG,      bold: true,  positive: true  },
                    ].map(({ label, usd, zig, bold, positive, negative }) => {
                      const equiv = usdEquiv(usd, zig);
                      return (
                        <tr key={label} className={bold ? 'bg-muted/40 font-semibold' : 'hover:bg-muted/20 transition-colors'}>
                          <td className="px-5 py-3 text-sm text-foreground">{label}</td>
                          <td className={`px-5 py-3 text-sm text-right tabular-num ${positive ? 'text-success' : negative ? 'text-destructive' : 'text-foreground'}`}>{fmt(usd)}</td>
                          <td className={`px-5 py-3 text-sm text-right tabular-num currency-zig ${bold ? '' : 'opacity-80'}`}>{fmt(zig)}</td>
                          <td className={`px-5 py-3 text-sm text-right tabular-num ${positive ? 'text-success' : negative ? 'text-destructive' : 'text-foreground'}`}>{fmt(equiv)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

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
              <span className="font-semibold text-sm truncate">Payroll Summary Preview</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { const win = window.open(previewUrl, '_blank'); win?.addEventListener('load', () => win.print()); }}
                  className="flex items-center gap-1.5 bg-white/10 text-white px-3 py-1.5 rounded-full text-xs font-semibold hover:bg-white/20"
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

// ── Small reusable layout components ─────────────────────────────────────────

function SummaryRow({
  icon, label, value, valueClass, large,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
  large?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 gap-2">
      <div className="flex items-center gap-2 text-muted-foreground min-w-0">
        <span className="shrink-0">{icon}</span>
        <span className="text-xs truncate">{label}</span>
      </div>
      <span className={`tabular-num text-right shrink-0 ${large ? 'text-base font-bold' : 'text-sm font-medium'} ${valueClass ?? 'text-foreground'}`}>
        {value}
      </span>
    </div>
  );
}

function ActionButton({
  label, icon, onClick, disabled, className,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 ${className ?? ''}`}
    >
      <span className="shrink-0">{icon}</span>
      {label}
    </button>
  );
}

export default PayrollSummary;
