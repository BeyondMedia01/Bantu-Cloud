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
    <div className="text-center py-16 text-muted-foreground">
      <Shield size={40} className="mx-auto mb-3 opacity-30" />
      <p className="font-medium">License management is only available to platform administrators</p>
    </div>
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">License Management</h1>
        <p className="text-muted-foreground text-sm font-medium">Manage client licenses</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground"><Loader size={24} className="animate-spin" /></div>
      ) : licenses.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground bg-primary rounded-2xl border border-border">
          <Shield size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No licenses found</p>
        </div>
      ) : (
        <div className="tbl-container">
          <div className="tbl-scroll">
          <table className="w-full text-left">
            <thead>
              <tr className="tbl-head-row">
                {['Client', 'Token (partial)', 'Issued', 'Expires', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="tbl-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {licenses.map((lic: any) => {
                const isActive = lic.isActive && (!lic.expiresAt || new Date(lic.expiresAt) > new Date());
                return (
                  <tr key={lic.id} className="tbl-row">
                    <td className="tbl-td font-bold">{lic.client?.name || lic.clientId}</td>
                    <td className="tbl-td font-mono text-muted-foreground">{lic.token?.slice(0, 12)}…</td>
                    <td className="tbl-td">{lic.createdAt ? new Date(lic.createdAt).toLocaleDateString() : '—'}</td>
                    <td className="tbl-td">{lic.expiresAt ? new Date(lic.expiresAt).toLocaleDateString() : 'Never'}</td>
                    <td className="tbl-td">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                        {isActive ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                        {isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="tbl-td">
                      {actionLoading === lic.clientId ? (
                        <Clock size={14} className="text-muted-foreground animate-spin" />
                      ) : isActive ? (
                        <button onClick={() => handleRevoke(lic.clientId)} className="text-xs font-bold text-red-500 hover:underline">
                          Revoke
                        </button>
                      ) : (
                        <button onClick={() => handleReactivate(lic.clientId)} className="text-xs font-bold text-accent-green hover:underline">
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
