import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import SkeletonTable from '../../components/common/SkeletonTable';
import { ClientAPI } from '../../api/client';
import ConfirmModal from '../../components/common/ConfirmModal';
import { useToast } from '../../context/ToastContext';

const AdminClients: React.FC = () => {
  const { showToast } = useToast();
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    ClientAPI.getAll().then((r) => setClients(r.data)).catch(() => showToast('Failed to load clients', 'error')).finally(() => setLoading(false));
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
      setError(err.response?.data?.message || 'Failed to create client');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string) => setDeleteTarget(id);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try { await ClientAPI.delete(deleteTarget); load(); } catch { showToast('Failed to delete client', 'error'); } finally { setDeleteTarget(null); }
  };

  return (
    <div>
      {deleteTarget && (
        <ConfirmModal
          title="Delete Client"
          message="Are you sure you want to delete this client? This will remove all associated data and cannot be undone."
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Clients</h1>
          <p className="text-slate-500 text-sm font-medium">Manage platform clients</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-btn-primary text-navy px-5 py-2.5 rounded-full text-sm font-bold shadow hover:opacity-90">
          <Plus size={16} /> Add Client
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-6 bg-primary rounded-2xl border border-border p-6 shadow-sm flex flex-col gap-4">
          <h3 className="font-bold text-sm uppercase tracking-wider text-slate-400">New Client</h3>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="grid grid-cols-2 gap-4">
            {[
              { f: 'name', label: 'Client Name', required: true },
              { f: 'email', label: 'Email', required: false },
              { f: 'phone', label: 'Phone', required: false },
              { f: 'address', label: 'Address', required: false },
            ].map(({ f, label, required }) => (
              <div key={f}>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">{label}{required && ' *'}</label>
                <input required={required} value={(form as any)[f]} onChange={set(f)}
                  className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl font-medium text-sm" />
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="bg-btn-primary text-navy px-6 py-2.5 rounded-full font-bold text-sm hover:opacity-90 disabled:opacity-60">
              {saving ? 'Creating…' : 'Create Client'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-6 py-2.5 rounded-full border border-border font-bold text-sm text-slate-500 hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <SkeletonTable headers={['Name', 'Email', 'Phone', 'Companies', 'Created', 'Actions']} />
      ) : (
        <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-slate-50">
                {['Name', 'Email', 'Phone', 'Companies', 'Created', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {clients.map((c: any) => (
                <tr key={c.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-bold text-sm">{c.name}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{c.email || '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{c.phone || '—'}</td>
                  <td className="px-4 py-3 text-sm">{c._count?.companies ?? 0}</td>
                  <td className="px-4 py-3 text-sm text-slate-400">{new Date(c.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleDelete(c.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
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

export default AdminClients;
