import React, { useEffect, useRef, useState } from 'react';
import { Loader, Banknote, CheckCircle2, XCircle, Zap, Clock, AlertCircle, ChevronDown } from 'lucide-react';
import { Dropdown } from '@/components/ui/dropdown';
import { LeaveEncashmentAPI, EmployeeAPI, LeaveBalanceAPI } from '../api/client';
import ConfirmModal from '../components/common/ConfirmModal';
import { useToast } from '../context/ToastContext';
import { useEscapeKey } from '../hooks/useEscapeKey';

const LEAVE_TYPES = ['ANNUAL', 'SICK', 'MATERNITY', 'PATERNITY', 'UNPAID', 'COMPASSIONATE', 'STUDY', 'OTHER'];
const fmtType = (t: string) => t.charAt(0) + t.slice(1).toLowerCase().replace(/_/g, ' ');

const STATUS_STYLE: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  APPROVED: 'bg-teal-50 text-teal-700',
  PROCESSED: 'bg-emerald-50 text-emerald-700',
  REJECTED: 'bg-red-50 text-red-700',
};

const LeaveEncashments: React.FC = () => {
  const { showToast } = useToast();
  const [encashments, setEncashments] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ employeeId: '', leaveType: 'ANNUAL', days: '', notes: '' });
  const [saving, setSaving] = useState(false);

  // Reject modal state
  const [rejectTarget, setRejectTarget] = useState<{ id: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const rejectInputRef = useRef<HTMLInputElement>(null);

  // Process confirm modal state
  const [processTarget, setProcessTarget] = useState<{ id: string } | null>(null);

  useEscapeKey(!!rejectTarget, () => setRejectTarget(null));
  useEscapeKey(!!processTarget, () => setProcessTarget(null));

  const load = () => {
    setLoading(true);
    LeaveEncashmentAPI.getAll()
      .then((r) => setEncashments(r.data))
      .catch(() => showToast('Failed to load encashments', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    EmployeeAPI.getAll({ limit: '500' })
      .then((r) => setEmployees(r.data?.data || r.data || []))
      .catch(() => {});
  }, []);

  // Focus reject reason input when modal opens
  useEffect(() => {
    if (rejectTarget) {
      setTimeout(() => rejectInputRef.current?.focus(), 50);
    }
  }, [rejectTarget]);

  // Fetch balances when employee changes in form
  useEffect(() => {
    if (form.employeeId) {
      LeaveBalanceAPI.getForEmployee(form.employeeId)
        .then((r) => setBalances(r.data))
        .catch(() => setBalances([]));
    } else {
      setBalances([]);
    }
  }, [form.employeeId]);

  const selectedBalance = balances.find((b: any) => b.leaveType === form.leaveType);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await LeaveEncashmentAPI.create({
        employeeId: form.employeeId || undefined,
        leaveType: form.leaveType,
        days: parseFloat(form.days),
        notes: form.notes,
      });
      setShowForm(false);
      setForm({ employeeId: '', leaveType: 'ANNUAL', days: '', notes: '' });
      showToast('Encashment request submitted', 'success');
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to submit encashment');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (id: string) => {
    setActionLoading('approve-' + id);
    try {
      await LeaveEncashmentAPI.approve(id);
      showToast('Encashment approved', 'success');
      load();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to approve', 'error');
    } finally {
      setActionLoading('');
    }
  };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    const id = rejectTarget.id;
    setRejectTarget(null);
    setActionLoading('reject-' + id);
    try {
      await LeaveEncashmentAPI.reject(id, rejectReason);
      showToast('Encashment rejected and balance restored', 'success');
      load();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to reject', 'error');
    } finally {
      setActionLoading('');
      setRejectReason('');
    }
  };

  const confirmProcess = async () => {
    if (!processTarget) return;
    const id = processTarget.id;
    setProcessTarget(null);
    setActionLoading('process-' + id);
    try {
      await LeaveEncashmentAPI.process(id);
      showToast('Encashment processed — a payroll input has been created for the next run', 'success');
      load();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to process', 'error');
    } finally {
      setActionLoading('');
    }
  };

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="flex flex-col gap-6">
      {/* Reject reason modal */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setRejectTarget(null); setRejectReason(''); }} />
          <div className="relative bg-card rounded-2xl shadow-xl border border-border w-full max-w-sm p-6 flex flex-col gap-4">
            <h2 className="font-bold text-navy">Reject Encashment</h2>
            <p className="text-sm text-muted-foreground">Provide an optional reason for rejection. The employee's leave balance will be restored.</p>
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Reason (optional)</label>
              <input
                ref={rejectInputRef}
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') confirmReject(); if (e.key === 'Escape') { setRejectTarget(null); setRejectReason(''); } }}
                placeholder="e.g. Insufficient leave balance"
                className="w-full px-3 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/30 focus:border-accent-green"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setRejectTarget(null); setRejectReason(''); }} className="px-4 py-2 rounded-full border border-border text-sm font-bold text-muted-foreground hover:bg-muted">Cancel</button>
              <button onClick={confirmReject} className="px-4 py-2 rounded-full bg-red-500 text-white text-sm font-bold hover:bg-red-600">Reject</button>
            </div>
          </div>
        </div>
      )}

      {/* Process confirm modal */}
      {processTarget && (
        <ConfirmModal
          title="Process to Payroll"
          message="This will create a LEAVE_ENCASHMENT earning entry for the next payroll run. Continue?"
          confirmLabel="Process"
          danger={false}
          onConfirm={confirmProcess}
          onCancel={() => setProcessTarget(null)}
        />
      )}

      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Leave Encashments</h1>
          <p className="text-muted-foreground text-sm font-medium">Convert unused leave days into taxable earnings</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setError(''); }}
          className="bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 flex items-center gap-1.5"
        >
          <Banknote size={18} /> New Encashment
        </button>
      </header>

      {error && <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600"><AlertCircle size={16} />{error}</div>}

      {/* Encashment Request Form */}
      {showForm && (
        <div className="bg-primary border border-border rounded-2xl p-6 shadow-sm">
          <h2 className="font-bold text-sm uppercase tracking-wider text-muted-foreground mb-5">Request Encashment</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Employee <span className="text-red-400">*</span></label>
              <Dropdown className="w-full" trigger={(isOpen) => (
                <button type="button" className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium flex items-center justify-between hover:border-accent-green transition-colors">
                  <span className="truncate">{employees.find((e: any) => e.id === form.employeeId) ? `${employees.find((e: any) => e.id === form.employeeId).firstName} ${employees.find((e: any) => e.id === form.employeeId).lastName}` : 'Select employee…'}</span>
                  <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
              )} sections={[{ items: [
                { label: 'Select employee…', onClick: () => setForm(p => ({ ...p, employeeId: '' })) },
                ...employees.map((e: any) => ({ label: `${e.firstName} ${e.lastName} (${e.employeeCode})`, onClick: () => setForm(p => ({ ...p, employeeId: e.id })) })),
              ], emptyMessage: 'No employees found' }]} />
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Leave Type <span className="text-red-400">*</span></label>
              <Dropdown className="w-full" trigger={(isOpen) => (
                <button type="button" className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium flex items-center justify-between hover:border-accent-green transition-colors">
                  <span>{fmtType(form.leaveType)}</span>
                  <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
              )} sections={[{ items: LEAVE_TYPES.map(t => ({ label: fmtType(t), onClick: () => setForm(p => ({ ...p, leaveType: t })) })) }]} />
              {selectedBalance && (
                <p className="text-xs text-muted-foreground mt-1">
                  Available balance: <span className="font-bold text-emerald-700">{selectedBalance.balance.toFixed(1)} days</span>
                </p>
              )}
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Days to Encash <span className="text-red-400">*</span></label>
              <input type="number" required min="0.5" step="0.5" value={form.days} onChange={set('days')}
                className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green" />
              {selectedBalance && form.days && (
                <p className="text-xs text-muted-foreground mt-1">
                  Est. amount: <span className="font-bold text-navy">
                    USD {(parseFloat(form.days || '0') * (selectedBalance?.leavePolicy ? 1 : 0)).toFixed(2)}
                  </span>
                  <span className="ml-1">(calculated at basic salary ÷ 22 days)</span>
                </p>
              )}
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Notes</label>
              <input type="text" value={form.notes} onChange={set('notes')} placeholder="Optional"
                className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green" />
            </div>
            <div className="sm:col-span-2 flex gap-3 pt-2">
              <button type="submit" disabled={saving}
                className="bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 disabled:opacity-60 flex items-center gap-1.5">
                {saving && <Loader size={14} className="animate-spin" />}
                {saving ? 'Submitting…' : 'Submit Encashment'}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-full font-bold border border-border hover:bg-muted">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-48"><Loader size={24} className="animate-spin text-accent-green" /></div>
      ) : encashments.length === 0 ? (
        <div className="text-center py-16 bg-primary rounded-2xl border border-border">
          <Banknote size={36} className="mx-auto mb-3 text-slate-200" />
          <p className="font-bold text-muted-foreground">No encashment requests yet</p>
          <p className="text-sm text-muted-foreground mt-1">Submit a request above to convert unused leave days into earnings.</p>
        </div>
      ) : (
        <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto scroll-x-shadow">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-muted">
                  {['Employee', 'Type', 'Days', 'Rate/Day', 'Total Amount', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="px-5 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {encashments.map((enc: any) => (
                  <tr key={enc.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-4">
                      <p className="text-sm font-bold">{enc.employee?.firstName} {enc.employee?.lastName}</p>
                      <p className="text-xs text-muted-foreground">{enc.employee?.employeeCode}</p>
                    </td>
                    <td className="px-5 py-4 text-sm font-medium">{fmtType(enc.leaveType)}</td>
                    <td className="px-5 py-4 text-sm font-bold">{enc.days}</td>
                    <td className="px-5 py-4 text-sm">{enc.currency} {Number(enc.ratePerDay).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-5 py-4 text-sm font-bold">{enc.currency} {Number(enc.totalAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${STATUS_STYLE[enc.status] || 'bg-muted text-foreground/80'}`}>
                        {enc.status === 'PENDING' && <Clock size={11} />}
                        {enc.status === 'APPROVED' && <CheckCircle2 size={11} />}
                        {enc.status === 'PROCESSED' && <Zap size={11} />}
                        {enc.status === 'REJECTED' && <XCircle size={11} />}
                        {enc.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5">
                        {enc.status === 'PENDING' && (<>
                          <button
                            onClick={() => handleApprove(enc.id)}
                            disabled={!!actionLoading}
                            className="text-xs font-bold px-2.5 py-1 bg-teal-50 text-teal-700 rounded-full hover:bg-teal-100 disabled:opacity-60 flex items-center gap-1"
                          >
                            {actionLoading === 'approve-' + enc.id ? <Loader size={10} className="animate-spin" /> : <CheckCircle2 size={11} />}
                            Approve
                          </button>
                          <button
                            onClick={() => { setRejectTarget({ id: enc.id }); setRejectReason(''); }}
                            disabled={!!actionLoading}
                            className="text-xs font-bold px-2.5 py-1 bg-red-50 text-red-600 rounded-full hover:bg-red-100 disabled:opacity-60 flex items-center gap-1"
                          >
                            {actionLoading === 'reject-' + enc.id ? <Loader size={10} className="animate-spin" /> : <XCircle size={11} />}
                            Reject
                          </button>
                        </>)}
                        {enc.status === 'APPROVED' && (
                          <button
                            onClick={() => setProcessTarget({ id: enc.id })}
                            disabled={!!actionLoading}
                            className="text-xs font-bold px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full hover:bg-emerald-100 disabled:opacity-60 flex items-center gap-1"
                          >
                            {actionLoading === 'process-' + enc.id ? <Loader size={10} className="animate-spin" /> : <Zap size={11} />}
                            Process to Payroll
                          </button>
                        )}
                        {enc.status === 'PROCESSED' && enc.payrollInputId && (
                          <span className="text-xs text-muted-foreground font-medium">In payroll</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeaveEncashments;
