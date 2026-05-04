import React, { useEffect, useState, useCallback } from 'react';
import { Clock, RefreshCw, Edit2, CheckSquare, Download, Plus, AlertTriangle, ChevronDown } from 'lucide-react';
import { Dropdown } from '@/components/ui/dropdown';
import { AttendanceAPI, EmployeeAPI } from '../../api/client';

type Tab = 'records' | 'logs';

interface EmployeeSummary {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode?: string;
}

interface AttendanceFormData {
  employeeId: string;
  date: string;
  clockIn: string;
  clockOut: string;
  breakMinutes: number;
  status: string;
  notes: string;
}

const STATUS_COLORS: Record<string, string> = {
  PRESENT:   'bg-emerald-100 text-emerald-700',
  ABSENT:    'bg-red-100 text-red-700',
  HALF_DAY:  'bg-amber-100 text-amber-700',
  HOLIDAY:   'bg-blue-100 text-blue-700',
  LEAVE:     'bg-purple-100 text-purple-700',
};

const PUNCH_COLORS: Record<string, string> = {
  IN:        'bg-emerald-100 text-emerald-700',
  OUT:       'bg-muted text-foreground/80',
  BREAK_IN:  'bg-blue-100 text-blue-700',
  BREAK_OUT: 'bg-amber-100 text-amber-700',
};

