import React, { useEffect, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Plus, X, Calendar, Users } from 'lucide-react';
import { RosterAPI, ShiftAPI, EmployeeAPI } from '../../api/client';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function addDays(date: Date, n: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function fmtDisplay(d: Date) {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

const SHIFT_COLORS: Record<string, string> = {
  D: 'bg-blue-100 text-blue-800 border-blue-200',
  N: 'bg-purple-100 text-purple-800 border-purple-200',
  E: 'bg-amber-100 text-amber-800 border-amber-200',
  A: 'bg-emerald-100 text-emerald-800 border-emerald-200',
};

function shiftColor(code: string) {
  const first = (code || '').charAt(0).toUpperCase();
  return SHIFT_COLORS[first] || 'bg-slate-100 text-slate-700 border-slate-200';
}

const AssignModal: React.FC<{
  employees: any[];
  shifts: any[];
  selectedEmp: string | null;
  selectedDate: string | null;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
}> = ({ employees, shifts, selectedEmp, selectedDate, onClose, onSave }) => {
  const [form, setForm] = useState({
    employeeId: selectedEmp || '',
    shiftId: '',
    startDate: selectedDate || fmtDate(new Date()),
    endDate: '',
    daysOfWeek: [1, 2, 3, 4, 5] as number[],
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleDay = (d: number) =>
    setForm((f) => ({
      ...f,
      daysOfWeek: f.daysOfWeek.includes(d) ? f.daysOfWeek.filter((x) => x !== d) : [...f.daysOfWeek, d].sort(),
    }));

  const handleSave = async () => {
    if (!form.employeeId || !form.shiftId || !form.startDate) {
      setError('Employee, Shift and Start Date are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({ ...form, daysOfWeek: JSON.stringify(form.daysOfWeek) });
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to save assignment.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-bold text-navy text-lg">Assign Shift</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">Employee *</label>
            <select value={form.employeeId} onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))}
              className="w-full px-3 py-2 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30">
              <option value="">Select employee…</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName} ({emp.employeeCode})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">Shift *</label>
            <select value={form.shiftId} onChange={(e) => setForm((f) => ({ ...f, shiftId: e.target.value }))}
              className="w-full px-3 py-2 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30">
              <option value="">Select shift…</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>{s.name}{s.code ? ` (${s.code})` : ''}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Start Date *</label>
              <input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                className="w-full px-3 py-2 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">End Date (blank = ongoing)</label>
              <input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                className="w-full px-3 py-2 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-2">Days of Week</label>
            <div className="flex gap-2">
              {DAYS.map((day, i) => (
                <button key={i} type="button"
                  onClick={() => toggleDay(i)}
                  className={`w-9 h-9 rounded-full text-xs font-bold border transition-colors ${
                    form.daysOfWeek.includes(i)
                      ? 'bg-accent-blue text-white border-accent-blue'
                      : 'bg-slate-50 text-slate-500 border-border hover:bg-slate-100'
                  }`}>
                  {day.charAt(0)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">Notes</label>
            <input type="text" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Optional notes…"
              className="w-full px-3 py-2 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30" />
          </div>
        </div>

        {error && <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium">{error}</div>}

        <div className="flex gap-3 mt-5">
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 bg-btn-primary text-navy px-5 py-2 rounded-full font-bold text-sm hover:opacity-90 disabled:opacity-60">
            {saving ? 'Saving…' : 'Assign Shift'}
          </button>
          <button onClick={onClose}
            className="px-4 py-2 border border-border rounded-full font-bold text-sm text-slate-500 hover:bg-slate-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

const Roster: React.FC = () => {
  const [weekStart, setWeekStart] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const [grid, setGrid] = useState<any>({});
  const [employees, setEmployees] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [error, setError] = useState('');

  const dates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const startDate = fmtDate(dates[0]);
  const endDate = fmtDate(dates[6]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rosterRes, shiftRes, empRes] = await Promise.all([
        RosterAPI.getCalendar(startDate, endDate),
        ShiftAPI.getAll(),
        EmployeeAPI.getAll(),
      ]);
      setGrid(rosterRes.data.grid || {});
      setEmployees(empRes.data.data || empRes.data || []);
      setShifts(shiftRes.data || []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  const openModal = (empId?: string, dateStr?: string) => {
    setSelectedEmp(empId || null);
    setSelectedDate(dateStr || null);
    setShowModal(true);
  };

  const handleAssign = async (data: any) => {
    await RosterAPI.assign(data);
    load();
  };

  const handleRemove = async (assignmentId: string) => {
    if (!confirm('Remove this shift assignment?')) return;
    try {
      await RosterAPI.delete(assignmentId);
      load();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed.');
    }
  };

  const prevWeek = () => setWeekStart((d) => addDays(d, -7));
  const nextWeek = () => setWeekStart((d) => addDays(d, 7));
  const goToday = () => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    setWeekStart(d);
  };

  const todayStr = fmtDate(new Date());

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Roster</h1>
          <p className="text-slate-500 font-medium text-sm">Weekly shift assignments for all employees</p>
        </div>
        <button onClick={() => openModal()}
          className="flex items-center gap-2 bg-btn-primary text-navy px-5 py-2.5 rounded-full font-bold shadow hover:opacity-90 text-sm">
          <Plus size={15} /> Assign Shift
        </button>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium mb-4">{error}</div>}

      {/* Week navigator */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={prevWeek} className="p-2 rounded-lg border border-border hover:bg-slate-50"><ChevronLeft size={16} /></button>
        <button onClick={goToday} className="px-4 py-1.5 text-xs font-bold border border-border rounded-full hover:bg-slate-50">Today</button>
        <button onClick={nextWeek} className="p-2 rounded-lg border border-border hover:bg-slate-50"><ChevronRight size={16} /></button>
        <span className="text-sm font-bold text-navy ml-1">
          {fmtDisplay(dates[0])} – {fmtDisplay(dates[6])} {weekStart.getFullYear()}
        </span>
      </div>

      {/* Grid */}
      <div className="bg-primary border border-border rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="text-center py-16 text-slate-400 text-sm">Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-border">
                  <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-400 w-48">
                    <div className="flex items-center gap-1.5"><Users size={12} /> Employee</div>
                  </th>
                  {dates.map((d) => {
                    const str = fmtDate(d);
                    const isToday = str === todayStr;
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                    return (
                      <th key={str} className={`px-2 py-3 text-center min-w-[90px] ${isToday ? 'bg-accent-blue/5' : ''}`}>
                        <div className={`text-[10px] font-black uppercase tracking-wider ${isWeekend ? 'text-slate-300' : 'text-slate-400'}`}>
                          {DAYS[d.getDay()]}
                        </div>
                        <div className={`text-sm font-bold mt-0.5 ${isToday ? 'text-accent-blue' : isWeekend ? 'text-slate-400' : 'text-navy'}`}>
                          {d.getDate()}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-slate-400 text-sm">
                      No employees found. Add employees first.
                    </td>
                  </tr>
                ) : (
                  employees.map((emp, idx) => (
                    <tr key={emp.id} className={`border-b border-border last:border-0 ${idx % 2 === 1 ? 'bg-slate-50/50' : ''}`}>
                      <td className="px-4 py-2.5">
                        <div className="font-bold text-sm text-navy truncate max-w-[160px]">
                          {emp.firstName} {emp.lastName}
                        </div>
                        <div className="text-[10px] text-slate-400 font-semibold">{emp.employeeCode}</div>
                      </td>
                      {dates.map((d) => {
                        const str = fmtDate(d);
                        const isToday = str === todayStr;
                        const cell = grid[emp.id]?.[str];
                        return (
                          <td key={str} className={`px-1.5 py-2 text-center ${isToday ? 'bg-accent-blue/5' : ''}`}>
                            {cell ? (
                              <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-bold ${shiftColor(cell.code || cell.shiftName || 'A')}`}>
                                <span className="truncate max-w-[56px]">{cell.code || cell.shiftName}</span>
                                <button
                                  onClick={() => handleRemove(cell.assignmentId)}
                                  className="text-current opacity-50 hover:opacity-100 ml-0.5 flex-shrink-0">
                                  <X size={10} />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => openModal(emp.id, str)}
                                className="text-slate-300 hover:text-accent-blue hover:bg-accent-blue/10 w-8 h-8 rounded-lg flex items-center justify-center mx-auto transition-colors">
                                <Plus size={14} />
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Legend */}
      {shifts.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {shifts.slice(0, 8).map((s) => (
            <span key={s.id} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold ${shiftColor(s.code || s.name || '')}`}>
              <Calendar size={10} />
              {s.code || s.name} — {s.startTime}–{s.endTime}
            </span>
          ))}
        </div>
      )}

      {showModal && (
        <AssignModal
          employees={employees}
          shifts={shifts}
          selectedEmp={selectedEmp}
          selectedDate={selectedDate}
          onClose={() => setShowModal(false)}
          onSave={handleAssign}
        />
      )}
    </div>
  );
};

export default Roster;
