import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Loader, Building2, Edit2, Save, X, Check } from 'lucide-react';
import { BranchAPI, DepartmentAPI, SubCompanyAPI, CompanyAPI } from '../api/client';
import ConfirmModal from '../components/common/ConfirmModal';
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
  const [deleteTarget, setDeleteTarget] = useState<{ type: Tab; id: string; name: string } | null>(null);

  // Company profile state
  const [company, setCompany] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [profileSaving, setProfileSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  const companyId = getActiveCompanyId();

  useEffect(() => {
    if (!companyId) return;
    CompanyAPI.getById(companyId)
      .then((r) => { setCompany(r.data); setForm(r.data); })
      .catch(() => {});
  }, [companyId]);

  const handleProfileSave = async () => {
    if (!companyId) return;
    setProfileSaving(true);
    setSaveError('');
    setSaveSuccess(false);
    try {
      const updated = await CompanyAPI.update(companyId, {
        name: form.name,
        registrationNumber: form.registrationNumber,
        taxId: form.taxId,
        address: form.address,
        contactEmail: form.contactEmail,
        contactPhone: form.contactPhone,
      });
      setCompany(updated.data);
      setEditing(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 5000);
    } catch (err: any) {
      setSaveError(err.response?.data?.message || 'Failed to save changes.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleProfileCancel = () => {
    setForm(company);
    setEditing(false);
    setSaveError('');
  };

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

  const handleDelete = (type: Tab, id: string, name: string) => {
    setDeleteTarget({ type, id, name });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === 'branches') await BranchAPI.delete(deleteTarget.id);
      else if (deleteTarget.type === 'departments') await DepartmentAPI.delete(deleteTarget.id);
      else await SubCompanyAPI.delete(deleteTarget.id);
      loadAll();
    } catch {
      setError('Failed to delete item');
    } finally {
      setDeleteTarget(null);
    }
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

  const inputCls = "w-full px-4 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue";

  return (
    <div className="flex flex-col gap-8">
      {deleteTarget && (
        <ConfirmModal
          title={`Delete ${TAB_LABELS[deleteTarget.type].replace(/s$/, '')}`}
          message={`Are you sure you want to delete "${deleteTarget.name}"? This action cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      <header>
        <h1 className="text-2xl font-bold">Company Structure</h1>
        <p className="text-slate-500 text-sm font-medium">Company profile and organisational structure</p>
      </header>

      {/* Company Profile Card */}
      <div className="bg-primary border border-border rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 text-blue-500 rounded-xl">
              <Building2 size={18} />
            </div>
            <h2 className="font-bold text-navy">Company Profile</h2>
          </div>
          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-border text-sm font-bold text-slate-500 hover:bg-white transition-colors"
            >
              <Edit2 size={14} /> Edit
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handleProfileSave}
                disabled={profileSaving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-brand text-navy text-sm font-bold hover:opacity-90 disabled:opacity-60"
              >
                <Save size={14} /> {profileSaving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={handleProfileCancel}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-border text-sm font-bold text-slate-500 hover:bg-white transition-colors"
              >
                <X size={14} /> Cancel
              </button>
            </div>
          )}
        </div>

        {saveSuccess && (
          <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 font-medium flex items-center gap-2">
            <Check size={15} /> Changes saved successfully.
          </div>
        )}
        {saveError && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium">
            {saveError}
          </div>
        )}

        {company ? (
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
            {[
              { label: 'Company Name', key: 'name', required: true },
              { label: 'Registration Number', key: 'registrationNumber' },
              { label: 'Tax ID (ZIMRA)', key: 'taxId' },
              { label: 'Contact Email', key: 'contactEmail', type: 'email' },
              { label: 'Contact Phone', key: 'contactPhone' },
              { label: 'Address', key: 'address' },
            ].map(({ label, key, type, required }) => (
              <div key={key}>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">{label}</label>
                {editing ? (
                  <input
                    type={type || 'text'}
                    value={form[key] || ''}
                    onChange={(e) => setForm((p: any) => ({ ...p, [key]: e.target.value }))}
                    required={required}
                    className={inputCls}
                  />
                ) : (
                  <p className="text-sm font-semibold text-navy px-1">{company[key] || <span className="text-slate-300 font-medium">—</span>}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center text-slate-400 text-sm font-medium">
            {companyId ? 'Loading company details…' : 'No active company selected.'}
          </div>
        )}
      </div>

      {/* Structure section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Organisation</h2>
          <button
            onClick={() => { setShowForm(true); setFormData({}); }}
            className="flex items-center gap-2 bg-brand text-navy px-5 py-2.5 rounded-full text-sm font-bold shadow hover:opacity-90"
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
              <button type="submit" disabled={saving} className="bg-brand text-navy px-6 py-2.5 rounded-full font-bold text-sm hover:opacity-90 disabled:opacity-60">
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
            <div className="overflow-x-auto">
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
                        onClick={() => handleDelete(tab, item.id, item.name)}
                        aria-label={`Delete ${item.name}`}
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
          </div>
        )}
      </div>
    </div>
  );
};

export default ClientAdminStructure;
