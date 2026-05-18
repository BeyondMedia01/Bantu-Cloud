import React, { useEffect, useState } from 'react';
import { Clock, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { EmployeeSelfAPI } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import SkeletonTable from '../../components/common/SkeletonTable';
import { EmptyState } from '../../components/ui/empty-state';

const STATUS_COLORS: Record<string, string> = {
  PRESENT:  'bg-emerald-50 text-emerald-700',
  ABSENT:   'bg-red-50 text-red-700',
  HALF_DAY: 'bg-amber-50 text-amber-700',
  HOLIDAY:  'bg-blue-50 text-blue-700',
  LEAVE:    'bg-purple-50 text-purple-700',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  PRESENT:  <CheckCircle2 size={12} />,
  ABSENT:   <XCircle size={12} />,
  HALF_DAY: <AlertCircle size={12} />,
  HOLIDAY:  <Clock size={12} />,
  LEAVE:    <Clock size={12} />,
};

const fmtTime = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

const fmtMinutes = (m: number) => {
  if (!m) return '—';
  const h = Math.floor(m / 60);
  const min = m % 60;
  return h > 0 ? `${h}h ${min}m` : `${min}m`;
};

const EmployeeAttendance: React.FC = () => {
  const { showToast } = useToast();
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    EmployeeSelfAPI.getAttendance()
      .then((r) => setRecords(r.data))
      .catch(() => showToast('Failed to load attendance records', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = filterStatus ? records.filter((r) => r.status === filterStatus) : records;

  const summary = {
    present:  records.filter((r) => r.status === 'PRESENT').length,
    absent:   records.filter((r) => r.status === 'ABSENT').length,
    halfDay:  records.filter((r) => r.status === 'HALF_DAY').length,
    leave:    records.filter((r) => r.status === 'LEAVE').length,
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">My Attendance</h1>
          <p className="text-muted-foreground font-medium text-sm">Your attendance records for the last 90 days</p>
        </div>
      </header>

      {/* Summary cards */}
      {!loading && records.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Days Present', value: summary.present, color: 'text-emerald-600' },
            { label: 'Days Absent',  value: summary.absent,  color: 'text-red-500' },
            { label: 'Half Days',    value: summary.halfDay, color: 'text-amber-500' },
            { label: 'On Leave',     value: summary.leave,   color: 'text-purple-600' },
          ].map((s) => (
            <div key={s.label} className="bg-primary border border-border rounded-2xl p-5 shadow-sm">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-3 flex-wrap">
        {['', 'PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE', 'HOLIDAY'].map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
              filterStatus === s
                ? 'bg-navy text-white border-navy'
                : 'border-border text-muted-foreground hover:border-navy hover:text-navy'
            }`}
          >
            {s === '' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase().replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="tbl-container">
        {loading ? (
          <SkeletonTable headers={['Date', 'Status', 'Shift', 'Clock In', 'Clock Out', 'Hours Worked']} rows={8} />
        ) : filtered.length === 0 ? (
          <EmptyState
            variant="no-data"
            icon={Clock}
            title="No attendance records"
            description="No records found for the selected filter."
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="tbl-head-row">
                {['Date', 'Status', 'Shift', 'Clock In', 'Clock Out', 'Hours Worked'].map((h) => (
                  <th key={h} className="tbl-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r: any) => (
                <tr key={r.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-5 py-3.5 font-medium text-navy">{fmtDate(r.date)}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${STATUS_COLORS[r.status] || 'bg-muted text-muted-foreground'}`}>
                      {STATUS_ICONS[r.status]}
                      {r.status.charAt(0) + r.status.slice(1).toLowerCase().replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground">{r.shift?.name || '—'}</td>
                  <td className="px-5 py-3.5 font-medium">{fmtTime(r.clockIn)}</td>
                  <td className="px-5 py-3.5 font-medium">{fmtTime(r.clockOut)}</td>
                  <td className="px-5 py-3.5 font-medium text-navy">{fmtMinutes(r.totalMinutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default EmployeeAttendance;
