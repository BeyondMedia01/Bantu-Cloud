import React from 'react';
import { useNavigate } from 'react-router-dom';
import { User, ShieldCheck, ChevronRight, CreditCard, Monitor, Calendar, Globe, ChevronDown } from 'lucide-react';
import { Dropdown } from '@/components/ui/dropdown';
import { useSettings } from '../context/SettingsContext';
import type { Theme, DateFormat } from '../context/SettingsContext';

const SETTINGS_SECTIONS = [
  {
    title: 'Account & Security',
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
  const { preferences, updatePreferences } = useSettings();

  return (
    <div className="flex flex-col gap-8 max-w-4xl">
      <header>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-slate-500 text-sm font-medium">Platform preferences and account management</p>
      </header>

      {/* Global Preferences Section */}
      <section>
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Platform Preferences</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Theme Picker */}
          <div className="bg-primary border border-border rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center text-blue-500">
                <Monitor size={18} />
              </div>
              <h3 className="font-bold text-sm">Theme Appearance</h3>
            </div>
            <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl gap-1">
              {(['light', 'dark', 'system'] as Theme[]).map((t) => (
                <button
                  key={t}
                  onClick={() => updatePreferences({ theme: t })}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg capitalize transition-all ${
                    preferences.theme === t 
                      ? 'bg-white dark:bg-slate-700 shadow-sm text-navy' 
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Date Format */}
          <div className="bg-primary border border-border rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-500">
                <Calendar size={18} />
              </div>
              <h3 className="font-bold text-sm">Date Formatting</h3>
            </div>
            <Dropdown className="w-full" trigger={(isOpen) => (
              <button type="button" className="w-full flex items-center justify-between px-3 py-2 bg-slate-100 rounded-xl text-xs font-bold hover:bg-slate-200 transition-colors">
                <span>{{  'DD/MM/YYYY': 'DD/MM/YYYY (UK/ZW)', 'MM/DD/YYYY': 'MM/DD/YYYY (US)', 'YYYY-MM-DD': 'YYYY-MM-DD (ISO)' }[preferences.dateFormat] || preferences.dateFormat}</span>
                <ChevronDown size={12} className={`text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
            )} sections={[{ items: [
              { label: 'DD/MM/YYYY (UK/ZW)', onClick: () => updatePreferences({ dateFormat: 'DD/MM/YYYY' as DateFormat }) },
              { label: 'MM/DD/YYYY (US)', onClick: () => updatePreferences({ dateFormat: 'MM/DD/YYYY' as DateFormat }) },
              { label: 'YYYY-MM-DD (ISO)', onClick: () => updatePreferences({ dateFormat: 'YYYY-MM-DD' as DateFormat }) },
            ]}]} />
          </div>

          {/* Language */}
          <div className="bg-primary border border-border rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center text-purple-500">
                <Globe size={18} />
              </div>
              <h3 className="font-bold text-sm">Language</h3>
            </div>
            <Dropdown className="w-full" trigger={(isOpen) => {
              const langs: Record<string,string> = { en: 'English (Bantu)', sn: 'Shona (Zimbabwe) — Soon', nd: 'Ndebele (Zimbabwe) — Soon' };
              return (
                <button type="button" className="w-full flex items-center justify-between px-3 py-2 bg-slate-100 rounded-xl text-xs font-bold hover:bg-slate-200 transition-colors">
                  <span>{langs[preferences.language] || preferences.language}</span>
                  <ChevronDown size={12} className={`text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
              );
            }} sections={[{ items: [
              { label: 'English (Bantu)', onClick: () => updatePreferences({ language: 'en' }) },
              { label: 'Shona (Zimbabwe) — Soon', onClick: () => updatePreferences({ language: 'sn' }) },
              { label: 'Ndebele (Zimbabwe) — Soon', onClick: () => updatePreferences({ language: 'nd' }) },
            ]}]} />
          </div>

        </div>
      </section>

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
