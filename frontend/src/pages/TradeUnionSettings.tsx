import React, { useEffect, useState } from 'react';
import { Settings, Save, Users } from 'lucide-react';
import { TradeUnionSettingsAPI, type TradeUnionSettings } from '../api/client';
import { useToast } from '../context/ToastContext';

const TradeUnionSettingsPage: React.FC<{ activeCompanyId?: string | null }> = ({ activeCompanyId }) => {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<TradeUnionSettings>({ employeeRate: 1, employerRate: 1 });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchSettings = async () => {
    try {
      const res = await TradeUnionSettingsAPI.get();
      setSettings(res.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, [activeCompanyId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await TradeUnionSettingsAPI.update(settings);
      showToast('Trade union rates updated successfully', 'success');
    } catch {
      showToast('Failed to update trade union rates', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-8 flex flex-col gap-8">
      {/* Header */}
      <div className="bg-navy rounded-2xl p-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-white/10 rounded-2xl text-white">
            <Users size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-white tracking-tight">Trade Union</h2>
            <p className="text-sm text-white/60 font-medium">Configure employee and employer trade union contribution rates.</p>
          </div>
        </div>
      </div>

      {/* Settings Panel */}
      <div className="bg-card rounded-3xl border border-border shadow-sm overflow-hidden">
        <div className="p-6 border-b border-border flex items-center gap-3">
          <div className="p-2 bg-accent-green/10 rounded-xl text-accent-green">
            <Settings size={18} />
          </div>
          <div>
            <h3 className="font-black text-navy text-base tracking-tight">Contribution Rates</h3>
            <p className="text-xs text-muted-foreground font-medium">Global trade union contribution rates applied to all payroll runs.</p>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-muted-foreground text-sm font-medium">Loading...</div>
        ) : (
          <form onSubmit={handleSave} className="p-8 flex flex-col gap-6 max-w-md">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Employee Rate (%)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  className="w-full px-4 py-3 bg-muted border border-border rounded-xl font-bold text-navy outline-none focus:ring-2 focus:ring-accent-green/10 focus:border-accent-green transition-all"
                  value={settings.employeeRate}
                  onChange={e => setSettings(s => ({ ...s, employeeRate: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Employer Rate (%)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  className="w-full px-4 py-3 bg-muted border border-border rounded-xl font-bold text-navy outline-none focus:ring-2 focus:ring-accent-green/10 focus:border-accent-green transition-all"
                  value={settings.employerRate}
                  onChange={e => setSettings(s => ({ ...s, employerRate: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>

            <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 text-[11px] leading-relaxed text-blue-800 font-medium">
              <p className="font-bold mb-1">Note:</p>
              <p>Set both rates to 0 to disable trade union contributions. These rates are applied as a percentage of the employee's base salary on each payroll run.</p>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-6 py-3 bg-navy text-white font-bold rounded-2xl hover:bg-navy/90 transition-colors disabled:opacity-50 text-sm"
              >
                <Save size={16} />
                {saving ? 'Saving...' : 'Save Rates'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default TradeUnionSettingsPage;
