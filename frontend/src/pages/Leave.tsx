import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Trash, CheckCircle2, XCircle, Clock, Shield, BarChart2, Banknote, CalendarDays } from 'lucide-react';
import { EmptyState } from '../components/common/EmptyState';
import SkeletonTable from '../components/common/SkeletonTable';
import ConfirmModal from '../components/common/ConfirmModal';
import { LeaveAPI, EmployeeAPI } from '../api/client';
import { useToast } from '../context/ToastContext';

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
  const { showToast } = useToast();
  const [records, setRecords] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterEmployeeQuery, setFilterEmployeeQuery] = useState('');
  const [empDropdownOpen, setEmpDropdownOpen] = useState(false);
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);

  const load = () => {
    setLoading(true);
    LeaveAPI.getAll()
      .then((r) => {
        const data = r.data;
        setRecords(Array.isArray(data) ? data : (data.records || []));
      })
      .catch(() => showToast('Failed to load leave records', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    EmployeeAPI.getAll({ limit: '500' })
      .then((r) => setEmployees(r.data?.data || r.data || []))
      .catch(() => {});
  }, []);

  const handleDelete = (item: any) => {
    const label = `${item.employee?.firstName ?? ''} ${item.employee?.lastName ?? ''} — ${item.type}`.trim();
    setDeleteTarget({ id: item.id, label });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await LeaveAPI.delete(deleteTarget.id);
      showToast('Leave record deleted', 'success');
      load();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to delete leave record', 'error');
    } finally {
      setDeleteTarget(null);
    }
  };

  const hasFilters = filterStatus || filterEmployee || filterStartDate || filterEndDate;
  const clearFilters = () => {
    setFilterStatus(''); setFilterEmployee(''); setFilterEmployeeQuery('');
    setFilterStartDate(''); setFilterEndDate('');
  };

  const filteredEmployees = employees.filter((e: any) => {
    const q = filterEmployeeQuery.toLowerCase();
    return !q || `${e.firstName} ${e.lastName}`.toLowerCase().includes(q) || (e.employeeCode || '').toLowerCase().includes(q);
  });

  const filtered = records.filter((r) => {
    if (filterStatus && r.status !== filterStatus) return false;
    if (filterEmployee && r.employeeId !== filterEmployee) return false;
    if (filterStartDate && r.startDate?.slice(0, 10) < filterStartDate) return false;
    if (filterEndDate && r.endDate?.slice(0, 10) > filterEndDate) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-6">
      {deleteTarget && (
        <ConfirmModal
          title="Delete Leave Record"
          message={`Delete leave record for ${deleteTarget.label}? This action cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Leave Management</h1>
          <p className="text-slate-500 font-medium text-sm">Track and manage employee leave records</p>
        </div>
        <button
          onClick={() => navigate('/leave/new')}
          className="bg-brand text-navy px-6 py-3 rounded-full font-bold shadow hover:opacity-90 flex items-center gap-2"
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

      {/* Filters */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Filters</p>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="text-xs font-bold text-slate-400 hover:text-red-500 px-3 py-1.5 rounded-full border border-border hover:border-red-200 hover:bg-red-50 transition-colors"
            >
              × Clear filters
            </button>
          )}
        </div>
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

        {/* Employee autocomplete */}
        <div className="relative">
          <input
            type="text"
            value={filterEmployeeQuery}
            onChange={(e) => { setFilterEmployeeQuery(e.target.value); setEmpDropdownOpen(true); }}
            onFocus={() => setEmpDropdownOpen(true)}
            onBlur={() => setTimeout(() => setEmpDropdownOpen(false), 150)}
            placeholder="Search employee…"
            className="w-full bg-primary border border-border rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue shadow-sm"
          />
          {filterEmployee && (
            <button
              type="button"
              onClick={() => { setFilterEmployee(''); setFilterEmployeeQuery(''); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-navy text-lg leading-none"
            >×</button>
          )}
          {empDropdownOpen && filteredEmployees.length > 0 && (
            <div className="absolute z-20 mt-1 w-full bg-primary border border-border rounded-2xl shadow-lg max-h-52 overflow-y-auto">
              {filteredEmployees.slice(0, 30).map((e: any) => (
                <button
                  key={e.id}
                  type="button"
                  className="w-full text-left px-4 py-2.5 text-sm font-medium hover:bg-slate-50 transition-colors"
                  onMouseDown={() => {
                    setFilterEmployee(e.id);
                    setFilterEmployeeQuery(`${e.firstName} ${e.lastName}`);
                    setEmpDropdownOpen(false);
                  }}
                >
                  <span className="font-bold text-navy">{e.firstName} {e.lastName}</span>
                  <span className="text-slate-400 ml-2 text-xs">{e.employeeCode}</span>
                </button>
              ))}
            </div>
          )}
        </div>

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
      </div>

      {/* Table */}
      {loading ? (
        <SkeletonTable headers={['Employee', 'Leave Type', 'Dates', 'Days', 'Status', 'Actions']} />
      ) : records.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No leave records yet"
          description="Start tracking employee leave by recording the first entry."
          actionLabel="Record Leave"
          onAction={() => navigate('/leave/new')}
        />
      ) : (
      <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto scroll-x-shadow">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-slate-50">
                  {['Employee', 'Leave Type', 'Dates', 'Days', 'Status', 'Actions'].map((h) => (
                    <th key={h} scope="col" className="px-5 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length > 0 ? filtered.map((item: any) => (
                  <tr key={item.id} className="hover:bg-slate-100/70 transition-colors">
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
                          aria-label="Edit leave record"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(item)}
                          className="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors"
                          aria-label="Delete leave record"
                        >
                          <Trash size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400 font-medium">
                      No records match your filters.
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
