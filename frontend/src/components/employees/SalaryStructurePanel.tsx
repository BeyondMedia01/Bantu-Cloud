import React, { useEffect, useState } from 'react';
import { Plus, X, Check, CalendarOff, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { EmployeeSalaryStructureAPI, TransactionCodeAPI } from '../../api/client';

interface Props {
  empId: string;
}

const TYPE_BADGE: Record<string, string> = {
  EARNING:   'bg-emerald-100 text-emerald-700',
  DEDUCTION: 'bg-red-100 text-red-700',
  BENEFIT:   'bg-blue-100 text-blue-700',
};

const BLANK_FORM = {
  transactionCodeId: '',
  value: '',
  currency: 'USD',
  effectiveFrom: new Date().toISOString().slice(0, 10),
  effectiveTo: '',
  isRecurring: true,
  notes: '',
};

const SalaryStructurePanel: React.FC<Props> = ({ empId }) => {
  const [records, setRecords] = useState<any[]>([]);
  const [txCodes, setTxCodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showInactive, setShowInactive] = useState(false);


  const load = async () => {
    setLoading(true);
    try {
      const [recRes, tcRes] = await Promise.all([
        EmployeeSalaryStructureAPI.getAll(empId),
        TransactionCodeAPI.getAll(),
      ]);
      setRecords(recRes.data);
      setTxCodes(tcRes.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [empId]);

  const isActive = (r: any) => {
    const from = new Date(r.effectiveFrom);
    const now = new Date();
    if (from > now) return false;
    if (r.effectiveTo && new Date(r.effectiveTo) < now) return false;
    return true;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.transactionCodeId || !form.value || !form.effectiveFrom) {
      setError('Transaction code, value, and effective-from date are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await EmployeeSalaryStructureAPI.create(empId, {
        ...form,
        value: parseFloat(form.value),
        effectiveTo: form.effectiveTo || null,
      });
      setForm({ ...BLANK_FORM });
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const handleEndDate = async (id: string) => {
    if (!confirm('End-date this component today? It will no longer be picked up in future payroll runs.')) return;
    try {
      await EmployeeSalaryStructureAPI.endDate(empId, id);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Permanently delete this component?')) return;
    try {
      await EmployeeSalaryStructureAPI.delete(empId, id);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed.');
    }
  };

  const active = records.filter(isActive);
  const inactive = records.filter((r) => !isActive(r));
  const shown = showInactive ? records : active;

  return (
    <div className="mt-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-navy">Salary Structure</h2>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            Recurring pay components automatically included in each payroll run
          </p>
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={() => { setShowForm(true); setError(''); }}
            className="flex items-center gap-2 bg-btn-primary text-navy px-4 py-2 rounded-full font-bold text-sm hover:opacity-90 shadow"
          >
            <Plus size={14} /> Add Component
          </button>
        )}
      </div>

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleSave} className="bg-primary border border-border rounded-2xl p-5 mb-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-wider text-slate-400 mb-4">New Recurring Component</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="sm:col-span-2 lg:col-span-1">
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Transaction Code *</label>
              <select
                value={form.transactionCodeId}
                onChange={(e) => setForm((f) => ({ ...f, transactionCodeId: e.target.value }))}
                className="w-full px-3 py-2 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue"
                required
              >
                <option value="">Select code…</option>
                {txCodes.map((tc) => (
                  <option key={tc.id} value={tc.id}>
                    {tc.code} — {tc.name} ({tc.type})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Value *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">
                  {form.currency === 'USD' ? '$' : 'Z$'}
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.value}
                  onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                  placeholder="0.00"
                  className="w-full pl-8 pr-3 py-2 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Currency</label>
              <select
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                className="w-full px-3 py-2 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue"
              >
                <option value="USD">USD</option>
                <option value="ZiG">ZiG</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Effective From *</label>
              <input
                type="date"
                value={form.effectiveFrom}
                onChange={(e) => setForm((f) => ({ ...f, effectiveFrom: e.target.value }))}
                className="w-full px-3 py-2 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Effective To (leave blank for open-ended)</label>
              <input
                type="date"
                value={form.effectiveTo}
                onChange={(e) => setForm((f) => ({ ...f, effectiveTo: e.target.value }))}
                min={form.effectiveFrom}
                className="w-full px-3 py-2 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Notes</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional description…"
                className="w-full px-3 py-2 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue"
              />
            </div>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium">
              {error}
            </div>
          )}

          <div className="flex gap-3 mt-4">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 bg-btn-primary text-navy px-5 py-2 rounded-full font-bold text-sm hover:opacity-90 disabled:opacity-60"
            >
              <Check size={14} /> {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setError(''); setForm({ ...BLANK_FORM }); }}
              className="flex items-center gap-2 px-4 py-2 border border-border rounded-full font-bold text-sm text-slate-500 hover:bg-slate-50"
            >
              <X size={14} /> Cancel
            </button>
          </div>
        </form>
      )}

      {error && !showForm && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium mb-4">{error}</div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center py-8 text-slate-400 text-sm font-medium">Loading…</div>
      ) : records.length === 0 ? (
        <div className="bg-primary border border-dashed border-border rounded-2xl p-8 text-center">
          <p className="text-slate-400 text-sm font-medium">No salary components defined.</p>
          <p className="text-slate-400 text-xs mt-1">
            Components added here auto-populate each payroll run — no need to re-enter every month.
          </p>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="mt-3 text-accent-blue text-sm font-bold hover:underline"
          >
            Add first component →
          </button>
        </div>
      ) : (
        <div className="bg-primary border border-border rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-slate-50">
                <th className="text-left px-5 py-3 text-xs font-black text-slate-400 uppercase tracking-wider">Code</th>
                <th className="text-left px-5 py-3 text-xs font-black text-slate-400 uppercase tracking-wider">Type</th>
                <th className="text-left px-5 py-3 text-xs font-black text-slate-400 uppercase tracking-wider">Value</th>
                <th className="text-left px-5 py-3 text-xs font-black text-slate-400 uppercase tracking-wider hidden sm:table-cell">Effective From</th>
                <th className="text-left px-5 py-3 text-xs font-black text-slate-400 uppercase tracking-wider hidden sm:table-cell">Effective To</th>
                <th className="text-left px-5 py-3 text-xs font-black text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.map((r) => {
                const tc = r.transactionCode;
                const active = isActive(r);
                const future = new Date(r.effectiveFrom) > new Date();
                return (
                  <tr key={r.id} className={`transition-colors ${active ? 'hover:bg-slate-50/50' : 'opacity-50 hover:bg-slate-50/30'}`}>
                    <td className="px-5 py-3">
                      <p className="font-bold text-navy">{tc?.code ?? '—'}</p>
                      <p className="text-[11px] text-slate-400 font-medium">{tc?.name}</p>
                    </td>
                    <td className="px-5 py-3">
                      {tc?.type && (
                        <span className={`text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full ${TYPE_BADGE[tc.type] || 'bg-slate-100 text-slate-600'}`}>
                          {tc.type}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 font-bold text-navy">
                      {r.currency === 'USD' ? '$' : 'Z$'}{Number(r.value).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      {' '}
                      <span className="text-[11px] font-semibold text-slate-400">{r.currency}</span>
                    </td>
                    <td className="px-5 py-3 text-slate-500 font-medium hidden sm:table-cell">
                      {r.effectiveFrom.slice(0, 10)}
                    </td>
                    <td className="px-5 py-3 text-slate-500 font-medium hidden sm:table-cell">
                      {r.effectiveTo ? r.effectiveTo.slice(0, 10) : <span className="text-slate-300 text-xs">Open-ended</span>}
                    </td>
                    <td className="px-5 py-3">
                      {active ? (
                        <span className="text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                          Active
                        </span>
                      ) : future ? (
                        <span className="text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                          Future
                        </span>
                      ) : (
                        <span className="text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                          Expired
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1">
                        {(active || future) && (
                          <button
                            type="button"
                            onClick={() => handleEndDate(r.id)}
                            title="End-date today"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                          >
                            <CalendarOff size={13} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(r.id)}
                          title="Delete permanently"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {inactive.length > 0 && (
            <div className="border-t border-border px-5 py-3">
              <button
                type="button"
                onClick={() => setShowInactive((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showInactive ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                {showInactive ? 'Hide' : 'Show'} {inactive.length} expired component{inactive.length !== 1 ? 's' : ''}
              </button>
            </div>
          )}

          <div className="border-t border-border px-5 py-2.5 bg-slate-50/50">
            <p className="text-[11px] text-slate-400 font-medium">
              Active components are automatically included in payroll runs — no need to add them as manual inputs each month.
              Explicit payroll inputs for the same transaction code take precedence.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalaryStructurePanel;
