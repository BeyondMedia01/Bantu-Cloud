import React, { useEffect, useState } from 'react';
import { Plus, Trash2, X, Check, Filter, LayoutGrid, Edit2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PayrollInputAPI, EmployeeAPI, TransactionCodeAPI, PayrollAPI } from '../api/client';
import { getActiveCompanyId } from '../lib/companyContext';

const PayrollInputs: React.FC = () => {
  const navigate = useNavigate();
  const [inputs, setInputs]         = useState<any[]>([]);
  const [employees, setEmployees]   = useState<any[]>([]);
  const [txCodes, setTxCodes]       = useState<any[]>([]);
  const [runs, setRuns]             = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [editInput, setEditInput]   = useState<any>(null);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');
  const [deleteId, setDeleteId]     = useState<string | null>(null);

  // Filters
  const [filterEmployee, setFilterEmployee]   = useState('');
  const [filterRun, setFilterRun]             = useState('');
  const [filterProcessed, setFilterProcessed] = useState('');

  // New input form
  const [form, setForm] = useState({
    employeeId: '',
    payrollRunId: '',
    transactionCodeId: '',
    amount: '',
    currency: 'USD',
    period: new Date().toISOString().slice(0, 7), // YYYY-MM
  });

  const loadInputs = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filterEmployee) params.employeeId = filterEmployee;
      if (filterRun)      params.payrollRunId = filterRun;
      if (filterProcessed !== '') params.processed = filterProcessed;
      const res = await PayrollInputAPI.getAll(params);
      setInputs(res.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const loadDropdowns = async () => {
    const cid = getActiveCompanyId();
    try {
      const [empRes, txRes, runRes] = await Promise.all([
        EmployeeAPI.getAll({ limit: '500', ...(cid ? { companyId: cid } : {}) }),
        TransactionCodeAPI.getAll(),
        PayrollAPI.getAll(),
      ]);
      setEmployees((empRes.data as any).data || empRes.data);
      setTxCodes(txRes.data);
      const runData = (runRes.data as any).data || runRes.data;
      setRuns(runData.filter((r: any) => r.status !== 'COMPLETED'));
    } catch {
      // silent
    }
  };

  useEffect(() => {
    loadDropdowns();
    loadInputs();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.employeeId || !form.transactionCodeId || !form.amount || !form.period) {
      setError('Employee, transaction code, amount, and period are all required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await PayrollInputAPI.create({
        employeeId: form.employeeId,
        payrollRunId: form.payrollRunId || undefined,
        transactionCodeId: form.transactionCodeId,
        amount: parseFloat(form.amount),
        currency: form.currency,
        period: form.period,
      });
      setShowForm(false);
      setForm({ employeeId: '', payrollRunId: '', transactionCodeId: '', amount: '', currency: 'USD', period: new Date().toISOString().slice(0, 7) });
      loadInputs();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create input.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editInput) return;
    setSaving(true);
    setError('');
    try {
      await PayrollInputAPI.update(editInput.id, {
        transactionCodeId: editInput.transactionCodeId,
        amount: parseFloat(editInput.amount),
        currency: editInput.currency,
        period: editInput.period,
        payrollRunId: editInput.payrollRunId || undefined,
      });
      setEditInput(null);
      loadInputs();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update input.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await PayrollInputAPI.delete(id);
      setDeleteId(null);
      loadInputs();
    } catch (err: any) {
      setDeleteId(null);
      setError(err.response?.data?.message || 'Cannot delete a processed input.');
    }
  };

  const txCodeMap = Object.fromEntries(txCodes.map((t) => [t.id, t]));

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold">Payroll Inputs</h1>
          <p className="text-slate-500 font-medium text-sm">
            Pre-stage earnings, deductions, and benefits before processing a payroll run
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/payroll/grid')}
            className="flex items-center gap-2 border border-border px-5 py-2.5 rounded-full font-bold text-slate-600 hover:bg-slate-50 text-sm"
          >
            <LayoutGrid size={15} /> Grid View
          </button>
          {!showForm && (
            <button
              onClick={() => { setShowForm(true); setError(''); }}
              className="flex items-center gap-2 bg-btn-primary text-navy px-5 py-2.5 rounded-full font-bold shadow hover:opacity-90 text-sm"
            >
              <Plus size={15} /> Add Input
            </button>
          )}
        </div>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="bg-primary border border-border rounded-2xl p-6 shadow-sm mb-6">
          <h3 className="font-bold text-sm uppercase tracking-wider text-slate-400 mb-4">New Payroll Input</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1.5">Employee *</label>
              <select
                value={form.employeeId}
                onChange={(e) => setForm((p) => ({ ...p, employeeId: e.target.value }))}
                className="w-full px-4 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue"
                required
              >
                <option value="">Select employee…</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.firstName} {emp.lastName} {emp.employeeCode ? `(${emp.employeeCode})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1.5">Transaction Code *</label>
              <select
                value={form.transactionCodeId}
                onChange={(e) => setForm((p) => ({ ...p, transactionCodeId: e.target.value }))}
                className="w-full px-4 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue"
                required
              >
                <option value="">Select code…</option>
                {txCodes.map((t) => (
                  <option key={t.id} value={t.id}>{t.code} — {t.name} ({t.type})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1.5">Currency *</label>
              <select
                value={form.currency}
                onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))}
                className="w-full px-4 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue"
              >
                <option value="USD">USD</option>
                <option value="ZiG">ZiG</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1.5">Amount *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">
                  {form.currency === 'ZiG' ? 'Z' : '$'}
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                  placeholder="0.00"
                  className="w-full pl-8 pr-4 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1.5">Period (YYYY-MM) *</label>
              <input
                type="month"
                value={form.period}
                onChange={(e) => setForm((p) => ({ ...p, period: e.target.value }))}
                className="w-full px-4 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1.5">Link to Payroll Run (optional)</label>
              <select
                value={form.payrollRunId}
                onChange={(e) => setForm((p) => ({ ...p, payrollRunId: e.target.value }))}
                className="w-full px-4 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue"
              >
                <option value="">None (unattached)</option>
                {runs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {new Date(r.startDate).toLocaleDateString()} — {new Date(r.endDate).toLocaleDateString()} [{r.status}]
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium mb-4">{error}</div>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 bg-btn-primary text-navy px-6 py-2.5 rounded-full font-bold hover:opacity-90 disabled:opacity-60 text-sm"
            >
              <Check size={15} /> {saving ? 'Adding…' : 'Add Input'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setError(''); }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-border font-bold text-slate-500 hover:bg-slate-50 text-sm"
            >
              <X size={14} /> Cancel
            </button>
          </div>
        </form>
      )}

      {/* Filters */}
      <div className="bg-primary border border-border rounded-2xl p-4 mb-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Filter size={14} className="text-slate-400 shrink-0" />
          <select
            value={filterEmployee}
            onChange={(e) => setFilterEmployee(e.target.value)}
            className="px-3 py-2 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30"
          >
            <option value="">All employees</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>
            ))}
          </select>
          <select
            value={filterRun}
            onChange={(e) => setFilterRun(e.target.value)}
            className="px-3 py-2 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30"
          >
            <option value="">All runs</option>
            <option value="null">Unattached</option>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {new Date(r.startDate).toLocaleDateString()} [{r.status}]
              </option>
            ))}
          </select>
          <select
            value={filterProcessed}
            onChange={(e) => setFilterProcessed(e.target.value)}
            className="px-3 py-2 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30"
          >
            <option value="">All statuses</option>
            <option value="false">Unprocessed</option>
            <option value="true">Processed</option>
          </select>
          <button
            onClick={loadInputs}
            className="px-4 py-2 bg-btn-primary text-navy rounded-full text-sm font-bold hover:opacity-90"
          >
            Apply
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && !showForm && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium mb-4">{error}</div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center py-16 text-slate-400 text-sm font-medium">Loading…</div>
      ) : inputs.length === 0 ? (
        <div className="bg-primary border border-border rounded-2xl p-12 text-center shadow-sm">
          <p className="text-slate-400 font-medium text-sm">No payroll inputs found.</p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-4 text-accent-blue text-sm font-bold hover:underline"
          >
            Add the first input →
          </button>
        </div>
      ) : (
        <div className="bg-primary border border-border rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-slate-50">
                <th className="text-left px-5 py-3 text-xs font-black text-slate-400 uppercase tracking-wider">Employee</th>
                <th className="text-left px-5 py-3 text-xs font-black text-slate-400 uppercase tracking-wider">Transaction</th>
                <th className="text-left px-5 py-3 text-xs font-black text-slate-400 uppercase tracking-wider">Type</th>
                <th className="text-left px-5 py-3 text-xs font-black text-slate-400 uppercase tracking-wider">Amount</th>
                <th className="text-left px-5 py-3 text-xs font-black text-slate-400 uppercase tracking-wider">Period</th>
                <th className="text-left px-5 py-3 text-xs font-black text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {inputs.map((inp) => {
                const tc = txCodeMap[inp.transactionCodeId] || inp.transactionCode;
                return (
                  <tr key={inp.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-bold text-navy text-sm">
                        {inp.employee
                          ? `${inp.employee.firstName} ${inp.employee.lastName}`
                          : '—'}
                      </p>
                      {inp.employee?.employeeCode && (
                        <p className="text-[11px] text-slate-400 font-medium">{inp.employee.employeeCode}</p>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <p className="font-bold text-sm">{tc?.code ?? '—'}</p>
                      <p className="text-[11px] text-slate-400 font-medium">{tc?.name}</p>
                    </td>
                    <td className="px-5 py-3">
                      {tc?.type && (
                        <span className={`text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full ${
                          tc.type === 'EARNING'   ? 'bg-emerald-100 text-emerald-700' :
                          tc.type === 'DEDUCTION' ? 'bg-red-100 text-red-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {tc.type}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 font-bold text-navy">
                      ${Number(inp.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-5 py-3 text-slate-500 font-medium">{inp.period}</td>
                    <td className="px-5 py-3">
                      <span className={`text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full ${
                        inp.processed ? 'bg-slate-100 text-slate-500' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {inp.processed ? 'Processed' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setEditInput({
                              id: inp.id,
                              transactionCodeId: inp.transactionCodeId,
                              amount: String(inp.amount ?? inp.employeeUSD ?? inp.employeeZiG ?? 0),
                              currency: inp.currency || (inp.employeeZiG > 0 ? 'ZiG' : 'USD'),
                              period: inp.period,
                              payrollRunId: inp.payrollRunId || '',
                            });
                            setError('');
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-accent-blue hover:bg-blue-50 transition-colors"
                          title="Edit"
                        >
                          <Edit2 size={14} />
                        </button>
                        {deleteId === inp.id ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleDelete(inp.id)} className="px-2 py-0.5 bg-red-500 text-white rounded text-xs font-bold">Yes</button>
                            <button onClick={() => setDeleteId(null)} className="px-2 py-0.5 bg-slate-100 rounded text-xs font-bold">No</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteId(inp.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={14} />
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
      )}
      {/* Edit modal */}
      {editInput && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h3 className="text-lg font-bold">Edit Payroll Input</h3>
              <button onClick={() => { setEditInput(null); setError(''); }} className="p-1 hover:bg-slate-100 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleEdit} className="px-6 py-5 flex flex-col gap-4">
              {error && (
                <p className="text-sm text-red-500 font-medium bg-red-50 px-3 py-2 rounded-lg">{error}</p>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Transaction Code</label>
                <select
                  value={editInput.transactionCodeId}
                  onChange={(e) => setEditInput((p: any) => ({ ...p, transactionCodeId: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:border-accent-blue"
                  required
                >
                  <option value="">Select code…</option>
                  {txCodes.map((t) => (
                    <option key={t.id} value={t.id}>{t.code} — {t.name} ({t.type})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Currency</label>
                  <select
                    value={editInput.currency}
                    onChange={(e) => setEditInput((p: any) => ({ ...p, currency: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:border-accent-blue"
                  >
                    <option value="USD">USD</option>
                    <option value="ZiG">ZiG</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Amount</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">
                      {editInput.currency === 'ZiG' ? 'Z' : '$'}
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editInput.amount}
                      onChange={(e) => setEditInput((p: any) => ({ ...p, amount: e.target.value }))}
                      className="w-full pl-8 pr-4 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:border-accent-blue"
                      required
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Period</label>
                <input
                  type="month"
                  value={editInput.period}
                  onChange={(e) => setEditInput((p: any) => ({ ...p, period: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:border-accent-blue"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Link to Payroll Run (optional)</label>
                <select
                  value={editInput.payrollRunId}
                  onChange={(e) => setEditInput((p: any) => ({ ...p, payrollRunId: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:border-accent-blue"
                >
                  <option value="">None (unattached)</option>
                  {runs.map((r) => (
                    <option key={r.id} value={r.id}>
                      {new Date(r.startDate).toLocaleDateString()} — {new Date(r.endDate).toLocaleDateString()} [{r.status}]
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => { setEditInput(null); setError(''); }}
                  className="px-4 py-2 rounded-xl border border-border text-sm font-bold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2 rounded-xl bg-accent-blue text-white text-sm font-bold hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PayrollInputs;
