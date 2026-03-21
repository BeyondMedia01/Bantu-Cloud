import React, { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, Check, X, Clock, Users } from 'lucide-react';
import { ShiftAPI } from '../../api/client';

const BLANK = {
  name: '', code: '', startTime: '08:00', endTime: '17:00',
  breakMinutes: 60, normalHours: 8, ot1Threshold: 2, isOvernight: false,
};

const ShiftForm: React.FC<{
  initial: typeof BLANK;
  onSave: (data: any) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
  error: string;
}> = ({ initial, onSave, onCancel, saving, error }) => {
  const [form, setForm] = useState({ ...initial });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'number' ? parseFloat(e.target.value) : e.target.value }));

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(form); }}
      className="bg-primary border border-border rounded-2xl p-6 shadow-sm mb-6">
      <p className="text-xs font-black uppercase tracking-wider text-slate-400 mb-5">
        {initial.name ? 'Edit Shift' : 'New Shift'}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
        {[
          { label: 'Shift Name *', key: 'name', type: 'text', required: true },
          { label: 'Code (optional)', key: 'code', type: 'text' },
        ].map(({ label, key, type, required }) => (
          <div key={key}>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">{label}</label>
            <input
              type={type} value={(form as any)[key]} onChange={set(key)}
              required={required}
              className="w-full px-3 py-2 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue"
            />
          </div>
        ))}
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1.5">Start Time *</label>
          <input type="time" value={form.startTime} onChange={set('startTime')} required
            className="w-full px-3 py-2 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1.5">End Time *</label>
          <input type="time" value={form.endTime} onChange={set('endTime')} required
            className="w-full px-3 py-2 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1.5">Break (minutes)</label>
          <input type="number" min="0" max="480" value={form.breakMinutes} onChange={set('breakMinutes')}
            className="w-full px-3 py-2 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1.5">Normal Hours / Day</label>
          <input type="number" min="1" max="24" step="0.5" value={form.normalHours} onChange={set('normalHours')}
            className="w-full px-3 py-2 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1.5">OT ×1.5 Threshold (hrs)</label>
          <input type="number" min="0" max="24" step="0.5" value={form.ot1Threshold} onChange={set('ot1Threshold')}
            className="w-full px-3 py-2 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue" />
        </div>
        <div className="flex items-center gap-3 pt-5">
          <input type="checkbox" id="overnight" checked={form.isOvernight}
            onChange={(e) => setForm((f) => ({ ...f, isOvernight: e.target.checked }))}
            className="w-4 h-4 rounded border-border text-accent-blue" />
          <label htmlFor="overnight" className="text-sm font-medium text-slate-600">Overnight shift (crosses midnight)</label>
        </div>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium mb-4">{error}</div>}

      <div className="flex gap-3">
        <button type="submit" disabled={saving}
          className="flex items-center gap-2 bg-btn-primary text-navy px-5 py-2 rounded-full font-bold text-sm hover:opacity-90 disabled:opacity-60">
          <Check size={14} /> {saving ? 'Saving…' : 'Save Shift'}
        </button>
        <button type="button" onClick={onCancel}
          className="flex items-center gap-2 px-4 py-2 border border-border rounded-full font-bold text-sm text-slate-500 hover:bg-slate-50">
          <X size={14} /> Cancel
        </button>
      </div>
    </form>
  );
};

const Shifts: React.FC = () => {
  const [shifts, setShifts] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState<any | null>(null);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  const load = async () => {
    setLoading(true);
    try { const r = await ShiftAPI.getAll(); setShifts(r.data); }
    catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (form: any) => {
    setSaving(true); setError('');
    try {
      if (editing) await ShiftAPI.update(editing.id, form);
      else         await ShiftAPI.create(form);
      setShowForm(false); setEditing(null); load();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to save shift.');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this shift? If it has assignments it will be deactivated instead.')) return;
    try { await ShiftAPI.delete(id); load(); }
    catch (e: any) { setError(e.response?.data?.message || 'Failed.'); }
  };

  const fmt = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${((h % 12) || 12).toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold">Shifts</h1>
          <p className="text-slate-500 font-medium text-sm">
            Define work schedules, break times, and overtime thresholds
          </p>
        </div>
        {!showForm && !editing && (
          <button onClick={() => { setShowForm(true); setError(''); }}
            className="flex items-center gap-2 bg-btn-primary text-navy px-5 py-2.5 rounded-full font-bold shadow hover:opacity-90 text-sm">
            <Plus size={15} /> New Shift
          </button>
        )}
      </div>

      {(showForm && !editing) && (
        <ShiftForm initial={BLANK} onSave={handleSave} onCancel={() => { setShowForm(false); setError(''); }}
          saving={saving} error={error} />
      )}

      {error && !showForm && !editing && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium mb-4">{error}</div>
      )}

      {loading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Loading…</div>
      ) : shifts.length === 0 ? (
        <div className="bg-primary border border-dashed border-border rounded-2xl p-12 text-center">
          <p className="text-slate-400 font-medium">No shifts defined yet.</p>
          <button onClick={() => setShowForm(true)} className="mt-3 text-accent-blue text-sm font-bold hover:underline">
            Create first shift →
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {shifts.map((s) => (
            <div key={s.id}>
              {editing?.id === s.id ? (
                <ShiftForm initial={editing} onSave={handleSave} onCancel={() => { setEditing(null); setError(''); }}
                  saving={saving} error={error} />
              ) : (
                <div className={`bg-primary border border-border rounded-2xl p-5 shadow-sm ${!s.isActive ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-navy">{s.name}</h3>
                      {s.code && <p className="text-xs text-slate-400 font-semibold mt-0.5">{s.code}</p>}
                    </div>
                    {!s.isActive && (
                      <span className="text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                        Inactive
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-sm text-slate-600 font-medium mb-1">
                    <Clock size={13} className="text-slate-400" />
                    {fmt(s.startTime)} → {fmt(s.endTime)}
                    {s.isOvernight && <span className="text-[10px] bg-purple-100 text-purple-700 font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full">Overnight</span>}
                  </div>

                  <div className="text-xs text-slate-400 font-medium space-y-0.5 mb-3">
                    <p>Break: {s.breakMinutes} min | Normal: {s.normalHours} hrs/day</p>
                    <p>OT ×1.5 up to {s.ot1Threshold} hrs, then ×2.0</p>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-400 font-medium border-t border-border pt-3">
                    <Users size={12} />
                    {s._count?.assignments ?? 0} assignment{s._count?.assignments !== 1 ? 's' : ''}
                  </div>

                  <div className="flex gap-2 mt-3">
                    <button onClick={() => { setEditing(s); setShowForm(false); setError(''); }}
                      className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-navy px-3 py-1.5 rounded-lg hover:bg-slate-50 border border-border">
                      <Edit2 size={12} /> Edit
                    </button>
                    <button onClick={() => handleDelete(s.id)}
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

      <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 font-medium">
        <strong>Overtime rules (Zimbabwe standard):</strong> Weekday — first {'{normalHours}'} hrs @ ×1.0,
        next {'{ot1Threshold}'} hrs @ ×1.5, remainder @ ×2.0. Saturday — all @ ×1.5.
        Sunday / Public Holiday — all @ ×2.0.
      </div>
    </div>
  );
};

export default Shifts;
