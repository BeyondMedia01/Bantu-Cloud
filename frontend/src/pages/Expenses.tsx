import React, { useEffect, useState } from 'react';
import { Receipt, Plus, X, CheckCircle2, XCircle, ExternalLink, ChevronDown } from 'lucide-react';
import { ExpenseAPI } from '../api/client';
import { useToast } from '../context/ToastContext';
import { usePermissions } from '../hooks/usePermissions';
import SkeletonTable from '../components/common/SkeletonTable';
import { EmptyState } from '@/components/ui/empty-state';
import { Dropdown } from '@/components/ui/dropdown';
import type { Expense, ExpenseCategory } from '../types/domain';

const STATUS_OPTIONS = ['', 'PENDING', 'APPROVED', 'REJECTED', 'PAID'] as const;
const STATUS_LABELS: Record<string, string> = { '': 'All', PENDING: 'Pending', APPROVED: 'Approved', REJECTED: 'Rejected', PAID: 'Paid' };
const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  APPROVED: 'bg-emerald-50 text-emerald-700',
  REJECTED: 'bg-red-50 text-red-700',
  PAID: 'bg-blue-50 text-blue-700',
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

  const [tab, setTab] = useState<'expenses' | 'categories'>('expenses');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showNewCat, setShowNewCat] = useState(false);
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

  // New category form (placeholder — API endpoint may not exist)
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [expRes, catRes] = await Promise.all([
        ExpenseAPI.getAll({ ...(filter && { status: filter }) }),
        ExpenseAPI.getCategories(),
      ]);
      setExpenses(expRes.data.data ?? []);
      setCategories(catRes.data.data ?? []);
    } catch {
      showToast('Failed to load expenses', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    setLoading(true);
    try {
      const res = await ExpenseAPI.getCategories();
      setCategories(res.data.data);
    } catch {
      showToast('Failed to load categories', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'expenses') load();
    else loadCategories();
  }, [tab, filter]);

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

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    showToast('Category management not available via this interface', 'error');
  };

  const resetForm = () => {
    setFormEmployee(''); setFormCategory(''); setFormAmount('');
    setFormCurrency('USD'); setFormDesc(''); setFormReceipt(''); setFormNotes('');
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Expenses</h1>
          <p className="text-muted-foreground font-medium text-sm">Manage and approve employee expense claims</p>
        </div>
        {can('EXPENSES', 'EDIT') && tab === 'expenses' && (
          <button onClick={() => setShowNew(true)} className="bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 flex items-center gap-1.5">
            <Plus size={18} /> New Expense
          </button>
        )}
        {can('EXPENSES', 'EDIT') && tab === 'categories' && (
          <button onClick={() => setShowNewCat(true)} className="bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 flex items-center gap-1.5">
            <Plus size={18} /> New Category
          </button>
        )}
      </header>

      {/* Sub-navigation tabs */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {[{ key: 'expenses', label: 'Expenses' }, { key: 'categories', label: 'Categories' }].map(t => {
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key as 'expenses' | 'categories')}
              className={`px-4 py-2.5 text-sm font-bold transition-colors border-b-2 -mb-px ${active ? 'border-navy text-navy' : 'border-transparent text-muted-foreground hover:text-navy'}`}>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Expenses tab */}
      {tab === 'expenses' && (
        <>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Filters</p>
              {filter && <button onClick={() => setFilter('')} className="text-xs font-bold text-muted-foreground hover:text-red-500 px-3 py-1.5 rounded-full border border-border hover:border-red-200 hover:bg-red-50 transition-colors">× Clear filters</button>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <Dropdown
                trigger={(isOpen) => (
                  <button className="w-full bg-primary border border-border rounded-2xl px-4 py-3 text-sm font-medium shadow-sm flex items-center justify-between hover:border-accent-green transition-colors">
                    <span className="truncate">{STATUS_LABELS[filter] || 'All'}</span>
                    <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                )}
                sections={[{ items: STATUS_OPTIONS.map(s => ({ label: STATUS_LABELS[s], onClick: () => setFilter(s) })) }]}
              />
            </div>
          </div>

          <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
            {loading ? <SkeletonTable headers={["", "", "", "", "", "", ""]} rows={6} /> : expenses.length === 0 ? (
              <EmptyState variant="no-data" icon={Receipt} title="No expenses found"
                description={filter ? `No expenses with status "${STATUS_LABELS[filter]}".` : 'No expenses have been submitted yet.'}
                action={can('EXPENSES', 'EDIT') ? { label: 'New Expense', onClick: () => setShowNew(true) } : undefined} />
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted border-b border-border">
                  <tr>
                    <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Employee</th>
                    <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Category</th>
                    <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Amount</th>
                    <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Description</th>
                    <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Date</th>
                    <th className="px-5 py-4 text-right text-xs font-bold text-muted-foreground uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {expenses.map((exp) => (
                    <tr key={exp.id} className="hover:bg-muted/70 transition-colors">
                      <td className="px-5 py-4 font-medium text-navy">
                        {exp.employee?.firstName} {exp.employee?.lastName}
                        {exp.employee?.employeeCode && <span className="text-xs text-muted-foreground ml-1">({exp.employee.employeeCode})</span>}
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">{exp.category?.name}</td>
                      <td className="px-5 py-4 font-medium text-navy">{fmtCurrency(exp.amount, exp.currency)}</td>
                      <td className="px-5 py-4 text-muted-foreground max-w-[200px] truncate">{exp.description}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ${STATUS_COLORS[exp.status]}`}>
                          {STATUS_LABELS[exp.status]}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">{fmtDate(exp.createdAt)}</td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {exp.receiptUrl && (
                            <a href={exp.receiptUrl} target="_blank" rel="noopener noreferrer"
                              className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-navy transition-colors" title="View receipt">
                              <ExternalLink size={15} />
                            </a>
                          )}
                          {can('EXPENSES', 'APPROVE') && exp.status === 'PENDING' && (
                            <>
                              <button onClick={() => handleApprove(exp.id)} disabled={!!actionLoading}
                                className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-emerald-600 transition-colors" title="Approve">
                                <CheckCircle2 size={15} />
                              </button>
                              <button onClick={() => setRejectTarget(exp)}
                                className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-red-500 transition-colors" title="Reject">
                                <XCircle size={15} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* Categories tab */}
      {tab === 'categories' && (
        <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
          {loading ? <SkeletonTable headers={["", "", ""]} rows={6} /> : categories.length === 0 ? (
            <EmptyState variant="no-data" icon={Receipt} title="No categories" description="Create expense categories to organise claims."
              action={can('EXPENSES', 'EDIT') ? { label: 'New Category', onClick: () => setShowNewCat(true) } : undefined} />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Name</th>
                  <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {categories.map(c => (
                  <tr key={c.id} className="hover:bg-muted/70 transition-colors">
                    <td className="px-5 py-4 font-medium text-navy">{c.name}</td>
                    <td className="px-5 py-4 text-muted-foreground">{c.description || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* New Expense modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-primary rounded-2xl shadow-xl w-full max-w-lg flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-lg font-bold text-navy">New Expense</h2>
              <button onClick={() => { setShowNew(false); resetForm(); }} className="p-2 hover:bg-muted rounded-lg text-muted-foreground"><X size={18} /></button>
            </div>
            <form onSubmit={handleCreate} className="p-6 flex flex-col gap-4 overflow-y-auto max-h-[70vh]">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Employee ID *</span>
                <input value={formEmployee} onChange={e => setFormEmployee(e.target.value)} required placeholder="Employee ID"
                  className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Category *</span>
                <select value={formCategory} onChange={e => setFormCategory(e.target.value)} required
                  className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green">
                  <option value="">Select category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Amount *</span>
                  <input type="number" step="0.01" min="0.01" value={formAmount} onChange={e => setFormAmount(e.target.value)} required placeholder="0.00"
                    className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green" />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Currency</span>
                  <select value={formCurrency} onChange={e => setFormCurrency(e.target.value)}
                    className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green">
                    <option value="USD">USD ($)</option>
                    <option value="ZWL">ZWL (ZWL$)</option>
                    <option value="ZAR">ZAR (R)</option>
                  </select>
                </label>
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Description *</span>
                <input value={formDesc} onChange={e => setFormDesc(e.target.value)} required placeholder="What is this expense for?"
                  className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Receipt URL</span>
                <input type="url" value={formReceipt} onChange={e => setFormReceipt(e.target.value)} placeholder="https://..."
                  className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Notes</span>
                <textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={2} placeholder="Optional notes"
                  className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green" />
              </label>
            </form>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
              <button onClick={() => { setShowNew(false); resetForm(); }} className="px-4 py-2 rounded-full border border-border text-sm font-bold hover:bg-muted transition-colors">Cancel</button>
              <button onClick={handleCreate as any} disabled={submitting} className="bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 flex items-center gap-1.5">
                <Plus size={16} /> {submitting ? 'Creating...' : 'Create Expense'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Category modal */}
      {showNewCat && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-primary rounded-2xl shadow-xl w-full max-w-md flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-lg font-bold text-navy">New Category</h2>
              <button onClick={() => setShowNewCat(false)} className="p-2 hover:bg-muted rounded-lg text-muted-foreground"><X size={18} /></button>
            </div>
            <form onSubmit={handleCreateCategory} className="p-6 flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Name *</span>
                <input value={catName} onChange={e => setCatName(e.target.value)} required placeholder="e.g. Travel"
                  className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Description</span>
                <textarea value={catDesc} onChange={e => setCatDesc(e.target.value)} rows={2}
                  className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green" />
              </label>
            </form>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
              <button onClick={() => setShowNewCat(false)} className="px-4 py-2 rounded-full border border-border text-sm font-bold hover:bg-muted transition-colors">Cancel</button>
              <button onClick={handleCreateCategory as any} disabled={submitting} className="bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 flex items-center gap-1.5">
                <Plus size={16} /> {submitting ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {rejectTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-primary rounded-2xl shadow-xl w-full max-w-sm flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-lg font-bold text-navy">Reject Expense</h2>
              <button onClick={() => { setRejectTarget(null); setRejectReason(''); }} className="p-2 hover:bg-muted rounded-lg text-muted-foreground"><X size={18} /></button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                {rejectTarget.employee?.firstName} {rejectTarget.employee?.lastName} &mdash; {fmtCurrency(rejectTarget.amount, rejectTarget.currency)} for {rejectTarget.description}
              </p>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Reason (optional)</span>
                <input value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Reason for rejection"
                  className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green" />
              </label>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
              <button onClick={() => { setRejectTarget(null); setRejectReason(''); }} className="px-4 py-2 rounded-full border border-border text-sm font-bold hover:bg-muted transition-colors">Cancel</button>
              <button onClick={handleReject} disabled={!!actionLoading}
                className="bg-red-600 text-white px-4 py-2 rounded-full font-bold shadow hover:bg-red-700 flex items-center gap-1.5">
                <XCircle size={16} /> {actionLoading ? 'Rejecting...' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Expenses;
