import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Trash, CheckCircle2, XCircle, Clock, CalendarDays, Shield, BarChart2, Banknote } from 'lucide-react';
import SkeletonTable from '../components/common/SkeletonTable';
import { LeaveAPI, EmployeeAPI } from '../api/client';

const STATUS_COLORS: Record<string, string> = {
  APPROVED: 'bg-emerald-50 text-emerald-700',
  REJECTED: 'bg-red-50 text-red-700',
  PENDING:  'bg-amber-50 text-amber-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  APPROVED: <CheckCircle2 size={12} />,
  REJECTED: <XCircle size={12} />,
  PENDING:  <Clock size={12} />,
};

const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const Leave: React.FC = () => {
  const navigate = useNavigate();
  const [records, setRecords] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [actionError, setActionError] = useState('');

  const load = () => {
    setLoading(true);
    LeaveAPI.getAll()
      .then((r) => {
        const data = r.data;
        // Support both {records:[]} and flat array responses
        setRecords(Array.isArray(data) ? data : (data.records || []));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    EmployeeAPI.getAll({ limit: '500' })
      .then((r) => setEmployees(r.data?.data || r.data || []))
      .catch(() => {});
  }, []);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this leave record?')) return;
    setActionError('');
    try {
      await LeaveAPI.delete(id);
      load();
    } catch (err: any) {
      setActionError(err.response?.data?.message || 'Failed to delete leave record');
    }
  };

  const filtered = records.filter((r) => {
    if (filterStatus && r.status !== filterStatus) return false;
    if (filterEmployee && r.employeeId !== filterEmployee) return false;
    if (filterStartDate && r.startDate?.slice(0, 10) < filterStartDate) return false;
    if (filterEndDate && r.endDate?.slice(0, 10) > filterEndDate) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-navy">Leave Management</h2>
          <p className="text-slate-500 font-medium text-sm">Track and manage employee leave records</p>
        </div>
        <button
          onClick={() => navigate('/leave/new')}
          className="bg-btn-primary text-navy px-6 py-3 rounded-full font-bold shadow hover:opacity-90 flex items-center gap-2"
        >
          <Plus size={18} /> Add Leave
        </button>
      </header>

      {/* Quick nav to leave sub-sections */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          onClick={() => navigate('/leave/policies')}
          className="flex items-center gap-3 p-4 bg-primary rounded-2xl border border-border hover:bg-slate-50 text-left shadow-sm transition-colors"
        >
          <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center"><Shield size={18} /></div>
          <div>
            <p className="text-sm font-bold text-navy">Leave Policies</p>
            <p className="text-xs text-slate-400">Accrual rates &amp; carry-over rules</p>
          </div>
        </button>
        <button
          onClick={() => navigate('/leave/balances')}
          className="flex items-center gap-3 p-4 bg-primary rounded-2xl border border-border hover:bg-slate-50 text-left shadow-sm transition-colors"
        >
          <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center"><BarChart2 size={18} /></div>
          <div>
            <p className="text-sm font-bold text-navy">Leave Balances</p>
            <p className="text-xs text-slate-400">Per-employee accrual tracking</p>
          </div>
        </button>
        <button
          onClick={() => navigate('/leave/encashments')}
          className="flex items-center gap-3 p-4 bg-primary rounded-2xl border border-border hover:bg-slate-50 text-left shadow-sm transition-colors"
        >
          <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center"><Banknote size={18} /></div>
          <div>
            <p className="text-sm font-bold text-navy">Encashments</p>
            <p className="text-xs text-slate-400">Convert leave days to earnings</p>
          </div>
        </button>
      </div>

      {actionError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium">{actionError}</div>
      )}

      {/* Filters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue shadow-sm"
        >
          <option value="">All Statuses</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="CANCELLED">Cancelled</option>
        </select>

        <select
          value={filterEmployee}
          onChange={(e) => setFilterEmployee(e.target.value)}
          className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue shadow-sm"
        >
          <option value="">All Employees</option>
          {employees.map((e: any) => (
            <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>
          ))}
        </select>

        <div className="relative">
          <input
            type="date"
            value={filterStartDate}
            onChange={(e) => setFilterStartDate(e.target.value)}
            className="w-full bg-primary border border-border rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue shadow-sm"
            placeholder="Start date"
          />
        </div>

        <div className="relative">
          <input
            type="date"
            value={filterEndDate}
            onChange={(e) => setFilterEndDate(e.target.value)}
            className="w-full bg-primary border border-border rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue shadow-sm"
            placeholder="End date"
          />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <SkeletonTable headers={['Employee', 'Leave Type', 'Dates', 'Days', 'Status', 'Actions']} />
      ) : (
      <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-slate-50">
                  {['Employee', 'Leave Type', 'Dates', 'Days', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="px-5 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length > 0 ? filtered.map((item: any) => (
                  <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-4">
                      <p className="text-sm font-bold">{item.employee?.firstName} {item.employee?.lastName}</p>
                      <p className="text-xs text-slate-400 font-semibold">{item.employee?.employeeCode || '—'}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-sm font-medium capitalize">
                        {item.type?.charAt(0) + item.type?.slice(1).toLowerCase().replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-sm font-medium">{fmtDate(item.startDate)}</p>
                      <p className="text-xs text-slate-400">to {fmtDate(item.endDate)}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-sm font-bold">{item.totalDays ?? item.days ?? '—'}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${STATUS_COLORS[item.status] || 'bg-slate-100 text-slate-600'}`}>
                        {STATUS_ICONS[item.status]} {item.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => navigate(`/leave/${item.id}/edit`)}
                          className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-navy transition-colors"
                          title="Edit"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors"
                          title="Delete"
                        >
                          <Trash size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400 font-medium">
                      No leave records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
      </div>
      )}
    </div>
  );
};

export default Leave;
