import React, { useEffect, useRef, useState } from 'react';
import { Plus, FileText, ChevronRight, Play, Check, SendHorizonal, Download, Banknote, ChevronDown, Pencil, X } from 'lucide-react';
import SkeletonTable from '../components/common/SkeletonTable';
import { useNavigate } from 'react-router-dom';
import { PayrollAPI, StatutoryExportAPI, BankFileAPI } from '../api/client';
import { getActiveCompanyId } from '../lib/companyContext';
import { useToast } from '../context/ToastContext';

const Payroll: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [runs, setRuns] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [bankDropdown, setBankDropdown] = useState<string | null>(null);
  const bankDropdownRef = useRef<HTMLDivElement>(null);
  const [editingRate, setEditingRate] = useState<string | null>(null); // runId being edited
  const [rateInput, setRateInput] = useState('');
  const [rateSaving, setRateSaving] = useState(false);

  const loadRuns = () => {
    PayrollAPI.getAll()
      .then((r: any) => {
        const data = r.data;
        setRuns(data.data || data);
        setTotal(data.total || (data.data || data).length);
      })
      .catch(() => showToast('Failed to load payroll runs', 'error'))
      .finally(() => setLoading(false));
  };

  // Close bank dropdown on Escape key or click outside
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setBankDropdown(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!bankDropdown) return;
    const onOutside = (e: MouseEvent) => {
      if (bankDropdownRef.current && !bankDropdownRef.current.contains(e.target as Node)) {
        setBankDropdown(null);
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [bankDropdown]);

  useEffect(() => { loadRuns(); }, [getActiveCompanyId()]);

  const handleAction = async (e: React.MouseEvent, action: 'submit' | 'approve' | 'process', runId: string) => {
    e.stopPropagation();
    setActionLoading(runId + action);
    try {
      if (action === 'submit') await PayrollAPI.submit(runId);
      else if (action === 'approve') await PayrollAPI.approve(runId);
      else await PayrollAPI.process(runId);
      setActionError('');
      loadRuns();
    } catch (err: any) {
      setActionError(err.response?.data?.message || `Failed to ${action} payroll run`);
    } finally { setActionLoading(null); }
  };

  const handleExport = async (e: React.MouseEvent, type: 'zimra' | 'nssa', runId: string) => {
    e.stopPropagation();
    try {
      const res = type === 'zimra'
        ? await StatutoryExportAPI.downloadZimraPaye(runId)
        : await StatutoryExportAPI.downloadNssa(runId);
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = type === 'zimra' ? `ZIMRA-PAYE-${runId}.csv` : `NSSA-${runId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setActionError(`Failed to download ${type.toUpperCase()} export`);
    }
  };

  const handleBankExport = async (e: React.MouseEvent, format: 'cbz' | 'stanbic' | 'fidelity', runId: string) => {
    e.stopPropagation();
    setBankDropdown(null);
    try {
      const res = await BankFileAPI.download(format, runId);
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${format.toUpperCase()}-Payments-${runId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setActionError(err.response?.data?.message || `Failed to download ${format.toUpperCase()} bank file`);
    }
  };

  const handleSaveRate = async (e: React.MouseEvent, runId: string) => {
    e.stopPropagation();
    const parsed = parseFloat(rateInput);
    if (isNaN(parsed) || parsed <= 1) {
      showToast('Exchange rate must be greater than 1', 'error');
      return;
    }
    setRateSaving(true);
    try {
      await PayrollAPI.update(runId, { exchangeRate: parsed });
      setEditingRate(null);
      loadRuns();
      showToast('Exchange rate updated', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to update exchange rate', 'error');
    } finally {
      setRateSaving(false);
    }
  };

  const statusColor: Record<string, string> = {
    COMPLETED: 'bg-emerald-50 text-emerald-700',
    PROCESSING: 'bg-blue-50 text-blue-700',
    DRAFT: 'bg-slate-100 text-slate-600',
    ERROR: 'bg-red-50 text-red-700',
    PENDING_APPROVAL: 'bg-amber-50 text-amber-700',
    APPROVED: 'bg-teal-50 text-teal-700',
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Payroll</h1>
          <p className="text-slate-500 font-medium text-sm">{total} payroll runs</p>
        </div>
        <button
          onClick={() => navigate('/payroll/new')}
          className="bg-btn-primary text-navy px-6 py-3 rounded-full font-bold shadow hover:opacity-90 flex items-center gap-2"
        >
          <Plus size={18} /> New Payroll Run
        </button>
      </header>

      {actionError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{actionError}</div>
      )}

      {loading ? (
        <SkeletonTable headers={['Period', 'Run Date', 'Currency', 'Rate', 'Employees', 'Status', '']} />
      ) : runs.length === 0 ? (
        <div className="text-center py-20 bg-primary rounded-2xl border border-border shadow-sm">
          <FileText size={40} className="mx-auto mb-3 text-slate-200" />
          <p className="font-bold text-slate-500 mb-2">No payroll runs yet</p>
          <p className="text-sm text-slate-400 mb-6">Create your first payroll run to get started</p>
          <button onClick={() => navigate('/payroll/new')} className="bg-btn-primary text-navy px-6 py-3 rounded-full font-bold shadow hover:opacity-90 inline-flex items-center gap-2">
            <Plus size={16} /> Create Payroll Run
          </button>
        </div>
      ) : (
        <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-slate-50">
                {['Period', 'Run Date', 'Currency', 'Rate', 'Employees', 'Status', ''].map((h) => (
                  <th key={h} scope="col" className="px-5 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {runs.map((run: any) => (
                <tr
                  key={run.id}
                  className="hover:bg-slate-100/70 cursor-pointer transition-colors"
                  onClick={() => navigate(`/payroll/${run.id}/payslips`)}
                >
                  <td className="px-5 py-4">
                    <p className="font-bold text-sm">{new Date(run.startDate).toLocaleDateString()}</p>
                    <p className="text-xs text-slate-400">to {new Date(run.endDate).toLocaleDateString()}</p>
                  </td>
                  <td className="px-5 py-4 text-sm">{new Date(run.runDate).toLocaleDateString()}</td>
                  <td className="px-5 py-4 text-sm font-bold">
                    {run.dualCurrency ? (
                      <span className="text-blue-600">USD + ZiG</span>
                    ) : run.currency}
                  </td>
                  <td className="px-5 py-4 text-sm" onClick={(e) => e.stopPropagation()}>
                    {(run.dualCurrency || run.currency === 'ZiG') ? (
                      editingRate === run.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            autoFocus
                            type="number"
                            min="1.0001"
                            step="any"
                            value={rateInput}
                            onChange={(e) => setRateInput(e.target.value)}
                            className="w-24 px-2 py-1 text-xs border border-accent-blue rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-blue/30"
                            onKeyDown={(e) => { if (e.key === 'Escape') setEditingRate(null); }}
                          />
                          <button
                            onClick={(e) => handleSaveRate(e, run.id)}
                            disabled={rateSaving}
                            className="px-2 py-1 text-xs font-bold bg-accent-blue text-white rounded-lg disabled:opacity-50"
                          >
                            {rateSaving ? '…' : 'Save'}
                          </button>
                          <button onClick={() => setEditingRate(null)} className="text-slate-400 hover:text-slate-600">
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-600">{run.exchangeRate ? `${run.exchangeRate}` : '—'}</span>
                          {['DRAFT', 'APPROVED', 'ERROR'].includes(run.status) && (
                            <button
                              onClick={() => { setEditingRate(run.id); setRateInput(String(run.exchangeRate || '')); }}
                              className="text-slate-300 hover:text-accent-blue transition-colors"
                              title="Edit exchange rate"
                            >
                              <Pencil size={12} />
                            </button>
                          )}
                        </div>
                      )
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-sm">
                    {run.status === 'COMPLETED'
                      ? (run._count?.payslips ?? run.payslipCount ?? '—')
                      : (run.employeeCount ?? run._count?.payslips ?? '—')}
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-bold ${statusColor[run.status] || 'bg-slate-100 text-slate-600'}`}>
                      {run.status}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      {run.status === 'DRAFT' && (
                        <button
                          onClick={(e) => handleAction(e, 'submit', run.id)}
                          disabled={actionLoading === run.id + 'submit'}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-amber-50 text-amber-700 rounded-full hover:bg-amber-100 disabled:opacity-50"
                          title="Submit for Approval"
                        >
                          <SendHorizonal size={12} /> Submit
                        </button>
                      )}
                      {run.status === 'PENDING_APPROVAL' && (
                        <button
                          onClick={(e) => handleAction(e, 'approve', run.id)}
                          disabled={actionLoading === run.id + 'approve'}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-teal-50 text-teal-700 rounded-full hover:bg-teal-100 disabled:opacity-50"
                          title="Approve"
                        >
                          <Check size={12} /> Approve
                        </button>
                      )}
                      {(run.status === 'DRAFT' || run.status === 'APPROVED' || run.status === 'ERROR') && (
                        <button
                          onClick={(e) => handleAction(e, 'process', run.id)}
                          disabled={actionLoading === run.id + 'process'}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-blue-50 text-blue-700 rounded-full hover:bg-blue-100 disabled:opacity-50"
                          title="Process Payroll"
                        >
                          <Play size={12} /> Process
                        </button>
                      )}
                      {run.status === 'COMPLETED' && !run.payrollCalendar?.isClosed && (
                        <button
                          onClick={(e) => handleAction(e, 'process', run.id)}
                          disabled={actionLoading === run.id + 'process'}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-indigo-50 text-indigo-700 rounded-full hover:bg-indigo-100 disabled:opacity-50"
                          title="Rerun Payroll"
                        >
                          <Play size={12} /> Rerun
                        </button>
                      )}
                      {run.status === 'COMPLETED' && (<>
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/payroll/${run.id}/summary`); }}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-slate-100 text-slate-700 rounded-full hover:bg-slate-200"
                          title="View Payroll Summary"
                        >
                          <FileText size={12} /> Summary
                        </button>
                        <button
                          onClick={(e) => handleExport(e, 'zimra', run.id)}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-purple-50 text-purple-700 rounded-full hover:bg-purple-100"
                          title="Download ZIMRA PAYE P2 CSV"
                        >
                          <Download size={11} /> ZIMRA
                        </button>
                        <button
                          onClick={(e) => handleExport(e, 'nssa', run.id)}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-orange-50 text-orange-700 rounded-full hover:bg-orange-100"
                          title="Download NSSA Contribution CSV"
                        >
                          <Download size={11} /> NSSA
                        </button>
                        {/* Bank file dropdown */}
                        <div ref={bankDropdownRef} className="relative" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setBankDropdown(bankDropdown === run.id ? null : run.id)}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-emerald-50 text-emerald-700 rounded-full hover:bg-emerald-100"
                            title="Download Bank Payment File"
                          >
                            <Banknote size={11} /> Bank <ChevronDown size={10} />
                          </button>
                          {bankDropdown === run.id && (
                            <div className="absolute right-0 top-full mt-1 bg-white border border-border rounded-xl shadow-lg z-20 min-w-[110px] py-1">
                              {(['cbz', 'stanbic', 'fidelity'] as const).map((fmt) => (
                                <button
                                  key={fmt}
                                  onClick={(e) => handleBankExport(e, fmt, run.id)}
                                  className="w-full text-left px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 uppercase"
                                >
                                  {fmt}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </>)}
                      <ChevronRight size={16} className="text-slate-400 ml-1" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Payroll;
