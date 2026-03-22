import React from 'react';
import { useNavigate } from 'react-router-dom';
import { User, ShieldCheck, ChevronRight, CreditCard } from 'lucide-react';

const SETTINGS_SECTIONS = [
  {
    title: 'Account',
    items: [
      {
        path: '/profile',
        icon: <User size={20} />,
        title: 'Profile & Password',
        description: 'Update your name, email address and change your password',
        color: 'text-blue-500',
        bg: 'bg-blue-50',
      },
      {
        path: '/subscription',
        icon: <CreditCard size={20} />,
        title: 'Subscription',
        description: 'View your current plan and manage billing',
        color: 'text-emerald-500',
        bg: 'bg-emerald-50',
      },
      {
        path: '/license',
        icon: <ShieldCheck size={20} />,
        title: 'License',
        description: 'View and manage your software license key',
        color: 'text-purple-500',
        bg: 'bg-purple-50',
      },
    ],
  },
];

const ClientSettings: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-slate-500 text-sm font-medium">Account preferences and platform settings</p>
      </header>

      {SETTINGS_SECTIONS.map((section) => (
        <div key={section.title}>
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">{section.title}</h2>
          <div className="flex flex-col divide-y divide-border bg-primary border border-border rounded-2xl shadow-sm overflow-hidden">
            {section.items.map((item) => (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="p-5 hover:bg-slate-50 transition-colors text-left flex items-center gap-4"
              >
                <div className={`w-10 h-10 ${item.bg} rounded-xl flex items-center justify-center ${item.color} shrink-0`}>
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-navy text-sm mb-0.5">{item.title}</p>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">{item.description}</p>
                </div>
                <ChevronRight size={16} className="text-slate-300 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ClientSettings;
