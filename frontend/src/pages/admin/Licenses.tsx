import React, { useEffect, useState } from 'react';
import { Plus, Loader, CheckCircle2, XCircle } from 'lucide-react';
import { LicenseAPI, ClientAPI } from '../../api/client';

const AdminLicenses: React.FC = () => {
  const [licenses, setLicenses] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ clientId: '', expiryMonths: '12' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [actionId, setActionId] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([LicenseAPI.getAll(), ClientAPI.getAll()])
      .then(([l, c]) => { setLicenses(l.data); setClients(c.data); })
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
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to issue license');
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (clientId: string) => {
    if (!confirm('Revoke this license?')) return;
    setActionId(clientId);
    try { await LicenseAPI.revoke(clientId); load(); } catch {}
    setActionId('');
  };

  const handleReactivate = async (clientId: string) => {
    setActionId(clientId);
    try { await LicenseAPI.reactivate(clientId, 12); load(); } catch {}
    setActionId('');
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">License Management</h1>
          <p className="text-slate-500 text-sm font-medium">Issue and manage client licenses</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-brand text-navy px-5 py-2.5 rounded-full text-sm font-bold shadow hover:opacity-90">
          <Plus size={16} /> Issue License
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleIssue} className="mb-6 bg-primary rounded-2xl border border-border p-6 shadow-sm flex flex-col gap-4">
          <h3 className="font-bold text-sm uppercase tracking-wider text-slate-400">Issue New License</h3>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Client *</label>
              <select required value={form.clientId} onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
                className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl font-medium text-sm">
                <option value="">Select client</option>
                {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Validity (months)</label>
              <input type="number" value={form.expiryMonths} onChange={(e) => setForm((f) => ({ ...f, expiryMonths: e.target.value }))}
                className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl font-medium text-sm" />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="bg-brand text-navy px-6 py-2.5 rounded-full font-bold text-sm hover:opacity-90 disabled:opacity-60">
              {saving ? 'Issuing…' : 'Issue License'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-6 py-2.5 rounded-full border border-border font-bold text-sm text-slate-500 hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48 text-slate-400"><Loader size={24} className="animate-spin" /></div>
      ) : (
        <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-slate-50">
                {['Client', 'Token', 'Issued', 'Expires', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {licenses.map((lic: any) => {
                const isActive = lic.isActive && (!lic.expiresAt || new Date(lic.expiresAt) > new Date());
                return (
                  <tr key={lic.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-bold text-sm">{lic.client?.name || lic.clientId}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">{lic.token?.slice(0, 16)}…</td>
                    <td className="px-4 py-3 text-sm">{lic.createdAt ? new Date(lic.createdAt).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-3 text-sm">{lic.expiresAt ? new Date(lic.expiresAt).toLocaleDateString() : 'Never'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                        {isActive ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                        {isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {actionId === lic.clientId ? (
                        <span className="text-xs text-slate-400">…</span>
                      ) : isActive ? (
                        <button onClick={() => handleRevoke(lic.clientId)} className="text-xs font-bold text-red-500 hover:underline">Revoke</button>
                      ) : (
                        <button onClick={() => handleReactivate(lic.clientId)} className="text-xs font-bold text-accent-blue hover:underline">Reactivate</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminLicenses;
