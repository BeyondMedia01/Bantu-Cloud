import React, { useEffect, useState } from 'react';
import { Shield, Loader, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { LicenseAPI } from '../api/client';
import { getUser } from '../lib/auth';

const License: React.FC = () => {
  const user = getUser();
  const isAdmin = user?.role === 'PLATFORM_ADMIN';
  const [licenses, setLicenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');

  const load = () => {
    if (!isAdmin) { setLoading(false); return; }
    LicenseAPI.getAll().then((r) => setLicenses(r.data)).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleRevoke = async (clientId: string) => {
    if (!confirm('Revoke this license?')) return;
    setActionLoading(clientId);
    try { await LicenseAPI.revoke(clientId); load(); } catch {}
    setActionLoading('');
  };

  const handleReactivate = async (clientId: string) => {
    setActionLoading(clientId);
    try { await LicenseAPI.reactivate(clientId, 12); load(); } catch {}
    setActionLoading('');
  };

  if (!isAdmin) return (
    <div className="text-center py-16 text-slate-400">
      <Shield size={40} className="mx-auto mb-3 opacity-30" />
      <p className="font-medium">License management is only available to platform administrators</p>
    </div>
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">License Management</h1>
        <p className="text-slate-500 text-sm font-medium">Manage client licenses</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-slate-400"><Loader size={24} className="animate-spin" /></div>
      ) : licenses.length === 0 ? (
        <div className="text-center py-16 text-slate-400 bg-primary rounded-2xl border border-border">
          <Shield size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No licenses found</p>
        </div>
      ) : (
        <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-slate-50">
                {['Client', 'Token (partial)', 'Issued', 'Expires', 'Status', 'Actions'].map((h) => (
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
                    <td className="px-4 py-3 text-sm font-mono text-slate-400">{lic.token?.slice(0, 12)}…</td>
                    <td className="px-4 py-3 text-sm">{lic.createdAt ? new Date(lic.createdAt).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-3 text-sm">{lic.expiresAt ? new Date(lic.expiresAt).toLocaleDateString() : 'Never'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                        {isActive ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                        {isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {actionLoading === lic.clientId ? (
                        <Clock size={14} className="text-slate-400 animate-spin" />
                      ) : isActive ? (
                        <button onClick={() => handleRevoke(lic.clientId)} className="text-xs font-bold text-red-500 hover:underline">
                          Revoke
                        </button>
                      ) : (
                        <button onClick={() => handleReactivate(lic.clientId)} className="text-xs font-bold text-accent-blue hover:underline">
                          Reactivate (12mo)
                        </button>
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

export default License;
