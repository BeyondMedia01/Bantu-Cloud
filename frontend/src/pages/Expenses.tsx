import React, { useEffect, useState, useRef } from 'react';
import { Receipt, Plus, CheckCircle2, XCircle, Loader, ExternalLink } from 'lucide-react';
import { ExpenseAPI } from '../api/client';
import { useToast } from '../context/ToastContext';
import { usePermissions } from '../hooks/usePermissions';
import { getActiveCompanyId } from '../lib/companyContext';
import { EmptyState } from '@/components/ui/empty-state';
import SkeletonTable from '../components/common/SkeletonTable';
import type { Expense, ExpenseCategory } from '../types/domain';

const STATUS_OPTIONS = ['', 'PENDING', 'APPROVED', 'REJECTED', 'PAID'] as const;
const STATUS_LABELS: Record<string, string> = { '': 'All', PENDING: 'Pending', APPROVED: 'Approved', REJECTED: 'Rejected', PAID: 'Paid' };
const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  APPROVED: 'bg-teal-50 text-teal-700 border-teal-200',
  REJECTED: 'bg-red-50 text-red-600 border-red-200',
  PAID: 'bg-blue-50 text-blue-700 border-blue-200',
};
const CURRENCY_SYMBOLS: Record<string, string> = { USD: '$', ZWL: 'ZWL$', ZAR: 'R' };

