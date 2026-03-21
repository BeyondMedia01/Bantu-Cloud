import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, Percent, Globe, GraduationCap, Wrench,
  ShieldCheck, Save, Edit2, X, Check, ChevronRight, Scale,
} from 'lucide-react';
import { CompanyAPI } from '../api/client';
import { getActiveCompanyId } from '../lib/companyContext';

const QUICK_LINKS = [
  {
    path: '/utilities/tax-tables',
    icon: <Percent size={20} />,
    title: 'Tax Tables',
    description: 'Manage progressive PAYE tax brackets for USD and ZiG',
    color: 'text-rose-500',
    bg: 'bg-rose-50',
  },
  {
    path: '/currency-rates',
    icon: <Globe size={20} />,
    title: 'Currency Rates',
    description: 'Set USD / ZiG exchange rates used in payroll calculations',
    color: 'text-blue-500',
    bg: 'bg-blue-50',
  },
  {
    path: '/utilities/nssa',
    icon: <ShieldCheck size={20} />,
    title: 'NSSA Settings',
    description: 'Configure NSSA contribution rates and earnings ceiling',
    color: 'text-teal-600',
    bg: 'bg-teal-50',
  },
  {
    path: '/grades',
    icon: <GraduationCap size={20} />,
    title: 'Salary Grades',
    description: 'Define salary bands and pay grades for job classifications',
    color: 'text-purple-500',
    bg: 'bg-purple-50',
  },
  {
    path: '/utilities/transactions',
    icon: <Wrench size={20} />,
    title: 'Transaction Codes',
    description: 'Manage earnings, deduction, and benefit codes',
    color: 'text-amber-500',
    bg: 'bg-amber-50',
  },
  {
    path: '/utilities/nec-tables',
    icon: <Scale size={20} />,
    title: 'NEC Tables',
    description: 'National Employment Council minimum wage tables and levy rates',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
  },
];

const ClientSettings: React.FC = () => {
  const navigate = useNavigate();
  const companyId = getActiveCompanyId();

  const [company, setCompany] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    CompanyAPI.getById(companyId)
      .then((r) => {
        setCompany(r.data);
        setForm(r.data);
      })
      .catch(() => {});
  }, [companyId]);

  const handleSave = async () => {
    if (!companyId) return;
    setSaving(true);
    setSaveError('');
    setSaveSuccess(false);
    try {
      const updated = await CompanyAPI.update(companyId, {
        name: form.name,
        registrationNumber: form.registrationNumber,
        taxId: form.taxId,
        address: form.address,
        contactEmail: form.contactEmail,
        contactPhone: form.contactPhone,
      });
      setCompany(updated.data);
      setEditing(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setSaveError(err.response?.data?.message || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setForm(company);
    setEditing(false);
    setSaveError('');
  };

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-slate-500 text-sm font-medium">Company profile and payroll configuration</p>
      </header>

      {/* Company Profile Card */}
      <div className="bg-primary border border-border rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 text-blue-500 rounded-xl">
              <Building2 size={18} />
            </div>
            <h2 className="font-bold text-navy">Company Profile</h2>
          </div>
          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-border text-sm font-bold text-slate-500 hover:bg-white transition-colors"
            >
              <Edit2 size={14} /> Edit
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-btn-primary text-navy text-sm font-bold hover:opacity-90 disabled:opacity-60"
              >
                <Save size={14} /> {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={handleCancel}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-border text-sm font-bold text-slate-500 hover:bg-white transition-colors"
              >
                <X size={14} /> Cancel
              </button>
            </div>
          )}
        </div>

        {saveSuccess && (
          <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 font-medium flex items-center gap-2">
            <Check size={15} /> Changes saved successfully.
          </div>
        )}
        {saveError && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium">
            {saveError}
          </div>
        )}

        {company ? (
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
            {[
              { label: 'Company Name', key: 'name', required: true },
              { label: 'Registration Number', key: 'registrationNumber' },
              { label: 'Tax ID (ZIMRA)', key: 'taxId' },
              { label: 'Contact Email', key: 'contactEmail', type: 'email' },
              { label: 'Contact Phone', key: 'contactPhone' },
              { label: 'Address', key: 'address' },
            ].map(({ label, key, type, required }) => (
              <div key={key}>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">{label}</label>
                {editing ? (
                  <input
                    type={type || 'text'}
                    value={form[key] || ''}
                    onChange={(e) => setForm((p: any) => ({ ...p, [key]: e.target.value }))}
                    required={required}
                    className="w-full px-4 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue"
                  />
                ) : (
                  <p className="text-sm font-semibold text-navy px-1">{company[key] || <span className="text-slate-300 font-medium">—</span>}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center text-slate-400 text-sm font-medium">
            {companyId ? 'Loading company details…' : 'No active company selected.'}
          </div>
        )}
      </div>

      {/* Quick Links */}
      <div>
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Configuration</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {QUICK_LINKS.map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="bg-primary border border-border rounded-2xl p-5 shadow-sm hover:border-accent-blue hover:shadow-md transition-all text-left flex items-start gap-4"
            >
              <div className={`w-10 h-10 ${item.bg} rounded-xl flex items-center justify-center ${item.color} shrink-0`}>
                {item.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-navy text-sm mb-0.5">{item.title}</p>
                <p className="text-xs text-slate-500 font-medium leading-relaxed">{item.description}</p>
              </div>
              <ChevronRight size={16} className="text-slate-300 shrink-0 mt-0.5" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ClientSettings;
