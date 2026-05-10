import React, { useEffect, useState } from 'react';
import { Plus, CheckCircle2, XCircle, ChevronDown } from 'lucide-react';
import { Dropdown } from '@/components/ui/dropdown';
import SkeletonTable from '../../components/common/SkeletonTable';
import ConfirmModal from '../../components/common/ConfirmModal';
import { useToast } from '../../context/ToastContext';
import { LicenseAPI, ClientAPI } from '../../api/client';

const AdminLicenses: React.FC = () => {
  const { showToast } = useToast();
  const [licenses, setLicenses] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ clientId: '', expiryMonths: '12' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [actionId, setActionId] = useState('');
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([LicenseAPI.getAll(), ClientAPI.getAll()])
      .then(([l, c]) => { setLicenses(l.data); setClients(c.data); })
      .catch(() => showToast('Failed to load licenses', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await LicenseAPI.issue(form.clientId, parseInt(form.expiryMonths));
      setShowForm(false);
      setForm({ clientId: '', expiryMonths: '12' });
      showToast('License issued', 'success');
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to issue license');
    } finally {
      setSaving(false);
    }
  };

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    setActionId(revokeTarget);
    try {
      await LicenseAPI.revoke(revokeTarget);
      showToast('License revoked', 'success');
      load();
    } catch {
      showToast('Failed to revoke license', 'error');
    } finally {
      setActionId('');
      setRevokeTarget(null);
    }
  };

  const handleReactivate = async (clientId: string) => {
    setActionId(clientId);
    try {
      await LicenseAPI.reactivate(clientId, 12);
      showToast('License reactivated', 'success');
      load();
    } catch {
      showToast('Failed to reactivate license', 'error');
    } finally {
      setActionId('');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {revokeTarget && (
        <ConfirmModal
          title="Revoke License"
          message="Are you sure you want to revoke this license? The client will lose access immediately."
          confirmLabel="Revoke"
          onConfirm={confirmRevoke}
          onCancel={() => setRevokeTarget(null)}
        />
      )}

      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">License Management</h1>
          <p className="text-muted-foreground text-sm font-medium">Issue and manage client licenses</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 bg-brand text-navy px-4 py-2 rounded-full text-sm font-bold shadow hover:opacity-90">
          <Plus size={16} /> Issue License
        </button>
      </header>

      {showForm && (
        <form onSubmit={handleIssue} className="bg-primary rounded-2xl border border-border p-6 shadow-sm flex flex-col gap-4">
          <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Issue New License</h3>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Client *</label>
              <Dropdown className="w-full" trigger={(isOpen) => (
                <button type="button" className="w-full flex items-center justify-between px-4 py-3 bg-muted border border-border rounded-xl font-medium text-sm hover:border-accent-green transition-colors">
                  <span>{form.clientId ? (clients.find((c: any) => c.id === form.clientId)?.name || 'Select client') : 'Select client'}</span>
                  <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
              )} sections={[{ items: clients.map((c: any) => ({ label: c.name, onClick: () => setForm((f) => ({ ...f, clientId: c.id })) })) }]} />
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Validity (months)</label>
              <input type="number" value={form.expiryMonths} onChange={(e) => setForm((f) => ({ ...f, expiryMonths: e.target.value }))}
                className="w-full px-4 py-3 bg-muted border border-border rounded-xl font-medium text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green" />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="bg-brand text-navy px-4 py-2 rounded-full font-bold text-sm hover:opacity-90 disabled:opacity-60">
              {saving ? 'Issuing…' : 'Issue License'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-full border border-border font-bold text-sm text-muted-foreground hover:bg-muted">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
        {loading ? (
          <SkeletonTable headers={['Client', 'Token', 'Issued', 'Expires', 'Status', 'Actions']} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted border-b border-border">
                <tr>
                  {['Client', 'Token', 'Issued', 'Expires', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {licenses.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-12 text-center text-sm text-muted-foreground">No licenses issued yet.</td></tr>
                ) : licenses.map((lic: any) => {
                  const isActive = lic.isActive && (!lic.expiresAt || new Date(lic.expiresAt) > new Date());
                  return (
                    <tr key={lic.id} className="hover:bg-muted/70 transition-colors">
                      <td className="px-5 py-4 font-bold text-navy">{lic.client?.name || lic.clientId}</td>
                      <td className="px-5 py-4 font-mono text-xs text-muted-foreground">{lic.token?.slice(0, 16)}…</td>
                      <td className="px-5 py-4 text-muted-foreground">{lic.createdAt ? new Date(lic.createdAt).toLocaleDateString() : '—'}</td>
                      <td className="px-5 py-4 text-muted-foreground">{lic.expiresAt ? new Date(lic.expiresAt).toLocaleDateString() : 'Never'}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                          {isActive ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                          {isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        {actionId === lic.clientId ? (
                          <span className="text-xs text-muted-foreground">…</span>
                        ) : isActive ? (
                          <button onClick={() => setRevokeTarget(lic.clientId)} className="text-xs font-bold text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition-colors">Revoke</button>
                        ) : (
                          <button onClick={() => handleReactivate(lic.clientId)} className="text-xs font-bold text-emerald-600 hover:text-emerald-800 px-2 py-1 rounded hover:bg-emerald-50 transition-colors">Reactivate</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminLicenses;