const fmtCurrency = (amount: number, currency = 'USD') => {
  const sym = CURRENCY_SYMBOLS[currency] || currency;
  return `${sym}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const Expenses: React.FC = () => {
  const { showToast } = useToast();
  const { can } = usePermissions();
  const companyId = getActiveCompanyId();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<Expense | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // New expense form
  const [formEmployee, setFormEmployee] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formCurrency, setFormCurrency] = useState('USD');
  const [formDesc, setFormDesc] = useState('');
  const [formReceipt, setFormReceipt] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);

  const load = async () => {
    try {
      const [expRes, catRes] = await Promise.all([
        ExpenseAPI.getAll({ ...(filter && { status: filter }) }),
        ExpenseAPI.getCategories(),
      ]);
      setExpenses(expRes.data.data);
      setCategories(catRes.data.data);
    } catch {
      showToast('Failed to load expenses', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filter]);

  const handleApprove = async (id: string) => {
    setActionLoading('approve-' + id);
    try {
      await ExpenseAPI.approve(id);
      showToast('Expense approved', 'success');
      load();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to approve', 'error');
    } finally {
      setActionLoading('');
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    setActionLoading('reject-' + rejectTarget.id);
    try {
      await ExpenseAPI.reject(rejectTarget.id, rejectReason);
      showToast('Expense rejected', 'success');
      setRejectTarget(null);
      setRejectReason('');
      load();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to reject', 'error');
    } finally {
      setActionLoading('');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formEmployee || !formCategory || !formAmount || !formDesc) return;
    setSubmitting(true);
    try {
      await ExpenseAPI.create({
        employeeId: formEmployee,
        categoryId: formCategory,
        amount: parseFloat(formAmount),
        currency: formCurrency,
        description: formDesc,
        receiptUrl: formReceipt || undefined,
        notes: formNotes || undefined,
      });
      showToast('Expense created', 'success');
      setShowNew(false);
      resetForm();
      load();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to create expense', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormEmployee(''); setFormCategory(''); setFormAmount('');
    setFormCurrency('USD'); setFormDesc(''); setFormReceipt(''); setFormNotes('');
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Receipt size={28} className="text-navy" />
          <h1 className="text-2xl font-semibold text-navy">Expenses</h1>
        </div>
        {can('EXPENSES', 'EDIT') && (
          <button onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 bg-brand text-navy px-4 py-2 rounded-full text-sm font-bold shadow hover:opacity-90">
            <Plus size={16} /> New Expense
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-6">
        {STATUS_OPTIONS.map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all border ${
              filter === s ? 'bg-brand text-navy border-navy' : 'border-border text-muted-foreground hover:bg-muted'
            }`}>
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonTable headers={['Employee', 'Category', 'Amount', 'Description', 'Status', 'Date', 'Actions']} />
      ) : expenses.length === 0 ? (
        <EmptyState variant="no-data" icon={Receipt} title="No expenses found"
          description={filter ? `No expenses with status "${STATUS_LABELS[filter]}".` : 'No expenses have been submitted yet.'}
          action={can('EXPENSES', 'EDIT') ? { label: 'New Expense', onClick: () => setShowNew(true) } : undefined} />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {expenses.map((exp) => (
                <tr key={exp.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {exp.employee?.firstName} {exp.employee?.lastName}
                    {exp.employee?.employeeCode && <span className="text-xs text-slate-400 ml-1">({exp.employee.employeeCode})</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{exp.category?.name}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{fmtCurrency(exp.amount, exp.currency)}</td>
                  <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate">{exp.description}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${STATUS_COLORS[exp.status]}`}>
                      {STATUS_LABELS[exp.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{fmtDate(exp.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {exp.receiptUrl && (
                        <a href={exp.receiptUrl} target="_blank" rel="noopener noreferrer"
                          className="p-1.5 text-slate-400 hover:text-navy rounded-lg hover:bg-slate-100 transition-colors"
                          title="View receipt">
                          <ExternalLink size={14} />
                        </a>
                      )}
                      {can('EXPENSES', 'APPROVE') && exp.status === 'PENDING' && (
                        <>
                          <button onClick={() => handleApprove(exp.id)} disabled={!!actionLoading}
                            className="text-xs font-bold px-2.5 py-1 bg-teal-50 text-teal-700 rounded-full hover:bg-teal-100 disabled:opacity-60 flex items-center gap-1">
                            {actionLoading === 'approve-' + exp.id ? <Loader size={10} className="animate-spin" /> : <CheckCircle2 size={11} />}
                            Approve
                          </button>
                          <button onClick={() => setRejectTarget(exp)}
                            className="text-xs font-bold px-2.5 py-1 bg-red-50 text-red-600 rounded-full hover:bg-red-100 flex items-center gap-1">
                            <XCircle size={11} /> Reject
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setShowNew(false); resetForm(); }} />
          <div className="relative bg-card rounded-2xl shadow-xl border border-border w-full max-w-lg p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <h2 className="font-bold text-navy text-lg">New Expense</h2>
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Employee *</label>
                <input type="text" value={formEmployee} onChange={(e) => setFormEmployee(e.target.value)}
                  placeholder="Employee ID" required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy/20" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Category *</label>
                <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)} required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy/20">
                  <option value="">Select category</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Amount *</label>
                  <input type="number" step="0.01" min="0.01" value={formAmount} onChange={(e) => setFormAmount(e.target.value)}
                    placeholder="0.00" required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy/20" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Currency</label>
                  <select value={formCurrency} onChange={(e) => setFormCurrency(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy/20">
                    <option value="USD">USD ($)</option>
                    <option value="ZWL">ZWL (ZWL$)</option>
                    <option value="ZAR">ZAR (R)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Description *</label>
                <input type="text" value={formDesc} onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="What is this expense for?" required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy/20" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Receipt URL</label>
                <input type="url" value={formReceipt} onChange={(e) => setFormReceipt(e.target.value)}
                  placeholder="https://..." 
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy/20" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Notes</label>
                <textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={2}
                  placeholder="Optional notes"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy/20" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => { setShowNew(false); resetForm(); }}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={submitting}
                  className="px-4 py-2 text-sm font-bold text-navy bg-brand rounded-lg hover:opacity-90 transition-all disabled:opacity-60 flex items-center gap-1.5">
                  {submitting && <Loader size={14} className="animate-spin" />}
                  {submitting ? 'Creating...' : 'Create Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setRejectTarget(null); setRejectReason(''); }} />
          <div className="relative bg-card rounded-2xl shadow-xl border border-border w-full max-w-sm p-6 flex flex-col gap-4">
            <h2 className="font-bold text-navy">Reject Expense</h2>
            <p className="text-sm text-muted-foreground">
              {rejectTarget.employee?.firstName} {rejectTarget.employee?.lastName} &mdash; {fmtCurrency(rejectTarget.amount, rejectTarget.currency)} for {rejectTarget.description}
            </p>
            <input type="text" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection (optional)"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy/20" />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setRejectTarget(null); setRejectReason(''); }}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors">
                Cancel
              </button>
              <button onClick={handleReject} disabled={!!actionLoading}
                className="px-4 py-2 text-sm font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-all disabled:opacity-60 flex items-center gap-1.5">
                {actionLoading === 'reject-' + rejectTarget.id && <Loader size={14} className="animate-spin" />}
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Expenses;
