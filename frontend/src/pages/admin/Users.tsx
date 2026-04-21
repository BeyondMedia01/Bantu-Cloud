import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import SkeletonTable from '../../components/common/SkeletonTable';
import { AdminAPI } from '../../api/client';
import ConfirmModal from '../../components/common/ConfirmModal';
import { useToast } from '../../context/ToastContext';

const roleColor: Record<string, string> = {
  PLATFORM_ADMIN: 'bg-red-50 text-red-700',
  CLIENT_ADMIN: 'bg-blue-50 text-blue-700',
  EMPLOYEE: 'bg-slate-100 text-slate-600',
};

const AdminUsers: React.FC = () => {
  const { showToast } = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'CLIENT_ADMIN' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    AdminAPI.getUsers().then((r) => setUsers(r.data)).catch(() => showToast('Failed to load users', 'error')).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [f]: e.target.value }));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await AdminAPI.createUser(form);
      setShowForm(false);
      setForm({ name: '', email: '', password: '', role: 'CLIENT_ADMIN' });
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string) => setDeleteTarget(id);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try { await AdminAPI.deleteUser(deleteTarget); load(); } catch { showToast('Failed to delete user', 'error'); } finally { setDeleteTarget(null); }
  };

  const handleRoleChange = async (id: string, role: string) => {
    try { await AdminAPI.changeRole(id, role); load(); } catch { showToast('Failed to update role', 'error'); }
  };

  return (
    <div>
      {deleteTarget && (
        <ConfirmModal
          title="Delete User"
          message="Are you sure you want to delete this user? This action cannot be undone."
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-slate-500 text-sm font-medium">Manage platform users</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-btn-primary text-navy px-5 py-2.5 rounded-full text-sm font-bold shadow hover:opacity-90">
          <Plus size={16} /> Add User
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-6 bg-primary rounded-2xl border border-border p-6 shadow-sm flex flex-col gap-4">
          <h3 className="font-bold text-sm uppercase tracking-wider text-slate-400">New User</h3>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="grid grid-cols-2 gap-4">
            {['name', 'email', 'password'].map((f) => (
              <div key={f}>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">{f.charAt(0).toUpperCase() + f.slice(1)} *</label>
                <input required type={f === 'password' ? 'password' : f === 'email' ? 'email' : 'text'} value={(form as any)[f]} onChange={set(f)}
                  className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl font-medium text-sm" />
              </div>
            ))}
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Role</label>
              <select value={form.role} onChange={set('role')} className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl font-medium text-sm">
                <option value="CLIENT_ADMIN">Client Admin</option>
                <option value="PLATFORM_ADMIN">Platform Admin</option>
                <option value="EMPLOYEE">Employee</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="bg-btn-primary text-navy px-6 py-2.5 rounded-full font-bold text-sm hover:opacity-90 disabled:opacity-60">
              {saving ? 'Creating…' : 'Create User'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-6 py-2.5 rounded-full border border-border font-bold text-sm text-slate-500 hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <SkeletonTable headers={['Name', 'Email', 'Role', 'Created', 'Actions']} />
      ) : (
        <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-slate-50">
                {['Name', 'Email', 'Role', 'Created', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((u: any) => (
                <tr key={u.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-bold text-sm">{u.name}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{u.email}</td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                      className={`px-2 py-1 rounded-full text-xs font-bold border-0 cursor-pointer ${roleColor[u.role] || 'bg-slate-100'}`}
                    >
                      <option value="PLATFORM_ADMIN">Platform Admin</option>
                      <option value="CLIENT_ADMIN">Client Admin</option>
                      <option value="EMPLOYEE">Employee</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleDelete(u.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
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

export default AdminUsers;
