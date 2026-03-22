import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, FileText, Send, Loader2, CheckCircle2 } from 'lucide-react';
import SkeletonTable from '../components/common/SkeletonTable';
import { PayrollAPI } from '../api/client';
import { useToast } from '../context/ToastContext';

const fmt = (n: number | null | undefined, decimals = 2) =>
  n != null ? n.toFixed(decimals) : '—';

const Payslips: React.FC = () => {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [run, setRun] = useState<any>(null);
  const [payslips, setPayslips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [sendingAll, setSendingAll] = useState(false);
  const [confirmSendAll, setConfirmSendAll] = useState(false);

  useEffect(() => {
    if (!runId) return;
    Promise.all([PayrollAPI.getById(runId), PayrollAPI.getPayslips(runId)])
      .then(([r, p]) => { setRun(r.data); setPayslips(p.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [runId]);

  // Derive all unique earning TC codes used across all payslips (maintains insertion order)
  const allEarningTCs = useMemo(() => {
    const seen = new Map<string, { code: string; name: string }>();
    for (const p of payslips) {
      for (const e of (p.earningLines || [])) {
        if (!seen.has(e.tcId)) seen.set(e.tcId, { code: e.code, name: e.name });
      }
    }
    return [...seen.entries()].map(([tcId, meta]) => ({ tcId, ...meta }));
  }, [payslips]);

  // Derive all unique post-tax deduction TC codes
  const allDeductionTCs = useMemo(() => {
    const seen = new Map<string, { code: string; name: string }>();
    for (const p of payslips) {
      for (const d of (p.deductionLines || [])) {
        if (!seen.has(d.tcId)) seen.set(d.tcId, { code: d.code, name: d.name });
      }
    }
    return [...seen.entries()].map(([tcId, meta]) => ({ tcId, ...meta }));
  }, [payslips]);

  const handlePdf = async (payslipId: string, lastName: string, firstName: string) => {
    if (!runId) return;
    try {
      const res = await PayrollAPI.downloadPayslipPdf(runId, payslipId);
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `payslip-${lastName}-${firstName}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {}
  };

  const handleExport = async () => {
    if (!runId) return;
    try {
      const res = await PayrollAPI.exportCsv(runId);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `payroll-${runId}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {}
  };

  const handleSend = async (payslipId: string) => {
    if (!runId) return;
    setSendingIds((prev) => new Set(prev).add(payslipId));
    try {
      const res = await PayrollAPI.sendPayslip(runId, payslipId);
      setSentIds((prev) => new Set(prev).add(payslipId));
      showToast(`Payslip sent to ${res.data.to}`, 'success');
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to send payslip';
      showToast(msg, 'error');
    } finally {
      setSendingIds((prev) => { const s = new Set(prev); s.delete(payslipId); return s; });
    }
  };

  const handleSendAll = async () => {
    if (!runId) return;
    setSendingAll(true);
    setConfirmSendAll(false);
    try {
      const res = await PayrollAPI.sendAllPayslips(runId);
      const { sent, skipped, failed } = res.data;
      const parts = [`${sent} sent`];
      if (skipped > 0) parts.push(`${skipped} skipped (no email)`);
      if (failed > 0) parts.push(`${failed} failed`);
      showToast(parts.join(' · '), failed > 0 ? 'warning' : 'success');
    } catch {
      showToast('Failed to send payslips', 'error');
    } finally {
      setSendingAll(false);
    }
  };

  if (loading) return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4 animate-pulse">
        <div className="w-9 h-9 rounded-xl bg-slate-100" />
        <div className="space-y-2">
          <div className="h-4 w-24 bg-slate-100 rounded" />
          <div className="h-3 w-48 bg-slate-50 rounded" />
        </div>
      </div>
      <SkeletonTable headers={['Employee', 'Basic', 'Gross', 'PAYE', 'NSSA', 'Net Pay', '']} />
    </div>
  );

  const isDual = run?.dualCurrency;
  const ccy = run?.currency || 'USD';

  const thCls = 'px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap';

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/payroll')} className="p-2 hover:bg-slate-100 rounded-xl">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold">Payslips</h1>
            {run && (
              <p className="text-slate-500 font-medium text-sm">
                {new Date(run.startDate).toLocaleDateString()} – {new Date(run.endDate).toLocaleDateString()}
                {' · '}
                {isDual ? (
                  <span className="font-bold text-blue-600">USD + ZiG (Dual Currency)</span>
                ) : ccy}
                {' · '}{run.status}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {confirmSendAll ? (
            <>
              <span className="text-sm font-medium text-slate-500">Send to {payslips.length} employees?</span>
              <button onClick={handleSendAll} className="flex items-center gap-1.5 px-4 py-2 bg-accent-blue text-white rounded-full text-sm font-bold hover:opacity-90">
                <Send size={14} /> Confirm
              </button>
              <button onClick={() => setConfirmSendAll(false)} className="px-3 py-2 border border-border rounded-full text-sm font-bold hover:bg-slate-50">
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmSendAll(true)}
              disabled={sendingAll}
              className="flex items-center gap-2 px-4 py-2 border border-border rounded-full text-sm font-bold hover:bg-slate-50 disabled:opacity-50"
            >
              {sendingAll ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {sendingAll ? 'Sending…' : 'Send All Payslips'}
            </button>
          )}
          <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 border border-border rounded-full text-sm font-bold hover:bg-slate-50">
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      {payslips.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <FileText size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No payslips found for this run</p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          {run && (() => {
            const cards = isDual ? [
              { label: 'Total Employees', value: String(payslips.length) },
              { label: 'Total Gross (USD)', value: `USD ${payslips.reduce((s: number, p: any) => s + (p.grossUSD ?? p.gross), 0).toFixed(2)}` },
              { label: 'Total Gross (ZiG)', value: `ZiG ${payslips.reduce((s: number, p: any) => s + (p.grossZIG ?? 0), 0).toFixed(2)}` },
              { label: 'Net Pay (USD)', value: `USD ${payslips.reduce((s: number, p: any) => s + (p.netPayUSD ?? p.netPay), 0).toFixed(2)}` },
            ] : [
              { label: 'Total Employees', value: String(payslips.length) },
              { label: 'Total Gross', value: `${ccy} ${payslips.reduce((s: number, p: any) => s + p.gross, 0).toFixed(2)}` },
              { label: 'Total PAYE', value: `${ccy} ${payslips.reduce((s: number, p: any) => s + p.paye, 0).toFixed(2)}` },
              { label: 'Total Net', value: `${ccy} ${payslips.reduce((s: number, p: any) => s + p.netPay, 0).toFixed(2)}` },
            ];
            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                {cards.map((s) => (
                  <div key={s.label} className="bg-primary rounded-2xl border border-border p-4 shadow-sm">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{s.label}</p>
                    <p className="text-xl font-bold">{s.value}</p>
                  </div>
                ))}
              </div>
            );
          })()}

          <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-x-auto">
            <table className="w-full text-left min-w-max">
              <thead>
                <tr className="border-b border-border bg-slate-50">
                  <th className={thCls}>Employee</th>
                  <th className={thCls}>Position</th>

                  {/* BASIC */}
                  <th className={thCls}>Basic{isDual ? ' (USD)' : ''}</th>

                  {/* One column per earning/benefit TC (e.g. Transport Allowance) */}
                  {allEarningTCs.map((tc) => (
                    <th key={tc.tcId} className={thCls}>{tc.name}</th>
                  ))}

                  {/* Gross Pay */}
                  {isDual ? (
                    <>
                      <th className={thCls}>Gross USD</th>
                      <th className={thCls}>Gross ZiG</th>
                    </>
                  ) : (
                    <th className={thCls}>Gross Pay</th>
                  )}

                  {/* One column per post-tax deduction TC (e.g. Advance) */}
                  {allDeductionTCs.map((tc) => (
                    <th key={tc.tcId} className={thCls + ' text-red-400'}>{tc.name}</th>
                  ))}

                  {/* Statutory deductions total */}
                  <th className={thCls + ' text-red-400'}>Total Deductions</th>

                  {/* Net Pay */}
                  {isDual ? (
                    <>
                      <th className={thCls}>Net USD</th>
                      <th className={thCls}>Net ZiG</th>
                    </>
                  ) : (
                    <th className={thCls}>Net Pay</th>
                  )}

                  <th className={thCls}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payslips.map((p: any) => {
                  // Build lookup maps for quick access
                  const earningMap: Record<string, string[]> = {};
                  for (const e of (p.earningLines || [])) {
                    if (!earningMap[e.tcId]) earningMap[e.tcId] = [];
                    earningMap[e.tcId].push(`${e.currency || ccy} ${fmt(e.amount)}`);
                  }
                  const deductionMap: Record<string, string[]> = {};
                  for (const d of (p.deductionLines || [])) {
                    if (!deductionMap[d.tcId]) deductionMap[d.tcId] = [];
                    deductionMap[d.tcId].push(`${d.currency || ccy} ${fmt(d.amount)}`);
                  }

                  const totalDeductions = p.gross - p.netPay;
                  const grossUSD = p.grossUSD ?? p.gross;
                  const netUSD = p.netPayUSD ?? p.netPay;

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3">
                        <p className="font-bold text-sm">{p.employee?.firstName} {p.employee?.lastName}</p>
                        <p className="text-xs text-slate-400">{p.employee?.employeeCode}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{p.employee?.position}</td>

                      {/* Basic from employee master */}
                      <td className="px-4 py-3 text-sm font-bold">{fmt(p.basicSalary)}</td>

                      {/* Earning TC columns — blank if employee doesn't have this TC */}
                      {allEarningTCs.map((tc) => (
                        <td key={tc.tcId} className="px-4 py-3 text-sm font-medium">
                          {earningMap[tc.tcId] ? earningMap[tc.tcId].join(' / ') : '—'}
                        </td>
                      ))}

                      {/* Gross */}
                      {isDual ? (
                        <>
                          <td className="px-4 py-3 text-sm font-bold">{fmt(grossUSD)}</td>
                          <td className="px-4 py-3 text-sm font-bold">{fmt(p.grossZIG)}</td>
                        </>
                      ) : (
                        <td className="px-4 py-3 text-sm font-bold">{fmt(p.gross)}</td>
                      )}

                      {/* Post-tax deduction TC columns */}
                      {allDeductionTCs.map((tc) => (
                        <td key={tc.tcId} className="px-4 py-3 text-sm text-red-500 font-medium whitespace-nowrap">
                          {deductionMap[tc.tcId] ? deductionMap[tc.tcId].join(' / ') : '—'}
                        </td>
                      ))}

                      {/* Total deductions */}
                      <td className="px-4 py-3 text-sm text-red-500 font-medium">{fmt(totalDeductions)}</td>

                      {/* Net Pay */}
                      {isDual ? (
                        <>
                          <td className="px-4 py-3 text-sm font-bold text-emerald-600">{fmt(netUSD)}</td>
                          <td className="px-4 py-3 text-sm font-bold text-emerald-600">{fmt(p.netPayZIG)}</td>
                        </>
                      ) : (
                        <td className="px-4 py-3 text-sm font-bold text-emerald-600">{fmt(p.netPay)}</td>
                      )}

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => handlePdf(p.id, p.employee?.lastName || '', p.employee?.firstName || '')}
                            className="flex items-center gap-1 text-xs font-bold text-accent-blue hover:underline"
                          >
                            <FileText size={14} /> PDF
                          </button>
                          {sentIds.has(p.id) ? (
                            <span className="flex items-center gap-1 text-xs font-bold text-emerald-600">
                              <CheckCircle2 size={14} /> Sent
                            </span>
                          ) : (
                            <button
                              onClick={() => handleSend(p.id)}
                              disabled={sendingIds.has(p.id)}
                              className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-navy disabled:opacity-40"
                            >
                              {sendingIds.has(p.id)
                                ? <Loader2 size={14} className="animate-spin" />
                                : <Send size={14} />}
                              {sendingIds.has(p.id) ? 'Sending…' : 'Send'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default Payslips;
