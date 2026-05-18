import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Settings2, X, Check } from 'lucide-react';
import SkeletonTable from '../../components/common/SkeletonTable';
import { ClientAPI } from '../../api/client';
import ConfirmModal from '../../components/common/ConfirmModal';
import { useToast } from '../../context/ToastContext';
import type { AppModule } from '../../lib/auth';

const ALL_MODULES: { key: AppModule; label: string; description: string }[] = [
  { key: 'PEOPLE',      label: 'HR & People',    description: 'Employees, grades, departments, branches, documents' },
  { key: 'TIME_LEAVE',  label: 'Time & Leave',   description: 'Leave policies, balances, encashments, shifts, attendance' },
  { key: 'PAYROLL',     label: 'Payroll',         description: 'Payroll runs, payslips, bank files, loans' },
  { key: 'COMPLIANCE',  label: 'Compliance',      description: 'Statutory rates, NEC tables, NSSA' },
  { key: 'REPORTS',     label: 'Reports',         description: 'All reporting and exports' },
  { key: 'SETTINGS',    label: 'Settings & Utils',description: 'Utilities, period end, payroll calendar, system settings' },
  { key: 'RECRUITMENT', label: 'Recruitment',     description: 'Job postings and applicant tracking' },
  { key: 'PERFORMANCE', label: 'Performance',     description: 'Employee performance reviews' },
  { key: 'EXPENSES',    label: 'Expenses',        description: 'Expense claims and approvals' },
  { key: 'ONBOARDING',  label: 'Onboarding',      description: 'New employee onboarding workflows' },
  { key: 'TRAINING',    label: 'Training',        description: 'Training and learning management' },
  { key: 'ASSETS',      label: 'Assets',          description: 'Company asset tracking' },
  { key: 'SUCCESSION',  label: 'Succession',      description: 'Succession planning' },
  { key: 'SURVEYS',     label: 'Surveys',         description: 'Employee surveys and feedback' },
  { key: 'ANALYTICS',   label: 'Analytics',       description: 'Advanced analytics dashboard' },
];

