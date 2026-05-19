import React, { useEffect, useState } from 'react';
import { Plus, FileText, ChevronRight, Play, Check, SendHorizonal, Pencil, X } from 'lucide-react';
import SkeletonTable from '../components/common/SkeletonTable';
import { useNavigate } from 'react-router-dom';
import { PayrollAPI } from '../api/client';
import { getActiveCompanyId } from '../lib/companyContext';
import { useToast } from '../context/ToastContext';
import { usePermissions } from '../hooks/usePermissions';
import { StatusBadge } from '@/components/common/StatusBadge';
import ConfirmModal from '../components/common/ConfirmModal';

const Payroll: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { can } = usePermissions();
  const [runs, setRuns] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [editingRate, setEditingRate] = useState<string | null>(null); // runId being edited
  const [rateInput, setRateInput] = useState('');
  const [rateSaving, setRateSaving] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ action: 'submit' | 'approve' | 'process'; runId: string; isRerun?: boolean } | null>(null);

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
      setActionError(err.message || `Failed to ${action} payroll run`);
    } finally { setActionLoading(null); }
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
      showToast(err.message || 'Failed to update exchange rate', 'error');
    } finally {
      setRateSaving(false);
    }
  };


  const confirmAction = async () => {
    if (!pendingAction) return;
    const fakeEvent = { stopPropagation: () => {} } as React.MouseEvent;
    await handleAction(fakeEvent, pendingAction.action, pendingAction.runId);
    setPendingAction(null);
  };

  const getConfirmModalProps = () => {
    if (!pendingAction) return null;
    const { action, isRerun } = pendingAction;
    if (action === 'submit') return { title: 'Submit Payroll Run', message: 'This will submit the run for approval. Are you sure?', confirmLabel: 'Submit for Approval', danger: false };
    if (action === 'approve') return { title: 'Approve Payroll Run', message: 'This will approve the run and allow it to be processed.', confirmLabel: 'Approve', danger: false };
    if (isRerun) return { title: 'Rerun Payroll', message: 'This will recalculate all payslips, overwriting existing results.', confirmLabel: 'Rerun Payroll', danger: true };
    return { title: 'Process Payroll Run', message: 'This will calculate all payslips. This may take a few minutes and cannot be interrupted.', confirmLabel: 'Process Payroll', danger: false };
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Payroll</h1>
          <p className="text-muted-foreground font-medium text-sm">{total} payroll runs</p>
        </div>
        {can('PAYROLL', 'RUN') && (
          <button
            onClick={() => navigate('/payroll/new')}
            className="bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 flex items-center gap-1.5 text-sm"
          >
            <Plus size={14} /> New Payroll Run
          </button>
        )}
      </header>

      {actionError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{actionError}</div>
      )}

      {loading ? (
        <SkeletonTable headers={['Period', 'Run Date', 'Currency', 'Rate', 'Employees', 'Status', '']} />
      ) : runs.length === 0 ? (
        <div className="text-center py-20 bg-primary rounded-2xl border border-border shadow-sm">
          <FileText size={40} className="mx-auto mb-3 text-slate-200" />
          <p className="font-bold text-muted-foreground mb-2">No payroll runs yet</p>
          <p className="text-sm text-muted-foreground mb-6">Create your first payroll run to get started</p>
          {can('PAYROLL', 'RUN') && (
            <button onClick={() => navigate('/payroll/new')} className="bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 flex items-center gap-1.5 text-sm">
              <Plus size={14} /> Create Payroll Run
            </button>
          )}
        </div>
      ) : (
        <div className="tbl-container">
          <div className="tbl-scroll">
          <table className="w-full text-left">
            <thead>
              <tr className="tbl-head-row">
                {['Period', 'Run Date', 'Currency', 'Rate', 'Employees', 'Status', ''].map((h) => (
                  <th key={h} scope="col" className="tbl-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {runs.map((run: any) => (
                <tr
                  key={run.id}
                  className="hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/payroll/${run.id}/payslips`)}
                >
                  <td className="px-5 py-3.5">
                    <p className="font-bold text-sm">{new Date(run.startDate).toLocaleDateString()}</p>
                    <p className="text-xs text-muted-foreground">to {new Date(run.endDate).toLocaleDateString()}</p>
                  </td>
                  <td className="px-5 py-3.5 text-sm">{new Date(run.runDate).toLocaleDateString()}</td>
                  <td className="px-5 py-3.5 text-sm font-bold">
                    {run.dualCurrency ? (
                      <span className="text-blue-600">USD + ZiG</span>
                    ) : run.currency}
                  </td>
                  <td className="px-5 py-3.5 text-sm" onClick={(e) => e.stopPropagation()}>
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
                            className="w-24 px-2 py-1 text-xs border border-accent-green rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-green/30"
                            onKeyDown={(e) => { if (e.key === 'Escape') setEditingRate(null); }}
                          />
                          <button
                            onClick={(e) => handleSaveRate(e, run.id)}
                            disabled={rateSaving}
                            className="px-2 py-1 text-xs font-bold bg-accent-green text-white rounded-lg disabled:opacity-50"
                          >
                            {rateSaving ? '…' : 'Save'}
                          </button>
                          <button onClick={() => setEditingRate(null)} className="text-muted-foreground hover:text-foreground/80">
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="text-foreground/80">{run.exchangeRate ? `${run.exchangeRate}` : '—'}</span>
                          {['DRAFT', 'APPROVED', 'ERROR'].includes(run.status) && (
                            <button
                              onClick={() => { setEditingRate(run.id); setRateInput(String(run.exchangeRate || '')); }}
                              className="text-muted-foreground/50 hover:text-accent-green transition-colors"
                              title="Edit exchange rate"
                            >
                              <Pencil size={12} />
                            </button>
                          )}
                        </div>
                      )
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-sm">
                    {run.status === 'COMPLETED'
                      ? (run._count?.payslips ?? run.payslipCount ?? '—')
                      : (run.employeeCount ?? run._count?.payslips ?? '—')}
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusBadge status={run.status} />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      {can('PAYROLL', 'RUN') && run.status === 'DRAFT' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setPendingAction({ action: 'submit', runId: run.id }); }}
                          disabled={actionLoading === run.id + 'submit'}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-amber-50 text-amber-700 rounded-full hover:bg-amber-100 disabled:opacity-50"
                          title="Submit for Approval"
                        >
                          <SendHorizonal size={12} /> Submit
                        </button>
                      )}
                      {can('PAYROLL', 'APPROVE') && run.status === 'PENDING_APPROVAL' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setPendingAction({ action: 'approve', runId: run.id }); }}
                          disabled={actionLoading === run.id + 'approve'}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-teal-50 text-teal-700 rounded-full hover:bg-teal-100 disabled:opacity-50"
                          title="Approve"
                        >
                          <Check size={12} /> Approve
                        </button>
                      )}
                      {can('PAYROLL', 'RUN') && (run.status === 'DRAFT' || run.status === 'APPROVED' || run.status === 'ERROR') && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setPendingAction({ action: 'process', runId: run.id }); }}
                          disabled={actionLoading === run.id + 'process'}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-blue-50 text-blue-700 rounded-full hover:bg-blue-100 disabled:opacity-50"
                          title="Process Payroll"
                        >
                          <Play size={12} /> Process
                        </button>
                      )}
                      {can('PAYROLL', 'RUN') && run.status === 'COMPLETED' && !run.payrollCalendar?.isClosed && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setPendingAction({ action: 'process', runId: run.id, isRerun: true }); }}
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
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-muted text-foreground/90 rounded-full hover:bg-muted"
                          title="View Payroll Summary"
                        >
                          <FileText size={12} /> Summary
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/payroll/${run.id}/payslips`); }}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-muted text-foreground/90 rounded-full hover:bg-muted"
                          title="View Payslips"
                        >
                          <FileText size={12} /> View Payslips
                        </button>
                      </>)}
                      <ChevronRight size={16} className="text-muted-foreground ml-1" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {pendingAction && (() => {
        const props = getConfirmModalProps();
        if (!props) return null;
        return (
          <ConfirmModal
            title={props.title}
            message={props.message}
            confirmLabel={props.confirmLabel}
            danger={props.danger}
            onConfirm={confirmAction}
            onCancel={() => setPendingAction(null)}
          />
        );
      })()}
    </div>
  );
};

export default Payroll;
