import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Loader } from 'lucide-react';
import { BranchAPI, DepartmentAPI, SubCompanyAPI } from '../api/client';
import { getActiveCompanyId } from '../lib/companyContext';

const TABS = ['branches', 'departments', 'subcompanies'] as const;
type Tab = typeof TABS[number];

const TAB_LABELS: Record<Tab, string> = {
  branches: 'Branches',
  departments: 'Departments',
  subcompanies: 'Sub-Companies',
};

const ClientAdminStructure: React.FC = () => {
  const [tab, setTab] = useState<Tab>('branches');
  const [branches, setBranches] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [subCompanies, setSubCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const companyId = getActiveCompanyId();

  const loadAll = () => {
    setLoading(true);
    Promise.all([
      companyId ? BranchAPI.getAll({ companyId }) : Promise.resolve({ data: [] }),
      companyId ? DepartmentAPI.getAll({ companyId }) : Promise.resolve({ data: [] }),
      SubCompanyAPI.getAll(),
    ]).then(([b, d, s]) => {
      setBranches(b.data);
      setDepartments(d.data);
      setSubCompanies(s.data);
    }).finally(() => setLoading(false));
  };

  useEffect(loadAll, [companyId]);

  const handleDelete = async (type: Tab, id: string) => {
    if (!confirm('Delete this item?')) return;
    try {
      if (type === 'branches') await BranchAPI.delete(id);
      else if (type === 'departments') await DepartmentAPI.delete(id);
      else await SubCompanyAPI.delete(id);
      loadAll();
    } catch {}
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (tab === 'branches') await BranchAPI.create({ ...formData, companyId: companyId ?? undefined });
      else if (tab === 'departments') await DepartmentAPI.create({ ...formData, companyId: companyId ?? undefined });
      else await SubCompanyAPI.create(formData);
      setShowForm(false);
      setFormData({});
      loadAll();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create');
    } finally {
      setSaving(false);
    }
  };

  const items =
    tab === 'branches' ? branches :
    tab === 'departments' ? departments :
    subCompanies;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Company Structure</h1>
          <p className="text-slate-500 text-sm font-medium">Manage branches, departments and sub-companies for the active company</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setFormData({}); }}
          className="flex items-center gap-2 bg-btn-primary text-navy px-5 py-2.5 rounded-full text-sm font-bold shadow hover:opacity-90"
        >
          <Plus size={16} /> Add New
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-100 p-1 rounded-xl w-fit">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setShowForm(false); }}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === t ? 'bg-white text-navy shadow-sm' : 'text-slate-500 hover:text-navy'}`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="mb-6 bg-primary rounded-2xl border border-border p-6 shadow-sm flex flex-col gap-4">
          <h3 className="font-bold text-sm uppercase tracking-wider text-slate-400">
            New {TAB_LABELS[tab].replace(/s$/, '')}
          </h3>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Name <span className="text-red-400">*</span></label>
              <input
                required
                value={formData.name || ''}
                onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue font-medium text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Description</label>
              <input
                value={formData.description || ''}
                onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
                className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue font-medium text-sm"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="bg-btn-primary text-navy px-6 py-2.5 rounded-full font-bold text-sm hover:opacity-90 disabled:opacity-60">
              {saving ? 'Creating…' : 'Create'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-6 py-2.5 rounded-full border border-border font-bold text-sm text-slate-500 hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48 text-slate-400"><Loader size={24} className="animate-spin" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-slate-400 bg-primary rounded-2xl border border-border">
          <p className="font-medium">No {TAB_LABELS[tab].toLowerCase()} found. Create one above.</p>
        </div>
      ) : (
        <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-slate-50">
                {['Name', 'Description', 'Employees', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item: any) => (
                <tr key={item.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-bold text-sm">{item.name}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{item.description || '—'}</td>
                  <td className="px-4 py-3 text-sm">{item._count?.employees ?? '—'}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDelete(tab, item.id)}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
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

export default ClientAdminStructure;
