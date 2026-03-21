import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Building2, ShieldCheck, Settings, Loader } from 'lucide-react';
import { AdminAPI } from '../../api/client';

const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AdminAPI.getStats().then((r) => setStats(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const cards = [
    { label: 'Total Users', value: stats?.userCount ?? '—', icon: <Users size={20} />, path: '/admin/users', color: 'text-blue-500 bg-blue-50' },
    { label: 'Total Clients', value: stats?.clientCount ?? '—', icon: <Building2 size={20} />, path: '/admin/clients', color: 'text-purple-500 bg-purple-50' },
    { label: 'Active Licenses', value: stats?.activeLicenseCount ?? '—', icon: <ShieldCheck size={20} />, path: '/admin/licenses', color: 'text-emerald-500 bg-emerald-50' },
    { label: 'System Settings', value: stats?.settingCount ?? '—', icon: <Settings size={20} />, path: '/admin/settings', color: 'text-amber-500 bg-amber-50' },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Platform Administration</h1>
        <p className="text-slate-500 text-sm font-medium">Manage the Bantu Payroll platform</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-slate-400"><Loader size={24} className="animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {cards.map((c) => (
            <button
              key={c.path}
              onClick={() => navigate(c.path)}
              className="bg-primary border border-border rounded-2xl p-6 shadow-sm hover:border-accent-blue hover:shadow-md transition-all text-left"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.color} mb-4`}>
                {c.icon}
              </div>
              <p className="text-2xl font-bold mb-1">{c.value}</p>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{c.label}</p>
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { title: 'User Management', desc: 'Create, edit, and manage platform users and roles', path: '/admin/users' },
          { title: 'Client Management', desc: 'Manage clients and their company structures', path: '/admin/clients' },
          { title: 'License Management', desc: 'Issue, revoke, and monitor client licenses', path: '/admin/licenses' },
          { title: 'System Settings', desc: 'Configure platform-wide settings and defaults', path: '/admin/settings' },
          { title: 'Audit Logs', desc: 'Track all platform actions across users and resources', path: '/admin/logs' },
        ].map((item) => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className="bg-primary border border-border rounded-2xl p-6 shadow-sm hover:border-accent-blue hover:shadow-md transition-all text-left"
          >
            <p className="font-bold mb-1">{item.title}</p>
            <p className="text-sm text-slate-500 font-medium">{item.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
};

export default AdminDashboard;