const AdminClients: React.FC = () => {
  const { showToast } = useToast();
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [modulesClient, setModulesClient] = useState<any | null>(null);
  const [selectedModules, setSelectedModules] = useState<AppModule[]>([]);
  const [savingModules, setSavingModules] = useState(false);

  const load = () => {
    setLoading(true);
    ClientAPI.getAll()
      .then((r) => setClients(r.data))
      .catch(() => showToast('Failed to load clients', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [f]: e.target.value }));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await ClientAPI.create(form);
      setShowForm(false);
      setForm({ name: '', email: '', phone: '', address: '' });
      load();
    } catch (err: any) {
      setError(err.message || 'Failed to create client');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string) => setDeleteTarget(id);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try { await ClientAPI.delete(deleteTarget); load(); } catch { showToast('Failed to delete client', 'error'); } finally { setDeleteTarget(null); }
  };

  const openModules = (client: any) => {
    setModulesClient(client);
    setSelectedModules(client.enabledModules?.length ? client.enabledModules : ALL_MODULES.map((m) => m.key));
  };

  const toggleModule = (key: AppModule) => {
    setSelectedModules((prev) =>
      prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]
    );
  };

  const toggleAll = () => {
    const allKeys = ALL_MODULES.map((m) => m.key);
    setSelectedModules(selectedModules.length === allKeys.length ? [] : allKeys);
  };

  const saveModules = async () => {
    if (!modulesClient) return;
    setSavingModules(true);
    try {
      await ClientAPI.updateModules(modulesClient.id, selectedModules);
      showToast('Modules updated', 'success');
      setModulesClient(null);
      load();
    } catch {
      showToast('Failed to update modules', 'error');
    } finally {
      setSavingModules(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {deleteTarget && (
        <ConfirmModal
          title="Delete Client"
          message="Are you sure you want to delete this client? This will remove all associated data and cannot be undone."
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Module management panel */}
      {modulesClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-primary border border-border rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <div>
                <h2 className="font-bold text-base">Module Access</h2>
                <p className="text-xs text-muted-foreground font-medium mt-0.5">{modulesClient.name}</p>
              </div>
              <button onClick={() => setModulesClient(null)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                <X size={16} />
              </button>
            </div>

            <div className="px-6 py-3 border-b border-border shrink-0 flex items-center justify-between">
              <p className="text-xs text-muted-foreground font-medium">{selectedModules.length} of {ALL_MODULES.length} modules enabled</p>
              <button onClick={toggleAll} className="text-xs font-bold text-brand hover:underline">
                {selectedModules.length === ALL_MODULES.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-4 grid grid-cols-1 gap-2">
              {ALL_MODULES.map(({ key, label, description }) => {
                const enabled = selectedModules.includes(key);
                return (
                  <button
                    key={key}
                    onClick={() => toggleModule(key)}
                    className={`flex items-center gap-4 w-full text-left px-4 py-3 rounded-xl border transition-all
                      ${enabled ? 'border-brand bg-brand/5' : 'border-border hover:bg-muted/40'}`}
                  >
                    <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors
                      ${enabled ? 'bg-brand border-brand text-navy' : 'border-border'}`}>
                      {enabled && <Check size={12} strokeWidth={3} />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-bold">{label}</span>
                      <span className="block text-xs text-muted-foreground truncate">{description}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="px-6 py-4 border-t border-border shrink-0 flex gap-3">
              <button
                onClick={saveModules}
                disabled={savingModules}
                className="bg-brand text-navy px-5 py-2 rounded-full font-bold text-sm hover:opacity-90 disabled:opacity-60"
              >
                {savingModules ? 'Saving…' : 'Save Changes'}
              </button>
              <button onClick={() => setModulesClient(null)} className="px-5 py-2 rounded-full border border-border font-bold text-sm text-muted-foreground hover:bg-muted">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">Clients</h1>
          <p className="text-muted-foreground text-sm font-medium">Manage platform clients</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 bg-brand text-navy px-4 py-2 rounded-full text-sm font-bold shadow hover:opacity-90">
          <Plus size={16} /> Add Client
        </button>
      </header>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-primary rounded-2xl border border-border p-6 shadow-sm flex flex-col gap-4">
          <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">New Client</h3>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="grid grid-cols-2 gap-4">
            {[
              { f: 'name', label: 'Client Name', required: true },
              { f: 'email', label: 'Email', required: false },
              { f: 'phone', label: 'Phone', required: false },
              { f: 'address', label: 'Address', required: false },
            ].map(({ f, label, required }) => (
              <div key={f}>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">{label}{required && ' *'}</label>
                <input required={required} value={(form as any)[f]} onChange={set(f)}
                  className="w-full px-4 py-3 bg-muted border border-border rounded-xl font-medium text-sm" />
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="bg-brand text-navy px-4 py-2 rounded-full font-bold text-sm hover:opacity-90 disabled:opacity-60">
              {saving ? 'Creating…' : 'Create Client'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-full border border-border font-bold text-sm text-muted-foreground hover:bg-muted">
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <SkeletonTable headers={['Name', 'Email', 'Phone', 'Companies', 'Modules', 'Created', 'Actions']} />
      ) : (
        <div className="tbl-container">
          <div className="tbl-scroll">
            <table className="w-full text-left">
              <thead>
                <tr className="tbl-head-row">
                  {['Name', 'Email', 'Phone', 'Companies', 'Modules', 'Created', 'Actions'].map((h) => (
                    <th key={h} className="tbl-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {clients.map((c: any) => (
                  <tr key={c.id} className="tbl-row">
                    <td className="px-4 py-3 font-bold text-sm">{c.name}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{c.email || '—'}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{c.phone || '—'}</td>
                    <td className="px-4 py-3 text-sm">{c._count?.companies ?? 0}</td>
                    <td className="px-4 py-3 text-sm">
                      {c.enabledModules?.length
                        ? <span className="text-xs font-bold text-brand">{c.enabledModules.length} module{c.enabledModules.length !== 1 ? 's' : ''}</span>
                        : <span className="text-xs text-muted-foreground">All</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3 flex items-center gap-1">
                      <button onClick={() => openModules(c)} aria-label="Manage modules" className="p-1.5 text-muted-foreground hover:text-brand hover:bg-brand/10 rounded-lg">
                        <Settings2 size={14} />
                      </button>
                      <button onClick={() => handleDelete(c.id)} aria-label="Delete client" className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded-lg">
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
  );
};

export default AdminClients;
