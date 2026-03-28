import React from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, RefreshCw, Calendar, FileText, Percent, CalendarDays, Globe, GraduationCap, Clock } from 'lucide-react';

const UTILITIES = [
  {
    path: '/utilities/payroll-calendar',
    icon: <CalendarDays size={24} />,
    title: 'Payroll Calendar',
    description: 'Create and manage payroll periods — set pay dates, open and close pay cycles',
    color: 'text-indigo-500',
    bg: 'bg-indigo-50',
  },
  {
    path: '/utilities/pay-increase',
    icon: <TrendingUp size={24} />,
    title: 'Bulk Pay Increase',
    description: 'Apply a percentage or fixed increase to a group of employees',
    color: 'text-emerald-500',
    bg: 'bg-emerald-50',
  },
  {
    path: '/utilities/back-pay',
    icon: <RefreshCw size={24} />,
    title: 'Back Pay Calculator',
    description: 'Calculate back pay owed between two dates for selected employees',
    color: 'text-blue-500',
    bg: 'bg-blue-50',
  },
  {
    path: '/utilities/transactions',
    icon: <FileText size={24} />,
    title: 'Transaction Codes',
    description: 'Import or manage transaction codes in bulk',
    color: 'text-purple-500',
    bg: 'bg-purple-50',
  },
  {
    path: '/utilities/period-end',
    icon: <Calendar size={24} />,
    title: 'Period End Processing',
    description: 'Close a payroll period and finalise all runs',
    color: 'text-amber-500',
    bg: 'bg-amber-50',
  },
  {
    path: '/utilities/tax-tables',
    icon: <Percent size={24} />,
    title: 'Tax Tables',
    description: 'Manage multi-currency progressive tax structures and bulk-upload brackets',
    color: 'text-rose-500',
    bg: 'bg-rose-50',
  },
  {
    path: '/utilities/nssa',
    icon: <span style={{ fontWeight: 900, fontSize: 20 }}>N</span>,
    title: 'NSSA Settings',
    description: 'Configure National Social Security Authority contribution rates and earnings ceiling',
    color: 'text-teal-600',
    bg: 'bg-teal-50',
  },
  {
    path: '/utilities/public-holidays',
    icon: '🇿🇼',
    title: 'Public Holidays',
    description: 'Manage Zimbabwean public holidays used for attendance tracking and payroll calculations',
    color: 'text-orange-500',
    bg: 'bg-orange-50',
  },
  {
    path: '/utilities/statutory-rates',
    icon: <Percent size={24} />,
    title: 'Statutory Rates',
    description: 'Manage global default rates for SDF and ZIMDEF (Standard Zimbabwean rates)',
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
  },
  {
    path: '/utilities/work-period',
    icon: <Clock size={24} />,
    title: 'Work Period Settings',
    description: 'Set default working days per period, hours per day, and calendar days — used as fallbacks when employees have no individual override',
    color: 'text-cyan-600',
    bg: 'bg-cyan-50',
  },
  {
    path: '/currency-rates',
    icon: <Globe size={24} />,
    title: 'Currency Rates',
    description: 'Set USD / ZiG exchange rates used in payroll calculations',
    color: 'text-blue-500',
    bg: 'bg-blue-50',
  },
  {
    path: '/grades',
    icon: <GraduationCap size={24} />,
    title: 'Salary Grades',
    description: 'Define salary bands and pay grades for job classifications',
    color: 'text-purple-500',
    bg: 'bg-purple-50',
  },
  {
    path: '/utilities/backup',
    icon: <div className="p-1 border-2 border-current rounded-md">💾</div>,
    title: 'Backup & Restore',
    description: 'Export your entire company data to a JSON file or restore from a previous backup',
    color: 'text-rose-600',
    bg: 'bg-rose-50',
  },
];

const UtilitiesHub: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Utilities</h1>
        <p className="text-slate-500 text-sm font-medium">Payroll utilities and bulk operations</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {UTILITIES.map((u) => (
          <button
            key={u.path}
            onClick={() => navigate(u.path)}
            className="bg-primary border border-border rounded-2xl p-6 shadow-sm hover:border-accent-blue hover:shadow-md transition-all text-left flex items-start gap-4"
          >
            <div className={`w-12 h-12 ${u.bg} rounded-xl flex items-center justify-center ${u.color} shrink-0`}>
              {u.icon}
            </div>
            <div>
              <p className="font-bold text-navy mb-1">{u.title}</p>
              <p className="text-sm text-slate-500 font-medium leading-relaxed">{u.description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default UtilitiesHub;
