import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Clock, Info } from 'lucide-react';
import api from '../../api/client';

interface WorkPeriodForm {
  WORKING_DAYS_PER_PERIOD: number;
  WORKING_DAYS_PER_MONTH: number;
  HOURS_PER_DAY: number;
  DAYS_PER_MONTH: number;
}

const WorkPeriodSettings: React.FC = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState<WorkPeriodForm>({
    WORKING_DAYS_PER_PERIOD: 22,
    WORKING_DAYS_PER_MONTH: 22,
    HOURS_PER_DAY: 8,
    DAYS_PER_MONTH: 30,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/work-period-settings')
      .then((res) => {
        const data = res.data as Record<string, { value: number }>;
        setForm({
          WORKING_DAYS_PER_PERIOD: data.WORKING_DAYS_PER_PERIOD?.value ?? 22,
          WORKING_DAYS_PER_MONTH:  data.WORKING_DAYS_PER_MONTH?.value  ?? 22,
          HOURS_PER_DAY:           data.HOURS_PER_DAY?.value           ?? 8,
          DAYS_PER_MONTH:          data.DAYS_PER_MONTH?.value          ?? 30,
        });
      })
      .catch(() => {/* use defaults */})
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (field: keyof WorkPeriodForm, value: string) => {
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
      await api.put('/work-period-settings', form);
      setSuccess(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save settings');
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
          <h1 className="text-2xl font-bold">Work Period Settings</h1>
          <p className="text-muted-foreground font-medium text-sm">Configure default working days and hours used in payroll calculations</p>
        </div>
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm font-medium">Loading…</div>
      ) : (
        <>
          <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-6 text-sm text-blue-700">
            <Info size={18} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-bold mb-0.5">System-wide defaults</p>
              <p className="font-medium text-xs">
                These values are used when an employee has no individual override set on their Pay tab.
                Employee-level settings always take precedence over these defaults.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-primary rounded-2xl border border-border p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Clock size={18} className="text-muted-foreground" />
                <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Working Days</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-foreground/80 mb-1.5">
                    Working Days per Period
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    max="31"
                    value={form.WORKING_DAYS_PER_PERIOD}
                    onChange={(e) => handleChange('WORKING_DAYS_PER_PERIOD', e.target.value)}
                    className="w-full px-4 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/30 focus:border-accent-green"
                    required
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">Used for pro-rating, short-time, and daily rate calculations</p>
                </div>

                <div>
                  <label className="block text-sm font-bold text-foreground/80 mb-1.5">
                    Working Days per Month <span className="text-muted-foreground font-normal">(legacy)</span>
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    max="31"
                    value={form.WORKING_DAYS_PER_MONTH}
                    onChange={(e) => handleChange('WORKING_DAYS_PER_MONTH', e.target.value)}
                    className="w-full px-4 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/30 focus:border-accent-green"
                    required
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">Fallback if Working Days per Period is not set</p>
                </div>

                <div>
                  <label className="block text-sm font-bold text-foreground/80 mb-1.5">
                    Calendar Days per Month
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="28"
                    max="31"
                    value={form.DAYS_PER_MONTH}
                    onChange={(e) => handleChange('DAYS_PER_MONTH', e.target.value)}
                    className="w-full px-4 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/30 focus:border-accent-green"
                    required
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">Used for leave encashment and termination notice pay</p>
                </div>
              </div>
            </div>

            <div className="bg-primary rounded-2xl border border-border p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Clock size={18} className="text-muted-foreground" />
                <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Working Hours</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-foreground/80 mb-1.5">
                    Hours per Day
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    max="24"
                    value={form.HOURS_PER_DAY}
                    onChange={(e) => handleChange('HOURS_PER_DAY', e.target.value)}
                    className="w-full px-4 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/30 focus:border-accent-green"
                    required
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Used to derive hours/period when employee has no Hours per Period set.
                    Also used for hourly notice pay in termination.
                  </p>
                </div>

                <div className="flex items-center bg-muted border border-border rounded-xl p-4">
                  <div className="text-sm text-muted-foreground font-medium">
                    <p className="font-bold text-foreground/90 mb-1">Derived Hours per Period</p>
                    <p className="text-2xl font-bold text-slate-800">
                      {(form.WORKING_DAYS_PER_PERIOD * form.HOURS_PER_DAY).toFixed(1)}
                      <span className="text-sm font-medium text-muted-foreground ml-1">hrs</span>
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {form.WORKING_DAYS_PER_PERIOD} days × {form.HOURS_PER_DAY} hrs/day
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium">{error}</div>
            )}
            {success && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 font-medium">
                Work period settings saved successfully.
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

export default WorkPeriodSettings;
