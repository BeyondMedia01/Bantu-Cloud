import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Building2, ShieldCheck, Settings, ClipboardList, HardDrive } from 'lucide-react';
import { AdminAPI } from '../../api/client';

const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AdminAPI.getStats()
      .then((r) => setStats(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const statCards = [
    { label: 'Total Users',      value: stats?.userCount          ?? '—', icon: <Users size={20} />,     path: '/admin/users' },
    { label: 'Total Clients',    value: stats?.clientCount        ?? '—', icon: <Building2 size={20} />, path: '/admin/clients' },
    { label: 'Active Licenses',  value: stats?.activeLicenseCount ?? '—', icon: <ShieldCheck size={20} />, path: '/admin/licenses' },
    { label: 'System Settings',  value: stats?.settingCount       ?? '—', icon: <Settings size={20} />, path: '/admin/settings' },
  ];

  const quickLinks = [
    { title: 'User Management',   desc: 'Create and manage platform users',              path: '/admin/users',    icon: <Users size={18} /> },
    { title: 'Client Management', desc: 'Manage clients and module access',              path: '/admin/clients',  icon: <Building2 size={18} /> },
    { title: 'License Management',desc: 'Issue, revoke and monitor licenses',            path: '/admin/licenses', icon: <ShieldCheck size={18} /> },
    { title: 'System Settings',   desc: 'Configure platform-wide settings',              path: '/admin/settings', icon: <Settings size={18} /> },
    { title: 'Audit Logs',        desc: 'Track all platform actions across users',       path: '/admin/logs',     icon: <ClipboardList size={18} /> },
    { title: 'Backup & Restore',  desc: 'Export and restore platform data',              path: '/admin/backup',   icon: <HardDrive size={18} /> },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-navy">Platform Administration</h1>
        <p className="text-muted-foreground font-medium text-sm">Manage the Bantu Payroll platform</p>
      </header>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((c) => (
          <Link
            key={c.path}
            to={c.path}
            className="bg-primary border border-border rounded-2xl p-6 shadow-sm hover:border-accent-green hover:shadow-md transition-all block"
          >
            {loading ? (
              <div className="animate-pulse space-y-3">
                <div className="w-10 h-10 rounded-xl bg-muted" />
                <div className="h-6 w-10 bg-muted rounded" />
                <div className="h-3 w-24 bg-muted rounded" />
              </div>
            ) : (
              <>
                <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center text-brand mb-4">
                  {c.icon}
                </div>
                <p className="text-2xl font-bold text-navy mb-1">{c.value}</p>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{c.label}</p>
              </>
            )}
          </Link>
        ))}
      </div>

      {/* Quick links */}
      <div>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Quick Access</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {quickLinks.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className="bg-primary border border-border rounded-2xl p-5 shadow-sm hover:border-accent-green hover:shadow-md transition-all flex items-start gap-4"
            >
              <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center text-muted-foreground shrink-0 mt-0.5">
                {item.icon}
              </div>
              <div>
                <p className="font-bold text-navy text-sm">{item.title}</p>
                <p className="text-xs text-muted-foreground font-medium mt-0.5">{item.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
