import React, { useEffect, useState } from 'react';
import { Plus, Trash2, ChevronDown } from 'lucide-react';
import { Dropdown } from '@/components/ui/dropdown';
import SkeletonTable from '../../components/common/SkeletonTable';
import { AdminAPI } from '../../api/client';
import ConfirmModal from '../../components/common/ConfirmModal';
import { useToast } from '../../context/ToastContext';

const roleColor: Record<string, string> = {
  PLATFORM_ADMIN: 'bg-red-50 text-red-700',
  CLIENT_ADMIN: 'bg-blue-50 text-blue-700',
  EMPLOYEE: 'bg-muted text-foreground/80',
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
          <p className="text-muted-foreground text-sm font-medium">Manage platform users</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 bg-brand text-navy px-4 py-2 rounded-full text-sm font-bold shadow hover:opacity-90">
          <Plus size={16} /> Add User
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-6 bg-primary rounded-2xl border border-border p-6 shadow-sm flex flex-col gap-4">
          <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">New User</h3>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="grid grid-cols-2 gap-4">
            {['name', 'email', 'password'].map((f) => (
              <div key={f}>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">{f.charAt(0).toUpperCase() + f.slice(1)} *</label>
                <input required type={f === 'password' ? 'password' : f === 'email' ? 'email' : 'text'} value={(form as any)[f]} onChange={set(f)}
                  className="w-full px-4 py-3 bg-muted border border-border rounded-xl font-medium text-sm" />
              </div>
            ))}
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Role</label>
              <Dropdown className="w-full" trigger={(isOpen) => {
                const roles: Record<string,string> = { CLIENT_ADMIN: 'Client Admin', PLATFORM_ADMIN: 'Platform Admin', EMPLOYEE: 'Employee' };
                return (
                  <button type="button" className="w-full flex items-center justify-between px-4 py-3 bg-muted border border-border rounded-xl font-medium text-sm hover:border-accent-green transition-colors">
                    <span>{roles[form.role] || form.role}</span>
                    <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                );
              }} sections={[{ items: [
                { label: 'Client Admin', onClick: () => set('role')({ target: { value: 'CLIENT_ADMIN' } } as any) },
                { label: 'Platform Admin', onClick: () => set('role')({ target: { value: 'PLATFORM_ADMIN' } } as any) },
                { label: 'Employee', onClick: () => set('role')({ target: { value: 'EMPLOYEE' } } as any) },
              ]}]} />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="bg-brand text-navy px-4 py-2 rounded-full font-bold text-sm hover:opacity-90 disabled:opacity-60">
              {saving ? 'Creating…' : 'Create User'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-full border border-border font-bold text-sm text-muted-foreground hover:bg-muted">
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
              <tr className="border-b border-border bg-muted">
                {['Name', 'Email', 'Role', 'Created', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((u: any) => (
                <tr key={u.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-bold text-sm">{u.name}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-3">
                    <Dropdown trigger={(isOpen) => {
                      const roles: Record<string,string> = { PLATFORM_ADMIN: 'Platform Admin', CLIENT_ADMIN: 'Client Admin', EMPLOYEE: 'Employee' };
                      return (
                        <button type="button" className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-bold cursor-pointer ${roleColor[u.role] || 'bg-muted'}`}>
                          <span>{roles[u.role] || u.role}</span>
                          <ChevronDown size={10} className={`shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        </button>
                      );
                    }} sections={[{ items: [
                      { label: 'Platform Admin', onClick: () => handleRoleChange(u.id, 'PLATFORM_ADMIN') },
                      { label: 'Client Admin', onClick: () => handleRoleChange(u.id, 'CLIENT_ADMIN') },
                      { label: 'Employee', onClick: () => handleRoleChange(u.id, 'EMPLOYEE') },
                    ]}]} />
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleDelete(u.id)} className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded-lg">
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

export default AdminUsers;
