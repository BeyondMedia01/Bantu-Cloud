import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Shield, Info } from 'lucide-react';
import { NSSASettingsAPI, type NSSASettings } from '../../api/client';

const NSSASettingsPage: React.FC = () => {
  const navigate = useNavigate();

  const [form, setForm] = useState<NSSASettings>({
    employeeRate: 3.5,
    employerRate: 3.5,
    ceilingUSD: 700,
    wcifRate: 0.01,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    NSSASettingsAPI.get()
      .then((res) => setForm(res.data))
      .catch(() => {/* use defaults */})
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (field: keyof NSSASettings, value: string) => {
    setForm((prev) => ({ ...prev, [field]: parseFloat(value) || 0 }));
    setSuccess(false);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      await NSSASettingsAPI.update(form);
      setSuccess(true);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save NSSA settings');
    } finally {
      setSaving(false);
    }
  };

  const totalRate = (form.employeeRate + form.employerRate).toFixed(2);
  const maxEmployeeContrib = ((form.employeeRate / 100) * form.ceilingUSD).toFixed(2);
  const maxEmployerContrib = ((form.employerRate / 100) * form.ceilingUSD).toFixed(2);

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate('/utilities')} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold">NSSA Settings</h1>
          <p className="text-slate-500 font-medium text-sm">Configure National Social Security Authority contribution rates</p>
        </div>
      </div>

      {loading ? (
        <div className="text-slate-400 text-sm font-medium">Loading…</div>
      ) : (
        <>
          {/* Info banner */}
          <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-6 text-sm text-blue-700">
            <Info size={18} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-bold mb-0.5">Zimbabwe NSSA (National Social Security Act, Chapter 17:04)</p>
              <p className="font-medium">Standard rates: <strong>3.5% employee</strong> + <strong>3.5% employer</strong> on pensionable earnings, capped at <strong>USD 700/month</strong>. Update these values if NSSA revises its rates.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Rates card */}
            <div className="bg-primary rounded-2xl border border-border p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Shield size={18} className="text-slate-400" />
                <h3 className="font-bold text-sm uppercase tracking-wider text-slate-400">Contribution Rates</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-1.5">
                    Employee Rate (%)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={form.employeeRate}
                      onChange={(e) => handleChange('employeeRate', e.target.value)}
                      className="w-full px-4 py-2.5 pr-10 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue"
                      required
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">%</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-1.5">
                    Employer Rate (%)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={form.employerRate}
                      onChange={(e) => handleChange('employerRate', e.target.value)}
                      className="w-full px-4 py-2.5 pr-10 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue"
                      required
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">%</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-1.5">
                    WCIF Rate (%)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={form.wcifRate}
                      onChange={(e) => handleChange('wcifRate', e.target.value)}
                      className="w-full px-4 py-2.5 pr-10 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue"
                      required
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Ceiling card */}
            <div className="bg-primary rounded-2xl border border-border p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Shield size={18} className="text-slate-400" />
                <h3 className="font-bold text-sm uppercase tracking-wider text-slate-400">Maximum Insurable Earnings</h3>
              </div>

              <div className="max-w-xs">
                <label className="block text-sm font-bold text-slate-600 mb-1.5">
                  Earnings Ceiling (USD / month)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">$</span>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={form.ceilingUSD}
                    onChange={(e) => handleChange('ceilingUSD', e.target.value)}
                    className="w-full pl-8 pr-4 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue"
                    required
                  />
                </div>
                <p className="text-xs text-slate-400 font-medium mt-1.5">
                  Contributions are calculated on actual earnings up to this ceiling.
                </p>
              </div>
            </div>

            {/* Summary */}
            <div className="bg-slate-50 border border-border rounded-2xl p-5">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Contribution Summary</p>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xl font-bold text-navy">{totalRate}%</p>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">Total Rate</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-emerald-600">USD {maxEmployeeContrib}</p>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">Max Employee / mo</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-blue-600">USD {maxEmployerContrib}</p>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">Max Employer / mo</p>
                </div>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium">{error}</div>
            )}
            {success && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 font-medium">
                NSSA settings saved successfully.
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 bg-btn-primary text-navy px-8 py-3 rounded-full font-bold shadow hover:opacity-90 disabled:opacity-60"
              >
                <Save size={16} /> {saving ? 'Saving…' : 'Save Settings'}
              </button>
              <button
                type="button"
                onClick={() => navigate('/utilities')}
                className="px-6 py-3 rounded-full border border-border font-bold text-slate-500 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
};

export default NSSASettingsPage;
