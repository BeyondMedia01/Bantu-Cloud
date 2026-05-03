import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Lock, Trash2, ChevronDown, ChevronUp, X, Check,
} from 'lucide-react';
import { PayrollCalendarAPI } from '../../api/client';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const PERIOD_TYPES = ['MONTHLY', 'WEEKLY', 'BI_WEEKLY', 'FORTNIGHTLY'];

interface CalendarEntry {
  id: string;
  periodType: string;
  year: number;
  month: number | null;
  payDay: number | null;
  startDate: string;
  endDate: string;
  isClosed: boolean;
  _count?: { payrollRuns: number };
}

const emptyForm = () => ({
  periodType: 'MONTHLY',
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1,
  payDay: 25,
  startDate: '',
  endDate: '',
});

const PayrollCalendar: React.FC = () => {
  const navigate = useNavigate();
  const [entries, setEntries]   = useState<CalendarEntry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [yearFilter, setYearFilter] = useState(String(new Date().getFullYear()));
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(emptyForm());
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [confirmClose, setConfirmClose] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = async (year?: string) => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      const y = year ?? yearFilter;
      if (y) params.year = y;
      const res = await PayrollCalendarAPI.getAll(params);
      setEntries(res.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleYearChange = (y: string) => {
    setYearFilter(y);
    load(y);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.startDate || !form.endDate) {
      setError('Start date and end date are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await PayrollCalendarAPI.create({
        ...form,
        year: Number(form.year),
        month: form.month ? Number(form.month) : null,
        payDay: form.payDay ? Number(form.payDay) : null,
      });
      setShowForm(false);
      setForm(emptyForm());
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create period.');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = async (id: string) => {
    try {
      await PayrollCalendarAPI.close(id);
      setConfirmClose(null);
      load();
    } catch {
      // silent
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await PayrollCalendarAPI.delete(id);
      setConfirmDelete(null);
      load();
    } catch {
      // silent
    }
  };

  const yearOptions = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - 1 + i));

  // Group by year for display
  const grouped = entries.reduce<Record<number, CalendarEntry[]>>((acc, e) => {
    acc[e.year] = acc[e.year] || [];
    acc[e.year].push(e);
    return acc;
  }, {});

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate('/utilities')} aria-label="Go back" className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Payroll Calendar</h1>
          <p className="text-slate-500 font-medium text-sm">Manage payroll periods — create, close, and track each pay cycle</p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setError(''); }}
          className="flex items-center gap-2 bg-brand text-navy px-5 py-2.5 rounded-full font-bold shadow hover:opacity-90 text-sm"
        >
          {showForm ? <><X size={15} /> Cancel</> : <><Plus size={15} /> New Period</>}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="bg-primary border border-border rounded-2xl p-6 shadow-sm mb-6">
          <h3 className="font-bold text-sm uppercase tracking-wider text-slate-400 mb-4">New Payroll Period</h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1.5">Period Type</label>
              <select
                value={form.periodType}
                onChange={(e) => setForm((p) => ({ ...p, periodType: e.target.value }))}
                className="w-full px-4 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue"
              >
                {PERIOD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1.5">Year</label>
              <input
                type="number"
                min="2020"
                max="2040"
                value={form.year}
                onChange={(e) => setForm((p) => ({ ...p, year: Number(e.target.value) }))}
                className="w-full px-4 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1.5">Month</label>
              <select
                value={form.month}
                onChange={(e) => setForm((p) => ({ ...p, month: Number(e.target.value) }))}
                className="w-full px-4 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue"
              >
                {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1.5">Start Date</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
                className="w-full px-4 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1.5">End Date</label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
                className="w-full px-4 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1.5">Pay Day (day of month)</label>
              <input
                type="number"
                min="1"
                max="31"
                value={form.payDay ?? ''}
                onChange={(e) => setForm((p) => ({ ...p, payDay: Number(e.target.value) }))}
                className="w-full px-4 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium mb-4">{error}</div>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 bg-brand text-navy px-6 py-2.5 rounded-full font-bold hover:opacity-90 disabled:opacity-60 text-sm"
            >
              <Check size={15} /> {saving ? 'Creating…' : 'Create Period'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-5 py-2.5 rounded-full border border-border font-bold text-slate-500 hover:bg-slate-50 text-sm">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Year filter */}
      <div className="flex items-center gap-3 mb-5">
        <span className="text-sm font-bold text-slate-500">Year:</span>
        <div className="flex gap-2">
          {yearOptions.map((y) => (
            <button
              key={y}
              onClick={() => handleYearChange(y)}
              className={`px-4 py-1.5 rounded-full text-sm font-bold transition-colors ${
                yearFilter === y
                  ? 'bg-navy text-white'
                  : 'border border-border text-slate-500 hover:bg-slate-50'
              }`}
            >
              {y}
            </button>
          ))}
          <button
            onClick={() => { setYearFilter(''); load(''); }}
            className={`px-4 py-1.5 rounded-full text-sm font-bold transition-colors ${
              yearFilter === ''
                ? 'bg-navy text-white'
                : 'border border-border text-slate-500 hover:bg-slate-50'
            }`}
          >
            All
          </button>
        </div>
      </div>

      {/* Entries */}
      {loading ? (
        <div className="text-center py-16 text-slate-400 text-sm font-medium">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="bg-primary border border-border rounded-2xl p-12 text-center shadow-sm">
          <p className="text-slate-400 font-medium text-sm">No payroll periods found for the selected year.</p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-4 text-accent-blue text-sm font-bold hover:underline"
          >
            Create your first period →
          </button>
        </div>
      ) : (
        Object.entries(grouped)
          .sort(([a], [b]) => Number(b) - Number(a))
          .map(([year, items]) => (
            <YearGroup
              key={year}
              year={Number(year)}
              items={items}
              onClose={(id) => setConfirmClose(id)}
              onDelete={(id) => setConfirmDelete(id)}
            />
          ))
      )}

      {/* Close confirmation */}
      {confirmClose && (
        <ConfirmDialog
          title="Close this payroll period?"
          message="Closing a period locks it from further edits. This cannot be undone."
          confirmLabel="Close Period"
          confirmClass="bg-amber-500 text-white"
          onConfirm={() => handleClose(confirmClose)}
          onCancel={() => setConfirmClose(null)}
        />
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete this payroll period?"
          message="This will permanently delete the period. Any linked payroll runs will be orphaned."
          confirmLabel="Delete"
          confirmClass="bg-red-500 text-white"
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
};

// ─── Year Group ────────────────────────────────────────────────────────────────

const YearGroup: React.FC<{
  year: number;
  items: CalendarEntry[];
  onClose: (id: string) => void;
  onDelete: (id: string) => void;
}> = ({ year, items, onClose, onDelete }) => {
  const [open, setOpen] = useState(true);
  const closed = items.filter((i) => i.isClosed).length;

  return (
    <div className="bg-primary border border-border rounded-2xl shadow-sm overflow-hidden mb-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="font-bold text-navy">{year}</span>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            {items.length} period{items.length !== 1 ? 's' : ''} · {closed} closed
          </span>
        </div>
        {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
      </button>

      {open && (
        <div className="border-t border-border divide-y divide-border">
          {items
            .sort((a, b) => (a.month ?? 0) - (b.month ?? 0))
            .map((entry) => (
              <PeriodRow
                key={entry.id}
                entry={entry}
                onClose={() => onClose(entry.id)}
                onDelete={() => onDelete(entry.id)}
              />
            ))}
        </div>
      )}
    </div>
  );
};

// ─── Period Row ────────────────────────────────────────────────────────────────

const PeriodRow: React.FC<{
  entry: CalendarEntry;
  onClose: () => void;
  onDelete: () => void;
}> = ({ entry, onClose, onDelete }) => {
  const monthName = entry.month ? MONTHS[entry.month - 1] : '—';
  const start = new Date(entry.startDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const end   = new Date(entry.endDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

  return (
    <div className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50/30 transition-colors">
      {/* Month */}
      <div className="w-24 shrink-0">
        <p className="font-bold text-navy text-sm">{monthName}</p>
        <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">{entry.periodType}</p>
      </div>

      {/* Date range */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-600">{start} — {end}</p>
        {entry.payDay && (
          <p className="text-[11px] text-slate-400 font-medium">Pay day: {entry.payDay}{ordinal(entry.payDay)} of month</p>
        )}
      </div>

      {/* Run count */}
      {entry._count !== undefined && (
        <div className="shrink-0 text-center w-14">
          <p className="text-lg font-bold text-navy">{entry._count.payrollRuns}</p>
          <p className="text-[10px] text-slate-400 font-bold uppercase">Runs</p>
        </div>
      )}

      {/* Status badge */}
      <div className="shrink-0">
        {entry.isClosed ? (
          <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-slate-100 text-slate-500 text-[11px] font-black uppercase tracking-wide">
            <Lock size={10} /> Closed
          </span>
        ) : (
          <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-black uppercase tracking-wide">
            Open
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {!entry.isClosed && (
          <button
            onClick={onClose}
            title="Close period"
            className="p-1.5 rounded-lg text-amber-500 hover:bg-amber-50 transition-colors"
          >
            <Lock size={15} />
          </button>
        )}
        <button
          onClick={onDelete}
          title="Delete period"
          className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
};

// ─── Confirm Dialog ────────────────────────────────────────────────────────────

const ConfirmDialog: React.FC<{
  title: string;
  message: string;
  confirmLabel: string;
  confirmClass: string;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ title, message, confirmLabel, confirmClass, onConfirm, onCancel }) => (
  <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
      <h3 className="font-bold text-navy mb-2">{title}</h3>
      <p className="text-sm text-slate-500 font-medium mb-6">{message}</p>
      <div className="flex gap-3 justify-end">
        <button
          onClick={onCancel}
          className="px-5 py-2 rounded-full border border-border font-bold text-slate-500 hover:bg-slate-50 text-sm"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className={`px-5 py-2 rounded-full font-bold text-sm ${confirmClass} hover:opacity-90`}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  </div>
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

export default PayrollCalendar;