function fmtTime(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-ZW', { hour: '2-digit', minute: '2-digit', hour12: true });
}
function fmtDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtMins(m: number) {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h}h${min > 0 ? ` ${min}m` : ''}`;
}

const ManualEntryModal: React.FC<{
  employees: EmployeeSummary[];
  onClose: () => void;
  onSave: (data: AttendanceFormData) => Promise<void>;
}> = ({ employees, onClose, onSave }) => {
  const [form, setForm] = useState({
    employeeId: '',
    date: new Date().toISOString().slice(0, 10),
    clockIn: '08:00',
    clockOut: '17:00',
    breakMinutes: 60,
    status: 'PRESENT',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'number' ? parseFloat(e.target.value) : e.target.value }));

  const handleSave = async () => {
    if (!form.employeeId || !form.date) { setError('Employee and Date are required.'); return; }
    setSaving(true); setError('');
    try { await onSave(form); onClose(); }
    catch (e: any) { setError(e.response?.data?.message || 'Failed.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg p-6">
        <h2 className="font-bold text-navy text-lg mb-5">Manual Attendance Entry</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-foreground/80 mb-1.5">Employee *</label>
            <Dropdown className="w-full" trigger={(isOpen) => {
              const emp = employees.find(em => em.id === form.employeeId);
              return (
                <button type="button" className="w-full flex items-center justify-between px-3 py-2 border border-border rounded-xl text-sm font-medium hover:border-accent-green transition-colors bg-primary">
                  <span className="truncate">{emp ? `${emp.firstName} ${emp.lastName} (${emp.employeeCode})` : 'Select employee…'}</span>
                  <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
              );
            }} sections={[{ items: [
              { label: 'Select employee…', onClick: () => set('employeeId')({ target: { value: '' } } as any) },
              ...employees.map(em => ({ label: `${em.firstName} ${em.lastName} (${em.employeeCode})`, onClick: () => set('employeeId')({ target: { value: em.id } } as any) }))
            ]}]} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-foreground/80 mb-1.5">Date *</label>
              <input type="date" value={form.date} onChange={set('date')}
                className="w-full px-3 py-2 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/30" />
            </div>
            <div>
              <label className="block text-xs font-bold text-foreground/80 mb-1.5">Status</label>
              <Dropdown className="w-full" trigger={(isOpen) => (
                <button type="button" className="w-full flex items-center justify-between px-3 py-2 border border-border rounded-xl text-sm font-medium hover:border-accent-green transition-colors bg-primary">
                  <span>{form.status.replace('_', ' ')}</span>
                  <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
              )} sections={[{ items: ['PRESENT', 'ABSENT', 'HALF_DAY', 'HOLIDAY', 'LEAVE'].map(s => ({ label: s.replace('_', ' '), onClick: () => set('status')({ target: { value: s } } as any) })) }]} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-foreground/80 mb-1.5">Clock In</label>
              <input type="time" value={form.clockIn} onChange={set('clockIn')}
                className="w-full px-3 py-2 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/30" />
            </div>
            <div>
              <label className="block text-xs font-bold text-foreground/80 mb-1.5">Clock Out</label>
              <input type="time" value={form.clockOut} onChange={set('clockOut')}
                className="w-full px-3 py-2 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/30" />
            </div>
            <div>
              <label className="block text-xs font-bold text-foreground/80 mb-1.5">Break (min)</label>
              <input type="number" min="0" max="480" value={form.breakMinutes} onChange={set('breakMinutes')}
                className="w-full px-3 py-2 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/30" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-foreground/80 mb-1.5">Notes</label>
            <input type="text" value={form.notes} onChange={set('notes')} placeholder="Optional…"
              className="w-full px-3 py-2 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/30" />
          </div>
        </div>
        {error && <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium">{error}</div>}
        <div className="flex gap-3 mt-5">
          <button onClick={handleSave} disabled={saving}
            className="bg-brand text-navy px-5 py-2 rounded-full font-bold text-sm hover:opacity-90 disabled:opacity-60">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={onClose} className="px-4 py-2 border border-border rounded-full font-bold text-sm text-muted-foreground hover:bg-muted">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

const Attendance: React.FC = () => {
  const [tab, setTab] = useState<Tab>('records');
  const [records, setRecords] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [filters, setFilters] = useState({
    startDate: new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
    employeeId: '',
  });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const LIMIT = 50;

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await AttendanceAPI.getAll({ ...filters, page: String(page), limit: String(LIMIT) });
      setRecords(res.data.data || res.data || []);
      setTotal(res.data.total || 0);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [filters, page]);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await AttendanceAPI.getLogs({ ...filters, page: String(page), limit: String(LIMIT) });
      setLogs(res.data.data || res.data || []);
      setTotal(res.data.total || 0);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [filters, page]);

  useEffect(() => {
    EmployeeAPI.getAll().then((r) => setEmployees(r.data.data || r.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (tab === 'records') loadRecords();
    else loadLogs();
  }, [tab, loadRecords, loadLogs]);

  const flash = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const handleProcess = async () => {
    if (!confirm('Process raw punch logs into attendance records for the selected date range? Existing manual overrides will be preserved.')) return;
    setProcessing(true); setError('');
    try {
      const res = await AttendanceAPI.process({ startDate: filters.startDate, endDate: filters.endDate });
      flash(`Processed ${res.data.processed} records.`);
      loadRecords();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Processing failed.');
    } finally { setProcessing(false); }
  };

  const handleManual = async (data: any) => {
    await AttendanceAPI.manual(data);
    flash('Manual record saved.');
    loadRecords();
  };

  const handleGenerateInputs = async () => {
    if (!confirm('Convert processed attendance records into payroll inputs? This will add records to PayrollInputs for the selected period.')) return;
    setError('');
    try {
      const res = await AttendanceAPI.generateInputs({ startDate: filters.startDate, endDate: filters.endDate, period: 'MONTHLY' });
      flash(`Generated ${res.data.created} payroll input rows.`);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to generate inputs.');
    }
  };

  const setFilter = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFilters((f) => ({ ...f, [k]: e.target.value }));
    setPage(1);
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Attendance</h1>
          <p className="text-muted-foreground font-medium text-sm">Raw biometric logs and processed daily records</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowManual(true)}
            className="flex items-center gap-1.5 px-4 py-2 border border-border rounded-full font-bold text-sm text-foreground/80 hover:bg-muted">
            <Plus size={14} /> Manual Entry
          </button>
          <button onClick={handleProcess} disabled={processing}
            className="flex items-center gap-1.5 bg-brand text-navy px-4 py-2 rounded-full font-bold text-sm hover:opacity-90 disabled:opacity-60">
            <RefreshCw size={14} className={processing ? 'animate-spin' : ''} />
            {processing ? 'Processing…' : 'Process Logs'}
          </button>
          <button onClick={handleGenerateInputs}
            className="flex items-center gap-1.5 px-4 py-2 bg-navy text-white rounded-full font-bold text-sm hover:opacity-90">
            <Download size={14} /> → Payroll
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium mb-4 flex items-center gap-2">
          <AlertTriangle size={14} />{error}
        </div>
      )}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 font-medium mb-4">{successMsg}</div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input type="date" value={filters.startDate} onChange={setFilter('startDate')}
          className="px-3 py-2 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/30" />
        <input type="date" value={filters.endDate} onChange={setFilter('endDate')}
          className="px-3 py-2 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/30" />
        <Dropdown trigger={(isOpen) => {
          const emp = employees.find(em => em.id === filters.employeeId);
          return (
            <button type="button" className="flex items-center gap-2 px-3 py-2 border border-border rounded-xl text-sm font-medium hover:border-accent-green transition-colors bg-primary">
              <span>{emp ? `${emp.firstName} ${emp.lastName}` : 'All Employees'}</span>
              <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
          );
        }} sections={[{ items: [
          { label: 'All Employees', onClick: () => setFilter('employeeId')({ target: { value: '' } } as any) },
          ...employees.map(em => ({ label: `${em.firstName} ${em.lastName}`, onClick: () => setFilter('employeeId')({ target: { value: em.id } } as any) }))
        ]}]} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-muted rounded-xl p-1 w-fit">
        {(['records', 'logs'] as Tab[]).map((t) => (
          <button key={t} onClick={() => { setTab(t); setPage(1); }}
            className={`px-5 py-1.5 rounded-lg font-bold text-sm transition-colors ${
              tab === t ? 'tab-pill-active' : 'tab-pill-inactive'
            }`}>
            {t === 'records' ? 'Processed Records' : 'Raw Punch Logs'}
          </button>
        ))}
      </div>

      <div className="bg-primary border border-border rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="text-center py-16 text-muted-foreground text-sm">Loading…</div>
        ) : tab === 'records' ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted border-b border-border">
                <tr>
                  {['Employee', 'Date', 'Status', 'In', 'Out', 'Break', 'Normal', 'OT ×1.0', 'OT ×1.5', 'OT ×2.0', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {records.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-12 text-muted-foreground text-sm">
                      No records found. Process punch logs to generate records.
                    </td>
                  </tr>
                ) : records.map((r) => (
                  <tr key={r.id} className="hover:bg-muted">
                    <td className="px-4 py-3">
                      <div className="font-bold text-sm text-navy">{r.employee?.firstName} {r.employee?.lastName}</div>
                      <div className="text-[10px] text-muted-foreground">{r.employee?.employeeCode}</div>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground/80">{fmtDate(r.date)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full ${STATUS_COLORS[r.status] || 'bg-muted text-muted-foreground'}`}>
                        {r.status?.replace('_', ' ')}
                      </span>
                      {r.isManualOverride && <span className="ml-1 text-[10px] text-amber-500 font-bold">✎</span>}
                      {r.isPublicHoliday && <span className="ml-1 text-[10px] text-blue-500 font-bold">PH</span>}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground/80">{fmtTime(r.clockIn)}</td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground/80">{fmtTime(r.clockOut)}</td>
                    <td className="px-4 py-3 text-sm font-medium text-muted-foreground">{r.breakMinutes ?? 0}m</td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-700">{fmtMins(r.normalMinutes ?? 0)}</td>
                    <td className="px-4 py-3 text-sm font-bold text-blue-700">{fmtMins(r.ot0Minutes ?? 0)}</td>
                    <td className="px-4 py-3 text-sm font-bold text-amber-700">{fmtMins(r.ot1Minutes ?? 0)}</td>
                    <td className="px-4 py-3 text-sm font-bold text-red-700">{fmtMins(r.ot2Minutes ?? 0)}</td>
                    <td className="px-4 py-3">
                      <button className="text-muted-foreground hover:text-navy p-1 rounded-lg hover:bg-muted">
                        <Edit2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted border-b border-border">
                <tr>
                  {['Employee', 'Punch Time', 'Type', 'Device PIN', 'Source', 'Processed'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-muted-foreground text-sm">
                      No punch logs found for this period.
                    </td>
                  </tr>
                ) : logs.map((l) => (
                  <tr key={l.id} className="hover:bg-muted">
                    <td className="px-4 py-3">
                      <div className="font-bold text-sm text-navy">{l.employee?.firstName} {l.employee?.lastName}</div>
                      <div className="text-[10px] text-muted-foreground">{l.employee?.employeeCode}</div>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground/80">
                      <div>{fmtDate(l.punchTime)}</div>
                      <div className="text-xs text-muted-foreground">{fmtTime(l.punchTime)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full ${PUNCH_COLORS[l.punchType] || 'bg-muted text-muted-foreground'}`}>
                        {l.punchType?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{l.deviceUserId}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-muted-foreground">{l.source}</td>
                    <td className="px-4 py-3">
                      {l.processed
                        ? <CheckSquare size={13} className="text-emerald-500" />
                        : <Clock size={13} className="text-amber-400" />
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <span className="text-xs text-muted-foreground font-medium">{total} total</span>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1.5 text-xs font-bold border border-border rounded-lg disabled:opacity-40 hover:bg-muted">Prev</button>
              <span className="px-3 py-1.5 text-xs font-bold">Page {page} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1.5 text-xs font-bold border border-border rounded-lg disabled:opacity-40 hover:bg-muted">Next</button>
            </div>
          </div>
        )}
      </div>

      {showManual && (
        <ManualEntryModal employees={employees} onClose={() => setShowManual(false)} onSave={handleManual} />
      )}
    </div>
  );
};

export default Attendance;
