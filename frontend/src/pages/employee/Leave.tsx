import React, { useEffect, useState } from 'react';
import { CalendarDays, Loader, Clock, CheckCircle2, XCircle, Plus, Banknote, AlertCircle } from 'lucide-react';
import { EmployeeSelfAPI, LeaveAPI, LeaveBalanceAPI, LeaveEncashmentAPI } from '../../api/client';

const statusColor: Record<string, string> = {
  APPROVED: 'bg-emerald-50 text-emerald-700',
  REJECTED: 'bg-red-50 text-red-700',
  PENDING: 'bg-amber-50 text-amber-700',
};

const statusIcon: Record<string, React.ReactNode> = {
  APPROVED: <CheckCircle2 size={12} />,
  REJECTED: <XCircle size={12} />,
  PENDING: <Clock size={12} />,
};

const LEAVE_TYPES = ['ANNUAL', 'SICK', 'MATERNITY', 'PATERNITY', 'UNPAID', 'COMPASSIONATE', 'STUDY', 'OTHER'];
const fmtType = (t: string) => t.charAt(0) + t.slice(1).toLowerCase().replace(/_/g, ' ');

type Tab = 'history' | 'apply' | 'encash';

const EmployeeLeave: React.FC = () => {
  const [records, setRecords] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [encashments, setEncashments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('history');

  const [applyForm, setApplyForm] = useState({ startDate: '', endDate: '', days: '', type: 'ANNUAL', reason: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');

  const [encashForm, setEncashForm] = useState({ leaveType: 'ANNUAL', days: '', notes: '' });
  const [encashSubmitting, setEncashSubmitting] = useState(false);
  const [encashError, setEncashError] = useState('');

  const load = () => {
    EmployeeSelfAPI.getLeave()
      .then((r) => {
        setRecords(r.data.records || []);
        setRequests(r.data.requests || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    LeaveBalanceAPI.getAll({ year: String(new Date().getFullYear()) })
      .then((r) => setBalances(r.data))
      .catch(() => {});

    LeaveEncashmentAPI.getAll()
      .then((r) => setEncashments(r.data))
      .catch(() => {});
  };

  useEffect(load, []);

  const setApply = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setApplyForm((prev) => ({ ...prev, [f]: e.target.value }));

  const setEncash = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setEncashForm((prev) => ({ ...prev, [f]: e.target.value }));

  const handleApplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    setSubmitSuccess('');
    setSubmitting(true);
    try {
      await LeaveAPI.create({ ...applyForm, days: parseFloat(applyForm.days) });
      setSubmitSuccess('Leave request submitted successfully');
      setApplyForm({ startDate: '', endDate: '', days: '', type: 'ANNUAL', reason: '' });
      setTab('history');
      load();
    } catch (err: any) {
      setSubmitError(err.response?.data?.message || 'Failed to submit leave request');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEncashSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEncashError('');
    setEncashSubmitting(true);
    try {
      await LeaveEncashmentAPI.create({
        leaveType: encashForm.leaveType,
        days: parseFloat(encashForm.days),
        notes: encashForm.notes,
      });
      setSubmitSuccess('Encashment request submitted — pending manager approval');
      setEncashForm({ leaveType: 'ANNUAL', days: '', notes: '' });
      setTab('history');
      load();
    } catch (err: any) {
      setEncashError(err.response?.data?.message || 'Failed to submit encashment request');
    } finally {
      setEncashSubmitting(false);
    }
  };

  const selectedBalance = balances.find((b: any) => b.leaveType === encashForm.leaveType);
  const allItems = [...records, ...requests].sort(
    (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
  );

  return (
    <div className="max-w-3xl flex flex-col gap-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Leave</h1>
          <p className="text-slate-500 text-sm font-medium">Balances, history, and requests</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setTab(tab === 'apply' ? 'history' : 'apply')}
            className="flex items-center gap-2 bg-btn-primary text-navy px-4 py-2.5 rounded-full text-sm font-bold shadow hover:opacity-90"
          >
            <Plus size={15} /> Apply
          </button>
          <button
            onClick={() => setTab(tab === 'encash' ? 'history' : 'encash')}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-full text-sm font-bold shadow hover:bg-emerald-700"
          >
            <Banknote size={15} /> Encash
          </button>
        </div>
      </div>

      {submitSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 font-medium">{submitSuccess}</div>
      )}

      {/* Leave Balance Cards */}
      {balances.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {balances.map((b: any) => (
            <div key={b.id} className="bg-primary rounded-2xl border border-border p-4 shadow-sm">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{fmtType(b.leaveType)}</p>
              <p className={`text-2xl font-black ${b.balance <= 0 ? 'text-red-500' : b.balance < 5 ? 'text-amber-500' : 'text-emerald-600'}`}>
                {b.balance.toFixed(1)}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">days available</p>
              <div className="mt-2 pt-2 border-t border-border grid grid-cols-2 gap-1 text-xs text-slate-400">
                <span>Accrued <span className="font-bold text-slate-600">+{b.accrued.toFixed(1)}</span></span>
                <span>Taken <span className="font-bold text-slate-600">−{b.taken.toFixed(1)}</span></span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Apply for Leave Form */}
      {tab === 'apply' && (
        <div className="bg-primary rounded-2xl border border-border p-6 shadow-sm">
          <h3 className="font-bold text-sm uppercase tracking-wider text-slate-400 mb-5">Leave Request</h3>
          {submitError && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{submitError}</div>}
          <form onSubmit={handleApplySubmit} className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Leave Type</label>
              <select required value={applyForm.type} onChange={setApply('type')}
                className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl font-medium text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue">
                {LEAVE_TYPES.map((t) => <option key={t} value={t}>{fmtType(t)}</option>)}
              </select>
              {(() => {
                const bal = balances.find((b: any) => b.leaveType === applyForm.type);
                return bal ? (
                  <p className="text-xs text-slate-400 mt-1">
                    Balance: <span className={`font-bold ${bal.balance < 1 ? 'text-red-500' : 'text-emerald-600'}`}>{bal.balance.toFixed(1)} days</span>
                  </p>
                ) : null;
              })()}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Start Date <span className="text-red-400">*</span></label>
                <input type="date" required value={applyForm.startDate} onChange={setApply('startDate')}
                  className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl font-medium text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">End Date <span className="text-red-400">*</span></label>
                <input type="date" required value={applyForm.endDate} onChange={setApply('endDate')}
                  className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl font-medium text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue" />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Number of Days <span className="text-red-400">*</span></label>
              <input type="number" required min="0.5" step="0.5" value={applyForm.days} onChange={setApply('days')}
                className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl font-medium text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Reason</label>
              <textarea value={applyForm.reason} onChange={setApply('reason')} rows={3}
                className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl font-medium text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue" />
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={submitting}
                className="flex items-center gap-2 bg-btn-primary text-navy px-8 py-3 rounded-full font-bold shadow hover:opacity-90 disabled:opacity-60">
                {submitting ? 'Submitting…' : 'Submit Request'}
              </button>
              <button type="button" onClick={() => setTab('history')} className="px-6 py-3 rounded-full border border-border font-bold hover:bg-slate-50">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Encashment Request Form */}
      {tab === 'encash' && (
        <div className="bg-primary rounded-2xl border border-border p-6 shadow-sm">
          <h3 className="font-bold text-sm uppercase tracking-wider text-slate-400 mb-1">Request Leave Encashment</h3>
          <p className="text-xs text-slate-400 mb-5">Convert unused leave days into a taxable payment (subject to manager approval)</p>
          {encashError && (
            <div className="flex items-center gap-2 mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
              <AlertCircle size={15} /> {encashError}
            </div>
          )}
          <form onSubmit={handleEncashSubmit} className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Leave Type</label>
              <select required value={encashForm.leaveType} onChange={setEncash('leaveType')}
                className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl font-medium text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue">
                {LEAVE_TYPES.map((t) => <option key={t} value={t}>{fmtType(t)}</option>)}
              </select>
              {selectedBalance && (
                <p className="text-xs text-slate-400 mt-1">
                  Available: <span className={`font-bold ${selectedBalance.balance < 1 ? 'text-red-500' : 'text-emerald-600'}`}>{selectedBalance.balance.toFixed(1)} days</span>
                  {selectedBalance.leavePolicy && !selectedBalance.leavePolicy.encashable && (
                    <span className="ml-2 text-red-500 font-bold">— Not encashable per policy</span>
                  )}
                </p>
              )}
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Days to Encash <span className="text-red-400">*</span></label>
              <input type="number" required min="0.5" step="0.5" value={encashForm.days} onChange={setEncash('days')}
                className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl font-medium text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Notes</label>
              <input type="text" value={encashForm.notes} onChange={setEncash('notes')} placeholder="Optional reason"
                className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl font-medium text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue" />
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={encashSubmitting}
                className="flex items-center gap-2 bg-emerald-600 text-white px-8 py-3 rounded-full font-bold shadow hover:bg-emerald-700 disabled:opacity-60">
                {encashSubmitting ? 'Submitting…' : 'Request Encashment'}
              </button>
              <button type="button" onClick={() => setTab('history')} className="px-6 py-3 rounded-full border border-border font-bold hover:bg-slate-50">Cancel</button>
            </div>
          </form>

          {/* My Encashment history */}
          {encashments.length > 0 && (
            <div className="mt-6 pt-6 border-t border-border">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Previous Encashments</p>
              <div className="flex flex-col gap-2">
                {encashments.map((enc: any) => (
                  <div key={enc.id} className="flex items-center justify-between text-sm p-3 bg-slate-50 rounded-xl">
                    <span className="font-medium">{fmtType(enc.leaveType)} — {enc.days} days</span>
                    <span className="font-bold">{enc.currency} {enc.totalAmount.toFixed(2)}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      enc.status === 'PROCESSED' ? 'bg-emerald-50 text-emerald-700' :
                      enc.status === 'APPROVED' ? 'bg-teal-50 text-teal-700' :
                      enc.status === 'REJECTED' ? 'bg-red-50 text-red-600' :
                      'bg-amber-50 text-amber-700'
                    }`}>{enc.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Leave History */}
      {tab === 'history' && (loading ? (
        <div className="flex items-center justify-center h-48 text-slate-400"><Loader size={24} className="animate-spin" /></div>
      ) : allItems.length === 0 ? (
        <div className="text-center py-16 text-slate-400 bg-primary rounded-2xl border border-border">
          <CalendarDays size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No leave history found</p>
        </div>
      ) : (
        <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-slate-50">
                {['Type', 'Start Date', 'End Date', 'Days', 'Status', 'Notes'].map((h) => (
                  <th key={h} className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {allItems.map((r: any) => (
                <tr key={r.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 text-sm font-medium capitalize">{fmtType(r.type || 'ANNUAL')}</td>
                  <td className="px-4 py-3 text-sm">{new Date(r.startDate).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-sm">{new Date(r.endDate).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-sm font-bold">{r.totalDays ?? r.days}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${statusColor[r.status] || 'bg-slate-100 text-slate-600'}`}>
                      {statusIcon[r.status]} {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400">{r.reason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
};

export default EmployeeLeave;
