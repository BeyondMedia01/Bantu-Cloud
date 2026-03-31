import React, { useEffect, useState } from 'react';
import { Plus, Edit, Trash, Shield, Loader } from 'lucide-react';
import { LeavePolicyAPI } from '../api/client';
import ConfirmModal from '../components/common/ConfirmModal';

const LEAVE_TYPES = ['ANNUAL', 'SICK', 'MATERNITY', 'PATERNITY', 'UNPAID', 'COMPASSIONATE', 'STUDY', 'MEDICAL_AID', 'OTHER'];

const fmtType = (t: string) => t.charAt(0) + t.slice(1).toLowerCase().replace(/_/g, ' ');

const EMPTY_FORM = {
  leaveType: 'ANNUAL',
  accrualRate: '2.5',
  maxAccumulation: '90',
  carryOverLimit: '30',
  encashable: true,
  encashCap: '0',
};

const LeavePolicy: React.FC = () => {
  const [policies, setPolicies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editId, setEditId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    LeavePolicyAPI.getAll()
      .then((r) => setPolicies(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openAdd = () => {
    setForm({ ...EMPTY_FORM });
    setEditId(null);
    setError('');
    setShowForm(true);
  };

  const openEdit = (p: any) => {
    setForm({
      leaveType: p.leaveType,
      accrualRate: String(p.accrualRate),
      maxAccumulation: String(p.maxAccumulation),
      carryOverLimit: String(p.carryOverLimit),
      encashable: p.encashable,
      encashCap: String(p.encashCap ?? 0),
    });
    setEditId(p.id);
    setError('');
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload = {
        ...form,
        accrualRate: parseFloat(form.accrualRate),
        maxAccumulation: parseFloat(form.maxAccumulation),
        carryOverLimit: parseFloat(form.carryOverLimit),
        encashCap: parseFloat(form.encashCap),
      };
      if (editId) {
        await LeavePolicyAPI.update(editId, payload);
      } else {
        await LeavePolicyAPI.create(payload);
      }
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save policy');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string) => setDeleteTarget(id);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await LeavePolicyAPI.delete(deleteTarget);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete policy');
    } finally {
      setDeleteTarget(null);
    }
  };

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));

  return (
    <div className="flex flex-col gap-6">
      {deleteTarget && (
        <ConfirmModal
          title="Delete Leave Policy"
          message="Delete this leave policy? All associated accrual rules will be removed."
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      <header className="flex justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Leave Policies</h1>
          <p className="text-slate-500 text-sm font-medium">Configure accrual rates, caps, and carry-over rules per leave type</p>
        </div>
        <button onClick={openAdd} className="bg-btn-primary text-navy px-6 py-3 rounded-full font-bold shadow hover:opacity-90 flex items-center gap-2">
          <Plus size={18} /> Add Policy
        </button>
      </header>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>}

      {/* Policy Form */}
      {showForm && (
        <div className="bg-primary border border-border rounded-2xl p-6 shadow-sm">
          <h3 className="font-bold text-sm uppercase tracking-wider text-slate-400 mb-5">
            {editId ? 'Edit Policy' : 'New Leave Policy'}
          </h3>
          <form onSubmit={handleSave} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Leave Type</label>
              <select
                value={form.leaveType}
                onChange={set('leaveType')}
                disabled={!!editId}
                className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue disabled:opacity-60"
              >
                {LEAVE_TYPES.map((t) => <option key={t} value={t}>{fmtType(t)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Accrual Rate (days/month)</label>
              <input type="number" step="any" min="0" required value={form.accrualRate} onChange={set('accrualRate')}
                className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Max Accumulation (days cap)</label>
              <input type="number" step="1" min="0" required value={form.maxAccumulation} onChange={set('maxAccumulation')}
                className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Carry-Over Limit (days, 0 = forfeit all)</label>
              <input type="number" step="1" min="0" required value={form.carryOverLimit} onChange={set('carryOverLimit')}
                className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Encashment Cap (days/year, 0 = unlimited)</label>
              <input type="number" step="1" min="0" required value={form.encashCap} onChange={set('encashCap')}
                className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue" />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <input type="checkbox" id="encashable" checked={form.encashable} onChange={set('encashable')} className="w-4 h-4 accent-accent-blue" />
              <label htmlFor="encashable" className="text-sm font-medium text-slate-700">Allow encashment</label>
            </div>

            <div className="sm:col-span-2 lg:col-span-3 flex gap-3 pt-2">
              <button type="submit" disabled={saving}
                className="bg-btn-primary text-navy px-8 py-3 rounded-full font-bold shadow hover:opacity-90 disabled:opacity-60">
                {saving ? 'Saving…' : editId ? 'Update Policy' : 'Create Policy'}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="px-8 py-3 rounded-full font-bold border border-border hover:bg-slate-50">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Policies Table */}
      {loading ? (
        <div className="flex items-center justify-center h-48"><Loader size={24} className="animate-spin text-slate-400" /></div>
      ) : policies.length === 0 ? (
        <div className="text-center py-16 bg-primary rounded-2xl border border-border">
          <Shield size={36} className="mx-auto mb-3 text-slate-200" />
          <p className="font-bold text-slate-500 mb-1">No leave policies configured</p>
          <p className="text-sm text-slate-400">Add policies to enable monthly accruals and year-end carry-over</p>
        </div>
      ) : (
        <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-slate-50">
                {['Leave Type', 'Accrual Rate', 'Max Cap', 'Carry-Over', 'Encashable', 'Encash Cap', ''].map((h) => (
                  <th key={h} className="px-5 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {policies.map((p: any) => (
                <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-5 py-4">
                    <span className="font-bold text-sm">{fmtType(p.leaveType)}</span>
                  </td>
                  <td className="px-5 py-4 text-sm font-medium">{p.accrualRate} days/month</td>
                  <td className="px-5 py-4 text-sm font-medium">{p.maxAccumulation} days</td>
                  <td className="px-5 py-4 text-sm font-medium">{p.carryOverLimit > 0 ? `${p.carryOverLimit} days` : 'Forfeit all'}</td>
                  <td className="px-5 py-4">
                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${p.encashable ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {p.encashable ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm font-medium">
                    {p.encashCap > 0 ? `${p.encashCap} days/yr` : 'Unlimited'}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(p)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-navy transition-colors" title="Edit"><Edit size={16} /></button>
                      <button onClick={() => handleDelete(p.id)} className="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors" title="Delete"><Trash size={16} /></button>
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

export default LeavePolicy;
