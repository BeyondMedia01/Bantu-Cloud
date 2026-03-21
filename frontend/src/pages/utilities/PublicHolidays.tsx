import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, Trash2, CalendarCheck } from 'lucide-react';
import { PublicHolidaysAPI } from '../../api/client';
import { useToast } from '../../context/ToastContext';

const CURRENT_YEAR = new Date().getFullYear();

const PublicHolidays: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [year, setYear] = useState(CURRENT_YEAR);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: '', date: '' });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = (y = year) => {
    setLoading(true);
    PublicHolidaysAPI.getAll(y)
      .then((r) => setHolidays(r.data))
      .catch(() => showToast('Failed to load holidays', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(year); }, [year]);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const r = await PublicHolidaysAPI.seed(year);
      showToast(r.data.message, 'success');
      load(year);
    } catch (e: any) {
      showToast(e.response?.data?.message || 'Failed to seed holidays', 'error');
    } finally {
      setSeeding(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await PublicHolidaysAPI.create(form);
      showToast('Holiday added', 'success');
      setForm({ name: '', date: '' });
      setAddOpen(false);
      load(year);
    } catch (e: any) {
      showToast(e.response?.data?.message || 'Failed to add holiday', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await PublicHolidaysAPI.delete(id);
      showToast('Holiday removed', 'success');
      setHolidays((prev) => prev.filter((h) => h.id !== id));
    } catch {
      showToast('Failed to delete holiday', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const fmt = (d: string) =>
    new Date(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => navigate('/utilities')}
          className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400"
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold">Public Holidays</h1>
          <p className="text-slate-500 text-sm font-medium">Zimbabwean public holidays used for attendance and payroll</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="border border-border rounded-xl px-3 py-2 text-sm font-semibold bg-primary focus:outline-none focus:border-accent-blue"
        >
          {[CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>

        <button
          onClick={handleSeed}
          disabled={seeding}
          className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 font-bold text-sm px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
        >
          <CalendarCheck size={16} />
          {seeding ? 'Seeding…' : `Seed Zimbabwe Holidays (${year})`}
        </button>

        <button
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-2 bg-btn-primary text-navy font-bold text-sm px-4 py-2 rounded-xl hover:opacity-90 transition-opacity ml-auto"
        >
          <Plus size={16} />
          Add Custom Holiday
        </button>
      </div>

      {/* Add form */}
      {addOpen && (
        <div className="bg-primary border border-border rounded-2xl p-5 mb-6 shadow-sm">
          <h3 className="font-bold mb-4">Add Custom Holiday</h3>
          <form onSubmit={handleAdd} className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. National Heroes Day"
                required
                className="w-full border border-border rounded-xl px-3 py-2 text-sm font-medium focus:outline-none focus:border-accent-blue"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Date</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                required
                className="border border-border rounded-xl px-3 py-2 text-sm font-medium focus:outline-none focus:border-accent-blue"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="bg-btn-primary text-navy font-bold text-sm px-4 py-2 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Add'}
            </button>
            <button
              type="button"
              onClick={() => setAddOpen(false)}
              className="text-slate-400 font-bold text-sm px-4 py-2 rounded-xl hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
          </form>
        </div>
      )}

      {/* Table */}
      <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
        {loading ? (
          <div className="animate-pulse">
            <div className="border-b border-border px-5 py-4 bg-slate-50">
              <div className="h-3 w-24 bg-slate-200 rounded" />
            </div>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="px-5 py-4 border-b border-border last:border-0 flex items-center justify-between">
                <div className="space-y-2">
                  <div className="h-3 w-48 bg-slate-100 rounded" />
                  <div className="h-2 w-32 bg-slate-50 rounded" />
                </div>
                <div className="h-7 w-16 bg-slate-100 rounded-full" />
              </div>
            ))}
          </div>
        ) : holidays.length === 0 ? (
          <div className="p-12 text-center">
            <CalendarCheck size={40} className="mx-auto text-slate-300 mb-3" />
            <p className="font-bold text-slate-400">No holidays for {year}</p>
            <p className="text-sm text-slate-400 mt-1">Click "Seed Zimbabwe Holidays" to populate this year's holidays.</p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-slate-50">
                <th className="px-5 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">#</th>
                <th className="px-5 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Holiday</th>
                <th className="px-5 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Date</th>
                <th className="px-5 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Day</th>
                <th className="px-5 py-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {holidays.map((h, i) => (
                <tr key={h.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3 text-sm text-slate-400 font-bold">{i + 1}</td>
                  <td className="px-5 py-3 font-bold text-sm">{h.name}</td>
                  <td className="px-5 py-3 text-sm text-slate-600">
                    {new Date(h.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </td>
                  <td className="px-5 py-3 text-sm text-slate-400 font-medium">
                    {new Date(h.date).toLocaleDateString('en-GB', { weekday: 'long' })}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => handleDelete(h.id)}
                      disabled={deletingId === h.id}
                      className="p-1.5 hover:bg-red-50 hover:text-red-500 text-slate-300 rounded-lg transition-colors disabled:opacity-40"
                      title="Remove holiday"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-slate-400 mt-4 font-medium">
        {holidays.length} holiday{holidays.length !== 1 ? 's' : ''} for {year}
      </p>
    </div>
  );
};

export default PublicHolidays;
