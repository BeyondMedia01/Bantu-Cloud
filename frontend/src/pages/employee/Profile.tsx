import React, { useEffect, useState } from 'react';
import { Save, Loader } from 'lucide-react';
import { EmployeeSelfAPI } from '../../api/client';

const ZIMBABWE_BANKS = [
  'Agribank (Agricultural Bank of Zimbabwe)',
  'BancABC Zimbabwe',
  'CABS (Central Africa Building Society)',
  'CBZ Bank',
  'Ecobank Zimbabwe',
  'FBC Bank',
  'First Capital Bank',
  'MetBank',
  'NMB Bank',
  "POSB (People's Own Savings Bank)",
  'Stanbic Bank Zimbabwe',
  'Standard Chartered Bank Zimbabwe',
  'Steward Bank',
  'ZB Bank',
];

const EmployeeProfile: React.FC = () => {
  const [profile, setProfile] = useState<any>(null);
  const [form, setForm] = useState({ homeAddress: '', nextOfKin: '', bankName: '', accountNumber: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    EmployeeSelfAPI.getProfile()
      .then((r) => {
        const p = r.data;
        setProfile(p);
        setForm({
          homeAddress: p.homeAddress || '',
          nextOfKin: p.nextOfKin || '',
          bankName: p.bankName || '',
          accountNumber: p.accountNumber || '',
        });
      })
      .catch((err: any) => setError(err.response?.data?.message || 'Failed to load profile'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await EmployeeSelfAPI.updateProfile(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 5000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [f]: e.target.value }));

  if (loading) return (
    <div className="flex items-center justify-center h-48 text-slate-400"><Loader size={24} className="animate-spin" /></div>
  );

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">My Profile</h1>
        <p className="text-slate-500 text-sm font-medium">View your employment details and update contact information</p>
      </div>

      {/* Read-only info */}
      <div className="bg-primary rounded-2xl border border-border p-6 shadow-sm mb-6">
        <h3 className="font-bold text-sm uppercase tracking-wider text-slate-400 mb-4">Employment Details</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          {[
            ['Full Name', `${profile?.firstName || ''} ${profile?.lastName || ''}`],
            ['Employee Code', profile?.employeeCode || '—'],
            ['Position', profile?.position || '—'],
            ['Department', profile?.department?.name || '—'],
            ['Hire Date', profile?.hireDate ? new Date(profile.hireDate).toLocaleDateString() : '—'],
            ['Employment Type', profile?.employmentType || '—'],
            ['Base Rate', profile?.baseRate ? `${profile.currency || 'USD'} ${profile.baseRate}` : '—'],
            ['Leave Balance', profile?.leaveBalance != null ? `${profile.leaveBalance.toFixed(1)} days` : '—'],
            ['Tax Number', profile?.taxNumber || '—'],
          ].map(([k, v]) => (
            <div key={k}>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">{k}</p>
              <p className="font-medium">{v}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Editable info */}
      {error && <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>}
      {saved && <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 font-medium">Changes saved successfully</div>}

      <form onSubmit={handleSave} className="bg-primary rounded-2xl border border-border p-6 shadow-sm flex flex-col gap-4">
        <h3 className="font-bold text-sm uppercase tracking-wider text-slate-400">Contact & Banking</h3>
        <div className="grid grid-cols-2 gap-4">
          {(['homeAddress', 'nextOfKin'] as const).map((f) => (
            <div key={f}>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                {f === 'homeAddress' ? 'Home Address' : 'Next of Kin'}
              </label>
              <input type="text" value={form[f]} onChange={set(f)}
                className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl font-medium text-sm" />
            </div>
          ))}
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Bank Name</label>
            <datalist id="zw-banks-profile">
              {ZIMBABWE_BANKS.map((b) => <option key={b} value={b} />)}
            </datalist>
            <input
              list="zw-banks-profile"
              value={form.bankName}
              onChange={set('bankName')}
              placeholder="Search or type bank name"
              className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl font-medium text-sm focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Bank Account Number</label>
            <input type="text" value={form.accountNumber} onChange={set('accountNumber')}
              className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl font-medium text-sm" />
          </div>
        </div>
        <button type="submit" disabled={saving} className="flex items-center gap-2 bg-btn-primary text-navy px-8 py-3 rounded-full font-bold shadow hover:opacity-90 disabled:opacity-60 w-fit">
          <Save size={16} /> {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
};

export default EmployeeProfile;
