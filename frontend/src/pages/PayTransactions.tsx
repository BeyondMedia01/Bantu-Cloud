import React, { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, Search, X, Loader } from 'lucide-react';
import { TransactionCodeAPI } from '../api/client';
import { useToast } from '../context/ToastContext';

const TYPES = ['EARNING', 'BENEFIT', 'DEDUCTION'];
const CALC_TYPES = ['fixed', 'percentage', 'formula'];

const emptyForm = {
  code: '',
  name: '',
  type: 'EARNING',
  calculationType: 'fixed',
  defaultValue: '',
  preTax: false,
  taxable: true,
  affectsPaye: true,
  affectsNssa: true,
  isActive: true,
  incomeCategory: null,
};

const PayTransactions: React.FC<{ activeCompanyId?: string | null }> = ({ activeCompanyId }) => {
  const { showToast } = useToast();
  const [codes, setCodes] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; tc?: any } | null>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetch = async () => {
    try {
      const res = await TransactionCodeAPI.getAll();
      setCodes(res.data);
    } catch {}
  };

  useEffect(() => {
    if (activeCompanyId) fetch();
  }, [activeCompanyId]);

  const openCreate = () => {
    setForm(emptyForm);
    setError('');
    setModal({ mode: 'create' });
  };

  const openEdit = (tc: any) => {
    setForm({
      code: tc.code,
      name: tc.name,
      type: tc.type,
      calculationType: tc.calculationType || 'fixed',
      defaultValue: tc.defaultValue ?? '',
      preTax: tc.preTax ?? false,
      taxable: tc.taxable ?? true,
      affectsPaye: tc.affectsPaye ?? true,
      affectsNssa: tc.affectsNssa ?? true,
      isActive: tc.isActive ?? true,
      incomeCategory: tc.incomeCategory ?? null,
    });
    setError('');
    setModal({ mode: 'edit', tc });
  };

  const closeModal = () => { setModal(null); setError(''); };

  const handleSave = async () => {
    if (!form.code.trim() || !form.name.trim()) { setError('Code and Name are required.'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        defaultValue: form.defaultValue !== '' ? parseFloat(form.defaultValue) : null,
      };
      if (modal?.mode === 'create') {
        await TransactionCodeAPI.create(payload);
      } else {
        // code is immutable after creation — only send editable fields
        const { code: _code, ...editPayload } = payload;
        await TransactionCodeAPI.update(modal!.tc.id, editPayload);
      }
      await fetch();
      closeModal();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await TransactionCodeAPI.delete(id);
      setCodes(c => c.filter(x => x.id !== id));
    } catch (e: any) {
      showToast(e?.response?.data?.message || 'Cannot delete — this code may be in use.', 'error');
    } finally {
      setDeleteId(null);
    }
  };

  const filtered = codes.filter(t =>
    t.name?.toLowerCase().includes(search.toLowerCase()) ||
    t.code?.toLowerCase().includes(search.toLowerCase())
  );

  const typeColor = (type: string) =>
    type === 'EARNING' ? 'bg-emerald-100 text-emerald-700' :
    type === 'BENEFIT' ? 'bg-blue-100 text-blue-700' :
    'bg-red-100 text-red-500';

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-navy mb-1">Earnings & Deductions</h2>
          <p className="text-slate-500 font-medium">Define transaction codes and calculation logic for payslip line items.</p>
        </div>
        <button onClick={openCreate} className="bg-brand text-navy px-4 py-2 rounded-full font-bold shadow-lg hover:opacity-90 transition-opacity flex items-center gap-1.5">
          <Plus size={20} /> Add Code
        </button>
      </header>

      <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="p-4 px-6 border-b border-border bg-slate-50/50">
          <div className="relative max-w-md">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by code or name..."
              className="w-full pl-10 pr-4 py-2 bg-white border border-border rounded-xl text-sm focus:outline-none focus:border-accent-blue"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-slate-50">
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Code / Name</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Type</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Calculation</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Flags</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length > 0 ? filtered.map(tc => (
                <tr key={tc.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs ${typeColor(tc.type)}`}>
                        {tc.code?.slice(0, 4)}
                      </div>
                      <div>
                        <p className="text-sm font-bold">{tc.name}</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{tc.code}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase ${typeColor(tc.type)}`}>
                      {tc.type}
                    </span>
                    {tc.preTax && <span className="ml-1 px-2 py-1 rounded-lg text-[10px] font-bold uppercase bg-orange-100 text-orange-600">Pre-Tax</span>}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-700">
                    <span className="font-medium capitalize">{tc.calculationType || 'fixed'}</span>
                    {tc.defaultValue != null && (
                      <span className="ml-1 text-slate-400 text-xs">({tc.defaultValue})</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-1 flex-wrap">
                      {tc.affectsPaye !== false && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-500">PAYE</span>}
                      {tc.affectsNssa !== false && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-500">NSSA</span>}
                      {tc.taxable !== false && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-500">Taxable</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase ${tc.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                      {tc.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEdit(tc)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-navy transition-colors" title="Edit">
                        <Edit2 size={16} />
                      </button>
                      {deleteId === tc.id ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleDelete(tc.id)} className="px-2 py-1 bg-red-500 text-white rounded text-xs font-bold">Confirm</button>
                          <button onClick={() => setDeleteId(null)} className="px-2 py-1 bg-slate-100 rounded text-xs font-bold">Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => setDeleteId(tc.id)} className="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors" title="Delete">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400 font-medium italic">
                    No transaction codes found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div role="dialog" aria-modal="true" aria-labelledby="pay-transaction-modal-title" className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h3 id="pay-transaction-modal-title" className="text-lg font-bold">{modal.mode === 'create' ? 'Add Transaction Code' : `Edit — ${modal.tc?.code}`}</h3>
              <button onClick={closeModal} aria-label="Close" className="p-1 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>

            <div className="px-6 py-5 flex flex-col gap-4">
              {error && <p className="text-sm text-red-500 font-medium bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

              <div className="grid grid-cols-2 gap-4">
                {/* Code — read-only in edit mode */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Code *</label>
                  <input
                    className="border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent-blue disabled:bg-slate-50 disabled:text-slate-400"
                    value={form.code}
                    onChange={e => setForm((f: any) => ({ ...f, code: e.target.value.toUpperCase() }))}
                    disabled={modal.mode === 'edit'}
                    placeholder="e.g. TRANS"
                  />
                  <p className="text-[10px] text-slate-400 font-medium">For ZIMRA compliance, medical aid codes should be numerical (e.g. 5401)</p>
                </div>
                {/* Type */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Type *</label>
                  <select
                    className="border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent-blue"
                    value={form.type}
                    onChange={e => setForm((f: any) => ({ ...f, type: e.target.value }))}
                  >
                    {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              {/* Name */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Name *</label>
                <input
                  className="border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent-blue"
                  value={form.name}
                  onChange={e => setForm((f: any) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Transport Allowance"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Calculation Type */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Calculation</label>
                  <select
                    className="border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent-blue"
                    value={form.calculationType}
                    onChange={e => setForm((f: any) => ({ ...f, calculationType: e.target.value }))}
                  >
                    {CALC_TYPES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
                  </select>
                </div>
                {/* Default Value */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Default Value</label>
                  <input
                    type="number"
                    className="border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent-blue"
                    value={form.defaultValue}
                    onChange={e => setForm((f: any) => ({ ...f, defaultValue: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Income Category (Tax Rule) */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tax Rule / Category</label>
                <select
                  className="border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent-blue"
                  value={form.incomeCategory || ''}
                  onChange={e => setForm((f: any) => ({ ...f, incomeCategory: e.target.value || null }))}
                >
                  <option value="">None / Standard</option>
                  <option value="BASIC_SALARY">Basic Salary</option>
                  <option value="BONUS">Bonus</option>
                  <option value="PENSION">Pension (Exempt)</option>
                  <option value="MEDICAL_AID">Medical Aid (50% Tax Credit)</option>
                  <option value="ALLOWANCE">Allowance</option>
                  <option value="OVERTIME">Overtime</option>
                  <option value="COMMISSION">Commission</option>
                  <option value="BENEFIT">Benefit</option>
                </select>
              </div>

              {/* Checkboxes */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                {[
                  { key: 'preTax', label: 'Pre-Tax Deduction', desc: 'Deducted before PAYE' },
                  { key: 'taxable', label: 'Taxable', desc: 'Included in taxable income' },
                  { key: 'affectsPaye', label: 'Affects PAYE', desc: 'Counted for PAYE basis' },
                  { key: 'affectsNssa', label: 'Affects NSSA', desc: 'Counted for NSSA basis' },
                  { key: 'isActive', label: 'Active', desc: 'Available for use in payroll' },
                ].map(({ key, label, desc }) => (
                  <label key={key} className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5 accent-accent-blue"
                      checked={form[key]}
                      onChange={e => setForm((f: any) => ({ ...f, [key]: e.target.checked }))}
                    />
                    <div>
                      <p className="text-sm font-semibold text-slate-700">{label}</p>
                      <p className="text-[10px] text-slate-400">{desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
              <button onClick={closeModal} className="px-4 py-2 rounded-xl border border-border text-sm font-bold hover:bg-slate-50">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-6 py-2 rounded-xl bg-accent-blue text-white text-sm font-bold hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
                {saving && <Loader size={14} className="animate-spin" />}
                {modal.mode === 'create' ? 'Create' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PayTransactions;
