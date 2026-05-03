import React, { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, RefreshCw, Wifi, WifiOff, Copy, Eye, EyeOff, Check, X, AlertTriangle, Server } from 'lucide-react';
import { DeviceAPI } from '../../api/client';

const BLANK = {
  name: '', vendor: 'ZKTECO', ipAddress: '', port: 4370,
  username: 'admin', password: '', serialNumber: '', location: '',
};

const VENDOR_LABELS: Record<string, string> = {
  ZKTECO: 'ZKTeco',
  HIKVISION: 'Hikvision',
  OTHER: 'Other',
};

const DeviceForm: React.FC<{
  initial: typeof BLANK;
  onSave: (data: any) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
  error: string;
}> = ({ initial, onSave, onCancel, saving, error }) => {
  const [form, setForm] = useState({ ...initial });
  const [showPwd, setShowPwd] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'number' ? parseInt(e.target.value, 10) : e.target.value }));

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}
      className="bg-primary border border-border rounded-2xl p-6 shadow-sm mb-6">
      <p className="text-xs font-black uppercase tracking-wider text-slate-400 mb-5">
        {initial.name ? 'Edit Device' : 'Add Device'}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1.5">Device Name *</label>
          <input type="text" value={form.name} onChange={set('name')} required
            className="w-full px-3 py-2 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1.5">Vendor</label>
          <select value={form.vendor} onChange={set('vendor')}
            className="w-full px-3 py-2 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue">
            {Object.entries(VENDOR_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1.5">IP Address *</label>
          <input type="text" value={form.ipAddress} onChange={set('ipAddress')} required placeholder="192.168.1.100"
            className="w-full px-3 py-2 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1.5">Port</label>
          <input type="number" value={form.port} onChange={set('port')} min={1} max={65535}
            className="w-full px-3 py-2 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1.5">Username</label>
          <input type="text" value={form.username} onChange={set('username')}
            className="w-full px-3 py-2 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1.5">Password</label>
          <div className="relative">
            <input type={showPwd ? 'text' : 'password'} value={form.password} onChange={set('password')}
              className="w-full px-3 py-2 pr-9 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue" />
            <button type="button" onClick={() => setShowPwd((s) => !s)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1.5">Serial Number</label>
          <input type="text" value={form.serialNumber} onChange={set('serialNumber')} placeholder="For ADMS push matching"
            className="w-full px-3 py-2 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1.5">Location</label>
          <input type="text" value={form.location} onChange={set('location')} placeholder="e.g. Main Entrance"
            className="w-full px-3 py-2 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue" />
        </div>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium mb-4">{error}</div>}

      <div className="flex gap-3">
        <button type="submit" disabled={saving}
          className="flex items-center gap-2 bg-brand text-navy px-5 py-2 rounded-full font-bold text-sm hover:opacity-90 disabled:opacity-60">
          <Check size={14} /> {saving ? 'Saving…' : 'Save Device'}
        </button>
        <button type="button" onClick={onCancel}
          className="flex items-center gap-2 px-4 py-2 border border-border rounded-full font-bold text-sm text-slate-500 hover:bg-slate-50">
          <X size={14} /> Cancel
        </button>
      </div>
    </form>
  );
};

const Devices: React.FC = () => {
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, string>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState('');

  const load = async () => {
    setLoading(true);
    try { const r = await DeviceAPI.getAll(); setDevices(r.data); }
    catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const flash = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const handleSave = async (form: any) => {
    setSaving(true); setError('');
    try {
      if (editing) await DeviceAPI.update(editing.id, form);
      else         await DeviceAPI.create(form);
      setShowForm(false); setEditing(null); load();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to save device.');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this device? Punch logs will be preserved.')) return;
    try { await DeviceAPI.delete(id); load(); }
    catch (e: any) { setError(e.response?.data?.message || 'Failed.'); }
  };

  const handleSync = async (device: any) => {
    setSyncing(device.id); setError('');
    try {
      const res = await DeviceAPI.sync(device.id, {
        startTime: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
        endTime: new Date().toISOString(),
      });
      flash(`Synced ${res.data.imported} records from ${device.name}.`);
      load();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Sync failed. Check device connectivity.');
    } finally { setSyncing(null); }
  };

  const handleTest = async (device: any) => {
    setTesting(device.id);
    try {
      const res = await DeviceAPI.test(device.id);
      setTestResults((r) => ({ ...r, [device.id]: `OK — ${res.data.model || res.data.message || 'Connected'}` }));
    } catch (e: any) {
      setTestResults((r) => ({ ...r, [device.id]: `FAIL — ${e.response?.data?.message || e.message}` }));
    } finally { setTesting(null); }
  };

  const copyKey = (id: string, key: string) => {
    navigator.clipboard.writeText(key).then(() => {
      setCopiedKey(id);
      setTimeout(() => setCopiedKey(null), 2000);
    });
  };

  const fmtRelative = (iso: string | null) => {
    if (!iso) return 'Never';
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  const serverUrl = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold">Biometric Devices</h1>
          <p className="text-slate-500 font-medium text-sm">Manage ZKTeco and Hikvision attendance devices</p>
        </div>
        {!showForm && !editing && (
          <button onClick={() => { setShowForm(true); setError(''); }}
            className="flex items-center gap-2 bg-brand text-navy px-5 py-2.5 rounded-full font-bold shadow hover:opacity-90 text-sm">
            <Plus size={15} /> Add Device
          </button>
        )}
      </div>

      {(showForm && !editing) && (
        <DeviceForm initial={BLANK} onSave={handleSave} onCancel={() => { setShowForm(false); setError(''); }}
          saving={saving} error={error} />
      )}

      {error && !showForm && !editing && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium mb-4 flex items-center gap-2">
          <AlertTriangle size={14} />{error}
        </div>
      )}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 font-medium mb-4">{successMsg}</div>
      )}

      {loading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Loading…</div>
      ) : devices.length === 0 ? (
        <div className="bg-primary border border-dashed border-border rounded-2xl p-12 text-center">
          <Server size={32} className="text-slate-300 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No devices configured yet.</p>
          <button onClick={() => setShowForm(true)} className="mt-3 text-accent-blue text-sm font-bold hover:underline">
            Add first device →
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {devices.map((d) => (
            <div key={d.id}>
              {editing?.id === d.id ? (
                <DeviceForm initial={editing} onSave={handleSave} onCancel={() => { setEditing(null); setError(''); }}
                  saving={saving} error={error} />
              ) : (
                <div className="bg-primary border border-border rounded-2xl p-5 shadow-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${d.isActive ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                        {d.isActive ? <Wifi size={16} className="text-emerald-600" /> : <WifiOff size={16} className="text-slate-400" />}
                      </div>
                      <div>
                        <h2 className="font-bold text-navy">{d.name}</h2>
                        <p className="text-xs text-slate-400 font-semibold">
                          {VENDOR_LABELS[d.vendor] || d.vendor}{d.location ? ` · ${d.location}` : ''}
                        </p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full ${d.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {d.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="text-xs text-slate-500 font-medium space-y-1 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500 w-16">Address</span>
                      <span className="font-mono text-slate-600">{d.ipAddress}:{d.port}</span>
                    </div>
                    {d.serialNumber && (
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 w-16">Serial</span>
                        <span className="font-mono text-slate-600">{d.serialNumber}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500 w-16">Last sync</span>
                      <span className={d.lastSyncStatus === 'error' ? 'text-red-500' : 'text-slate-600'}>
                        {fmtRelative(d.lastSyncAt)}{d.lastSyncStatus === 'error' ? ' (error)' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500 w-16">Records</span>
                      <span className="text-slate-600">{d._count?.attendanceLogs ?? 0} logs</span>
                    </div>
                  </div>

                  {/* Webhook key */}
                  {d.webhookKey && (
                    <div className="mb-3 p-3 bg-slate-50 rounded-xl border border-border">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">ADMS / Webhook Key</p>
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono text-slate-600 truncate flex-1">{d.webhookKey}</code>
                        <button onClick={() => copyKey(d.id, d.webhookKey)}
                          className="flex-shrink-0 text-slate-400 hover:text-navy">
                          {copiedKey === d.id ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1 break-all">
                        ZKTeco URL: <span className="font-mono">{serverUrl}/api/biometric/zkteco?key={d.webhookKey}</span>
                      </p>
                    </div>
                  )}

                  {testResults[d.id] && (
                    <div className={`text-xs font-medium px-3 py-2 rounded-lg mb-3 ${testResults[d.id].startsWith('OK') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                      {testResults[d.id]}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 pt-3 border-t border-border">
                    <button onClick={() => handleTest(d)} disabled={testing === d.id}
                      className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-navy px-3 py-1.5 rounded-lg hover:bg-slate-50 border border-border disabled:opacity-50">
                      <Wifi size={12} /> {testing === d.id ? 'Testing…' : 'Test'}
                    </button>
                    <button onClick={() => handleSync(d)} disabled={syncing === d.id}
                      className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-navy px-3 py-1.5 rounded-lg hover:bg-slate-50 border border-border disabled:opacity-50">
                      <RefreshCw size={12} className={syncing === d.id ? 'animate-spin' : ''} />
                      {syncing === d.id ? 'Syncing…' : 'Sync Now'}
                    </button>
                    <button onClick={() => { setEditing(d); setShowForm(false); setError(''); }}
                      className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-navy px-3 py-1.5 rounded-lg hover:bg-slate-50 border border-border">
                      <Edit2 size={12} /> Edit
                    </button>
                    <button onClick={() => handleDelete(d.id)}
                      className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-50 border border-border">
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Setup instructions */}
      <div className="mt-8 space-y-4">
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 font-medium">
          <strong>ZKTeco ADMS Push Setup:</strong> On device, go to <em>Comm → Cloud Server</em> and set the server address to{' '}
          <code className="mx-1 bg-blue-100 px-1.5 py-0.5 rounded font-mono">{serverUrl}/api/biometric/zkteco</code>.
          Use the Webhook Key above as the server password. The device will push attendance logs automatically.
        </div>
        <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-700 font-medium">
          <strong>Hikvision Setup:</strong> Configure device IP, port (default 80), and admin credentials above.
          Use <em>Sync Now</em> to pull events via ISAPI. For push notifications, configure the device's Event Notification URL to{' '}
          <code className="mx-1 bg-purple-100 px-1.5 py-0.5 rounded font-mono">{serverUrl}/api/biometric/hikvision?key=WEBHOOK_KEY</code>.
        </div>
      </div>
    </div>
  );
};

export default Devices;
