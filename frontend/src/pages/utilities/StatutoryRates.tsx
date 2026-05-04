import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Shield, Info } from 'lucide-react';
import { StatutoryRatesAPI } from '../../api/client';

const StatutoryRates: React.FC = () => {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    sdfRate: 0.5,
    zimdefRate: 1.0,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    StatutoryRatesAPI.get()
      .then((res) => setForm(res.data))
      .catch(() => {/* use defaults */})
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (field: string, value: string) => {
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
      await StatutoryRatesAPI.update(form);
      setSuccess(true);
    } catch {
      setError(err.response?.data?.message || 'Failed to save statutory rates');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate('/utilities')} aria-label="Go back" className="p-2 hover:bg-muted rounded-xl transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold">Statutory Rates</h1>
          <p className="text-muted-foreground font-medium text-sm">Configure global default rates for SDF and ZIMDEF</p>
        </div>
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm font-medium">Loading…</div>
      ) : (
        <>
          <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-6 text-sm text-blue-700">
            <Info size={18} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-bold mb-0.5">Zimbabwe Statutory Funds</p>
              <p className="font-medium text-xs">These are the global system defaults. They can be overridden at the company level in the Company Directory.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-primary rounded-2xl border border-border p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Shield size={18} className="text-muted-foreground" />
                <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Employer Contributions</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-foreground/80 mb-1.5">
                    SDF Rate (%)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={form.sdfRate}
                      onChange={(e) => handleChange('sdfRate', e.target.value)}
                      className="w-full px-4 py-2.5 pr-10 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/30 focus:border-accent-green"
                      required
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-bold">%</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">Standards Development Fund (default: 0.5%)</p>
                </div>

                <div>
                  <label className="block text-sm font-bold text-foreground/80 mb-1.5">
                    ZIMDEF Rate (%)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={form.zimdefRate}
                      onChange={(e) => handleChange('zimdefRate', e.target.value)}
                      className="w-full px-4 py-2.5 pr-10 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/30 focus:border-accent-green"
                      required
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-bold">%</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">Zimbabwe Manpower Development Fund (default: 1.0%)</p>
                </div>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium">{error}</div>
            )}
            {success && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 font-medium">
                Statutory rates saved successfully.
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-1.5 bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 disabled:opacity-60"
              >
                <Save size={16} /> {saving ? 'Saving…' : 'Save Settings'}
              </button>
              <button
                type="button"
                onClick={() => navigate('/utilities')}
                className="px-4 py-2 rounded-full border border-border font-bold text-muted-foreground hover:bg-muted"
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

export default StatutoryRates;
