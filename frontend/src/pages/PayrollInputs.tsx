import React, { useEffect, useState } from 'react';
import { Plus, Trash2, X, Check, Filter, LayoutGrid, Edit2, ChevronDown } from 'lucide-react';
import { Dropdown } from '@/components/ui/dropdown';
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
    units: '',
    notes: '',
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
        units: form.units ? parseFloat(form.units) : undefined,
        notes: form.notes || undefined,
      });
      setShowForm(false);
      setForm({
        employeeId: '',
        payrollRunId: '',
        transactionCodeId: '',
        amount: '',
        currency: 'USD',
        period: new Date().toISOString().slice(0, 7),
        units: '',
        notes: '',
      });
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
        notes: editInput.notes,
        units: editInput.units !== undefined ? parseFloat(editInput.units) : undefined,
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
          <p className="text-muted-foreground font-medium text-sm">
            Pre-stage earnings, deductions, and benefits before processing a payroll run
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/payroll/grid')}
            className="flex items-center gap-1.5 border border-border px-4 py-2 rounded-full font-bold text-foreground/80 hover:bg-muted text-sm"
          >
            <LayoutGrid size={15} /> Grid View
          </button>
          {!showForm && (
            <button
              onClick={() => { setShowForm(true); setError(''); }}
              className="flex items-center gap-1.5 bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 text-sm"
            >
              <Plus size={15} /> Add Input
            </button>
          )}
        </div>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="bg-primary border border-border rounded-2xl p-6 shadow-sm mb-6">
          <h2 className="font-bold text-sm uppercase tracking-wider text-muted-foreground mb-4">New Payroll Input</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-bold text-foreground/80 mb-1.5">Employee *</label>
              <Dropdown className="w-full" trigger={(isOpen) => (
                <button type="button" className="w-full px-4 py-2.5 border border-border rounded-xl text-sm font-medium flex items-center justify-between hover:border-accent-green transition-colors">
                  <span className="truncate">{employees.find(e => e.id === form.employeeId) ? `${employees.find(e => e.id === form.employeeId).firstName} ${employees.find(e => e.id === form.employeeId).lastName}` : 'Select employee…'}</span>
                  <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
              )} sections={[{ items: [
                { label: 'Select employee…', onClick: () => setForm(p => ({ ...p, employeeId: '' })) },
                ...employees.map(emp => ({ label: `${emp.firstName} ${emp.lastName}${emp.employeeCode ? ` (${emp.employeeCode})` : ''}`, onClick: () => setForm(p => ({ ...p, employeeId: emp.id })) })),
              ], emptyMessage: 'No employees' }]} />
            </div>

            <div>
              <label className="block text-sm font-bold text-foreground/80 mb-1.5">Transaction Code *</label>
              <Dropdown className="w-full" trigger={(isOpen) => (
                <button type="button" className="w-full px-4 py-2.5 border border-border rounded-xl text-sm font-medium flex items-center justify-between hover:border-accent-green transition-colors">
                  <span className="truncate">{txCodes.find(t => t.id === form.transactionCodeId) ? `${txCodes.find(t => t.id === form.transactionCodeId).code} — ${txCodes.find(t => t.id === form.transactionCodeId).name}` : 'Select code…'}</span>
                  <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
              )} sections={[{ items: [
                { label: 'Select code…', onClick: () => setForm(p => ({ ...p, transactionCodeId: '' })) },
                ...txCodes.map(t => ({ label: `${t.code} — ${t.name} (${t.type})`, onClick: () => setForm(p => ({ ...p, transactionCodeId: t.id })) })),
              ], emptyMessage: 'No codes' }]} />
            </div>

            <div>
              <label className="block text-sm font-bold text-foreground/80 mb-1.5">Currency *</label>
              <Dropdown className="w-full" trigger={(isOpen) => (
                <button type="button" className="w-full px-4 py-2.5 border border-border rounded-xl text-sm font-medium flex items-center justify-between hover:border-accent-green transition-colors">
                  <span>{form.currency}</span>
                  <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
              )} sections={[{ items: [
                { label: 'USD', onClick: () => setForm(p => ({ ...p, currency: 'USD' })) },
                { label: 'ZiG', onClick: () => setForm(p => ({ ...p, currency: 'ZiG' })) },
              ]}]} />
            </div>

            <div>
              <label className="block text-sm font-bold text-foreground/80 mb-1.5">Amount *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-bold">
                  {form.currency === 'ZiG' ? 'Z' : '$'}
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                  placeholder="0.00"
                  className="w-full pl-8 pr-4 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/30 focus:border-accent-green"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-foreground/80 mb-1.5">Period (YYYY-MM) *</label>
              <input
                type="month"
                value={form.period}
                onChange={(e) => setForm((p) => ({ ...p, period: e.target.value }))}
                className="w-full px-4 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/30 focus:border-accent-green"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-foreground/80 mb-1.5">Link to Payroll Run (optional)</label>
              <Dropdown className="w-full" trigger={(isOpen) => (
                <button type="button" className="w-full px-4 py-2.5 border border-border rounded-xl text-sm font-medium flex items-center justify-between hover:border-accent-green transition-colors">
                  <span className="truncate">{runs.find(r => r.id === form.payrollRunId) ? `${new Date(runs.find(r => r.id === form.payrollRunId).startDate).toLocaleDateString()} — ${new Date(runs.find(r => r.id === form.payrollRunId).endDate).toLocaleDateString()}` : 'None (unattached)'}</span>
                  <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
              )} sections={[{ items: [
                { label: 'None (unattached)', onClick: () => setForm(p => ({ ...p, payrollRunId: '' })) },
                ...runs.map(r => ({ label: `${new Date(r.startDate).toLocaleDateString()} — ${new Date(r.endDate).toLocaleDateString()} [${r.status}]`, onClick: () => setForm(p => ({ ...p, payrollRunId: r.id })) })),
              ]}]} />
            </div>

            <div>
              <label className="block text-sm font-bold text-foreground/80 mb-1.5">Units (e.g. Hours)</label>
              <input
                type="number"
                step="0.01"
                value={form.units}
                onChange={(e) => setForm((p) => ({ ...p, units: e.target.value }))}
                className="w-full px-4 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/30 focus:border-accent-green"
                placeholder="0.00"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-sm font-bold text-foreground/80 mb-1.5">Notes / Description</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                className="w-full px-4 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/30 focus:border-accent-green"
                placeholder="e.g. Manual overtime entry"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium mb-4">{error}</div>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 bg-brand text-navy px-4 py-2 rounded-full font-bold hover:opacity-90 disabled:opacity-60 text-sm"
            >
              <Check size={15} /> {saving ? 'Adding…' : 'Add Input'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setError(''); }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-border font-bold text-muted-foreground hover:bg-muted text-sm"
            >
              <X size={14} /> Cancel
            </button>
          </div>
        </form>
      )}

      {/* Filters */}
      <div className="bg-primary border border-border rounded-2xl p-4 mb-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Filter size={14} className="text-muted-foreground shrink-0" />
          <Dropdown trigger={(isOpen) => (
            <button type="button" className="flex items-center gap-2 px-3 py-2 border border-border rounded-xl text-sm font-medium hover:border-accent-green transition-colors bg-primary">
              <span>{filterEmployee ? (employees.find(e => e.id === filterEmployee)?.firstName + ' ' + employees.find(e => e.id === filterEmployee)?.lastName) : 'All employees'}</span>
              <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
          )} sections={[{ items: [
            { label: 'All employees', onClick: () => setFilterEmployee('') },
            ...employees.map(emp => ({ label: `${emp.firstName} ${emp.lastName}`, onClick: () => setFilterEmployee(emp.id) }))
          ]}]} />
          <Dropdown trigger={(isOpen) => (
            <button type="button" className="flex items-center gap-2 px-3 py-2 border border-border rounded-xl text-sm font-medium hover:border-accent-green transition-colors bg-primary">
              <span>{filterRun === '' ? 'All runs' : filterRun === 'null' ? 'Unattached' : (() => { const r = runs.find(r => r.id === filterRun); return r ? `${new Date(r.startDate).toLocaleDateString()} [${r.status}]` : 'All runs'; })()}</span>
              <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
          )} sections={[{ items: [
            { label: 'All runs', onClick: () => setFilterRun('') },
            { label: 'Unattached', onClick: () => setFilterRun('null') },
            ...runs.map(r => ({ label: `${new Date(r.startDate).toLocaleDateString()} [${r.status}]`, onClick: () => setFilterRun(r.id) }))
          ]}]} />
          <Dropdown trigger={(isOpen) => (
            <button type="button" className="flex items-center gap-2 px-3 py-2 border border-border rounded-xl text-sm font-medium hover:border-accent-green transition-colors bg-primary">
              <span>{filterProcessed === '' ? 'All statuses' : filterProcessed === 'false' ? 'Unprocessed' : 'Processed'}</span>
              <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
          )} sections={[{ items: [
            { label: 'All statuses', onClick: () => setFilterProcessed('') },
            { label: 'Unprocessed', onClick: () => setFilterProcessed('false') },
            { label: 'Processed', onClick: () => setFilterProcessed('true') },
          ]}]} />
          <button
            onClick={loadInputs}
            className="px-4 py-2 bg-brand text-navy rounded-full text-sm font-bold hover:opacity-90"
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
        <div className="text-center py-16 text-muted-foreground text-sm font-medium">Loading…</div>
      ) : inputs.length === 0 ? (
        <div className="bg-primary border border-border rounded-2xl p-12 text-center shadow-sm">
          <p className="text-muted-foreground font-medium text-sm">No payroll inputs found.</p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-4 text-accent-green text-sm font-bold hover:underline"
          >
            Add the first input →
          </button>
        </div>
      ) : (
        <div className="bg-primary border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="text-left px-5 py-3 text-xs font-black text-muted-foreground uppercase tracking-wider">Employee</th>
                <th className="text-left px-5 py-3 text-xs font-black text-muted-foreground uppercase tracking-wider">Transaction</th>
                <th className="text-left px-5 py-3 text-xs font-black text-muted-foreground uppercase tracking-wider">Type</th>
                <th className="text-left px-5 py-3 text-xs font-black text-muted-foreground uppercase tracking-wider">Amount</th>
                <th className="text-left px-5 py-3 text-xs font-black text-muted-foreground uppercase tracking-wider">Units</th>
                <th className="text-left px-5 py-3 text-xs font-black text-muted-foreground uppercase tracking-wider">Period</th>
                <th className="text-left px-5 py-3 text-xs font-black text-muted-foreground uppercase tracking-wider">Notes</th>
                <th className="text-left px-5 py-3 text-xs font-black text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {inputs.map((inp) => {
                const tc = txCodeMap[inp.transactionCodeId] || inp.transactionCode;
                return (
                  <tr key={inp.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-bold text-navy text-sm">
                        {inp.employee
                          ? `${inp.employee.firstName} ${inp.employee.lastName}`
                          : '—'}
                      </p>
                      {inp.employee?.employeeCode && (
                        <p className="text-[11px] text-muted-foreground font-medium">{inp.employee.employeeCode}</p>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <p className="font-bold text-sm">{tc?.code ?? '—'}</p>
                      <p className="text-[11px] text-muted-foreground font-medium">{tc?.name}</p>
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
                    <td className="px-5 py-3 text-muted-foreground font-bold">
                      {inp.units !== null && inp.units !== undefined ? (
                        <span>{Number(inp.units).toFixed(2)} <span className="text-[10px] text-muted-foreground font-medium">hrs</span></span>
                      ) : '—'}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground font-medium">{inp.period}</td>
                    <td className="px-5 py-3 text-[11px] text-muted-foreground italic max-w-[150px] truncate" title={inp.notes}>
                      {inp.notes || '—'}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full ${
                        inp.processed ? 'bg-muted text-muted-foreground' : 'bg-amber-100 text-amber-700'
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
                              notes: inp.notes || '',
                              units: inp.units !== null && inp.units !== undefined ? String(inp.units) : '',
                              payrollRunId: inp.payrollRunId || '',
                            });
                            setError('');
                          }}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-accent-green hover:bg-blue-50 transition-colors"
                          title="Edit"
                        >
                          <Edit2 size={14} />
                        </button>
                        {deleteId === inp.id ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleDelete(inp.id)} className="px-2 py-0.5 bg-red-500 text-white rounded text-xs font-bold">Yes</button>
                            <button onClick={() => setDeleteId(null)} className="px-2 py-0.5 bg-muted rounded text-xs font-bold">No</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteId(inp.id)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
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
        </div>
      )}
      {/* Edit modal */}
      {editInput && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div role="dialog" aria-modal="true" aria-labelledby="edit-payroll-input-title" className="bg-card rounded-2xl shadow-2xl w-full max-w-lg mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h3 id="edit-payroll-input-title" className="text-lg font-bold">Edit Payroll Input</h3>
              <button onClick={() => { setEditInput(null); setError(''); }} aria-label="Close" className="p-1 hover:bg-muted rounded-lg">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleEdit} className="px-6 py-5 flex flex-col gap-4">
              {error && (
                <p className="text-sm text-red-500 font-medium bg-red-50 px-3 py-2 rounded-lg">{error}</p>
              )}

              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Transaction Code</label>
                <Dropdown className="w-full" trigger={(isOpen) => (
                  <button type="button" className="w-full flex items-center justify-between px-4 py-2.5 border border-border rounded-xl text-sm font-medium hover:border-accent-green transition-colors bg-primary">
                    <span className="truncate">{editInput.transactionCodeId ? (txCodes.find(t => t.id === editInput.transactionCodeId) ? `${txCodes.find(t => t.id === editInput.transactionCodeId)!.code} — ${txCodes.find(t => t.id === editInput.transactionCodeId)!.name}` : 'Select code…') : 'Select code…'}</span>
                    <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                )} sections={[{ items: txCodes.map(t => ({ label: `${t.code} — ${t.name} (${t.type})`, onClick: () => setEditInput((p: any) => ({ ...p, transactionCodeId: t.id })) })) }]} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Currency</label>
                  <Dropdown className="w-full" trigger={(isOpen) => (
                    <button type="button" className="w-full flex items-center justify-between px-4 py-2.5 border border-border rounded-xl text-sm font-medium hover:border-accent-green transition-colors bg-primary">
                      <span>{editInput.currency}</span>
                      <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                  )} sections={[{ items: [
                    { label: 'USD', onClick: () => setEditInput((p: any) => ({ ...p, currency: 'USD' })) },
                    { label: 'ZiG', onClick: () => setEditInput((p: any) => ({ ...p, currency: 'ZiG' })) },
                  ]}]} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Amount</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-bold">
                      {editInput.currency === 'ZiG' ? 'Z' : '$'}
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editInput.amount}
                      onChange={(e) => setEditInput((p: any) => ({ ...p, amount: e.target.value }))}
                      className="w-full pl-8 pr-4 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:border-accent-green"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Units (Hours)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editInput.units}
                    onChange={(e) => setEditInput((p: any) => ({ ...p, units: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:border-accent-green"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Period</label>
                  <input
                    type="month"
                    value={editInput.period}
                    onChange={(e) => setEditInput((p: any) => ({ ...p, period: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:border-accent-green"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Notes</label>
                <input
                  type="text"
                  value={editInput.notes}
                  onChange={(e) => setEditInput((p: any) => ({ ...p, notes: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:border-accent-green"
                  placeholder="e.g. OT Multiplier details"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Link to Payroll Run (optional)</label>
                <Dropdown className="w-full" trigger={(isOpen) => {
                  const r = runs.find(r => r.id === editInput.payrollRunId);
                  const label = r ? `${new Date(r.startDate).toLocaleDateString()} — ${new Date(r.endDate).toLocaleDateString()} [${r.status}]` : 'None (unattached)';
                  return (
                    <button type="button" className="w-full flex items-center justify-between px-4 py-2.5 border border-border rounded-xl text-sm font-medium hover:border-accent-green transition-colors bg-primary">
                      <span className="truncate">{label}</span>
                      <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                  );
                }} sections={[{ items: [
                  { label: 'None (unattached)', onClick: () => setEditInput((p: any) => ({ ...p, payrollRunId: '' })) },
                  ...runs.map(r => ({ label: `${new Date(r.startDate).toLocaleDateString()} — ${new Date(r.endDate).toLocaleDateString()} [${r.status}]`, onClick: () => setEditInput((p: any) => ({ ...p, payrollRunId: r.id })) }))
                ]}]} />
              </div>

              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => { setEditInput(null); setError(''); }}
                  className="px-4 py-2 rounded-xl border border-border text-sm font-bold hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2 rounded-xl bg-accent-green text-white text-sm font-bold hover:opacity-90 disabled:opacity-50"
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
