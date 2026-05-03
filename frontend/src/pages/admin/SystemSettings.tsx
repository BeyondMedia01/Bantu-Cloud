import React, { useEffect, useState } from 'react';
import { Save, Loader } from 'lucide-react';
import { AdminAPI } from '../../api/client';

const SystemSettings: React.FC = () => {
  const [settings, setSettings] = useState<any[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    AdminAPI.getSettings()
      .then((r) => {
        const list = r.data;
        setSettings(list);
        const map: Record<string, string> = {};
        list.forEach((s: any) => { map[s.settingName] = s.settingValue; });
        setValues(map);
      })
      .catch((err: any) => setError(err.response?.data?.message || 'Failed to load settings'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      // Save each setting individually (backend accepts one at a time)
      await Promise.all(
        Object.entries(values).map(([name, value]) => AdminAPI.updateSetting(name, value))
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 5000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-48 text-slate-400"><Loader size={24} className="animate-spin" /></div>
  );

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">System Settings</h1>
        <p className="text-slate-500 text-sm font-medium">Platform-wide configuration</p>
      </div>

      {error && <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>}
      {saved && <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 font-medium">Settings saved successfully</div>}

      <form onSubmit={handleSave}>
        <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden mb-4">
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-slate-50">
                <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider w-1/3 text-left">Setting</th>
                <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider text-left">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {settings.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-4 py-8 text-center text-sm text-slate-400">No settings configured</td>
                </tr>
              ) : (
                settings.map((s: any) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3">
                      <p className="font-bold text-sm">{s.settingName}</p>
                      {s.description && <p className="text-xs text-slate-400 mt-0.5">{s.description}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <input
                        value={values[s.settingName] ?? ''}
                        onChange={(e) => setValues((v) => ({ ...v, [s.settingName]: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-50 border border-border rounded-lg font-medium text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-1.5 bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 disabled:opacity-60"
        >
          <Save size={16} /> {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </form>
    </div>
  );
};

export default SystemSettings;
