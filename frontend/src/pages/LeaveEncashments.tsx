import React, { useEffect, useState } from 'react';
import { Loader, Banknote, CheckCircle2, XCircle, Zap, Clock, AlertCircle } from 'lucide-react';
import { LeaveEncashmentAPI, EmployeeAPI, LeaveBalanceAPI } from '../api/client';

const LEAVE_TYPES = ['ANNUAL', 'SICK', 'MATERNITY', 'PATERNITY', 'UNPAID', 'COMPASSIONATE', 'STUDY', 'OTHER'];
const fmtType = (t: string) => t.charAt(0) + t.slice(1).toLowerCase().replace(/_/g, ' ');

const STATUS_STYLE: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  APPROVED: 'bg-teal-50 text-teal-700',
  PROCESSED: 'bg-emerald-50 text-emerald-700',
  REJECTED: 'bg-red-50 text-red-700',
};

const LeaveEncashments: React.FC = () => {
  const [encashments, setEncashments] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ employeeId: '', leaveType: 'ANNUAL', days: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    LeaveEncashmentAPI.getAll()
      .then((r) => setEncashments(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    EmployeeAPI.getAll({ limit: '500' })
      .then((r) => setEmployees(r.data?.data || r.data || []))
      .catch(() => {});
  }, []);

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
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to submit encashment');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (id: string) => {
    setActionLoading('approve-' + id);
    setError('');
    try {
      await LeaveEncashmentAPI.approve(id);
      setActionMsg('Encashment approved');
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to approve');
    } finally {
      setActionLoading('');
    }
  };

  const handleReject = async (id: string) => {
    const reason = window.prompt('Rejection reason (optional):') ?? '';
    setActionLoading('reject-' + id);
    setError('');
    try {
      await LeaveEncashmentAPI.reject(id, reason);
      setActionMsg('Encashment rejected and balance restored');
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to reject');
    } finally {
      setActionLoading('');
    }
  };

  const handleProcess = async (id: string) => {
    if (!window.confirm('Process encashment into payroll inputs? This will create a LEAVE_ENCASHMENT earning for the next payroll run.')) return;
    setActionLoading('process-' + id);
    setError('');
    try {
      await LeaveEncashmentAPI.process(id);
      setActionMsg('Encashment processed — a PayrollInput has been created for the next run');
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to process');
    } finally {
      setActionLoading('');
    }
  };

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-navy">Leave Encashments</h2>
          <p className="text-slate-500 text-sm font-medium">Convert unused leave days into taxable earnings</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setError(''); }}
          className="bg-btn-primary text-navy px-6 py-3 rounded-full font-bold shadow hover:opacity-90 flex items-center gap-2"
        >
          <Banknote size={18} /> New Encashment
        </button>
      </header>

      {error && <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600"><AlertCircle size={16} />{error}</div>}
      {actionMsg && <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 font-medium">{actionMsg}</div>}

      {/* Encashment Request Form */}
      {showForm && (
        <div className="bg-primary border border-border rounded-2xl p-6 shadow-sm">
          <h3 className="font-bold text-sm uppercase tracking-wider text-slate-400 mb-5">Request Encashment</h3>
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Employee</label>
              <select required value={form.employeeId} onChange={set('employeeId')}
                className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue">
                <option value="">Select employee…</option>
                {employees.map((e: any) => (
                  <option key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.employeeCode})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Leave Type</label>
              <select required value={form.leaveType} onChange={set('leaveType')}
                className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue">
                {LEAVE_TYPES.map((t) => <option key={t} value={t}>{fmtType(t)}</option>)}
              </select>
              {selectedBalance && (
                <p className="text-xs text-slate-400 mt-1">
                  Available balance: <span className="font-bold text-emerald-700">{selectedBalance.balance.toFixed(1)} days</span>
                </p>
              )}
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Days to Encash</label>
              <input type="number" required min="0.5" step="0.5" value={form.days} onChange={set('days')}
                className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue" />
              {selectedBalance && form.days && (
                <p className="text-xs text-slate-400 mt-1">
                  Est. amount: <span className="font-bold text-navy">
                    USD {(parseFloat(form.days || '0') * (selectedBalance?.leavePolicy ? 1 : 0)).toFixed(2)}
                  </span>
                  <span className="ml-1">(calculated at basic salary ÷ 22 days)</span>
                </p>
              )}
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Notes</label>
              <input type="text" value={form.notes} onChange={set('notes')} placeholder="Optional"
                className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue" />
            </div>
            <div className="sm:col-span-2 flex gap-3 pt-2">
              <button type="submit" disabled={saving}
                className="bg-btn-primary text-navy px-8 py-3 rounded-full font-bold shadow hover:opacity-90 disabled:opacity-60">
                {saving ? 'Submitting…' : 'Submit Encashment'}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="px-8 py-3 rounded-full font-bold border border-border hover:bg-slate-50">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-48"><Loader size={24} className="animate-spin text-slate-400" /></div>
      ) : encashments.length === 0 ? (
        <div className="text-center py-16 bg-primary rounded-2xl border border-border">
          <Banknote size={36} className="mx-auto mb-3 text-slate-200" />
          <p className="font-bold text-slate-500">No encashment requests yet</p>
        </div>
      ) : (
        <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-slate-50">
                {['Employee', 'Type', 'Days', 'Rate/Day', 'Total Amount', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="px-5 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {encashments.map((enc: any) => (
                <tr key={enc.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-5 py-4">
                    <p className="text-sm font-bold">{enc.employee?.firstName} {enc.employee?.lastName}</p>
                    <p className="text-xs text-slate-400">{enc.employee?.employeeCode}</p>
                  </td>
                  <td className="px-5 py-4 text-sm font-medium">{fmtType(enc.leaveType)}</td>
                  <td className="px-5 py-4 text-sm font-bold">{enc.days}</td>
                  <td className="px-5 py-4 text-sm">{enc.currency} {enc.ratePerDay.toFixed(2)}</td>
                  <td className="px-5 py-4 text-sm font-bold">{enc.currency} {enc.totalAmount.toFixed(2)}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${STATUS_STYLE[enc.status] || 'bg-slate-100 text-slate-600'}`}>
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
                          disabled={actionLoading === 'approve-' + enc.id}
                          className="text-xs font-bold px-2.5 py-1 bg-teal-50 text-teal-700 rounded-full hover:bg-teal-100 disabled:opacity-60"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleReject(enc.id)}
                          disabled={actionLoading === 'reject-' + enc.id}
                          className="text-xs font-bold px-2.5 py-1 bg-red-50 text-red-600 rounded-full hover:bg-red-100 disabled:opacity-60"
                        >
                          Reject
                        </button>
                      </>)}
                      {enc.status === 'APPROVED' && (
                        <button
                          onClick={() => handleProcess(enc.id)}
                          disabled={actionLoading === 'process-' + enc.id}
                          className="text-xs font-bold px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full hover:bg-emerald-100 disabled:opacity-60 flex items-center gap-1"
                        >
                          <Zap size={11} /> Process to Payroll
                        </button>
                      )}
                      {enc.status === 'PROCESSED' && enc.payrollInputId && (
                        <span className="text-xs text-slate-400 font-medium">In payroll</span>
                      )}
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

export default LeaveEncashments;
