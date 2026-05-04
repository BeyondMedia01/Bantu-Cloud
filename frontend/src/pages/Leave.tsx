import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus, Edit, Trash, CheckCircle2, XCircle, Clock, CalendarDays, ChevronDown } from 'lucide-react';
import { Dropdown } from '@/components/ui/dropdown';
import { EmptyState } from '@/components/ui/empty-state';
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

const SUB_TABS = [
  { label: 'Leave Policies', to: '/leave/policies' },
  { label: 'Leave Balances', to: '/leave/balances' },
  { label: 'Encashments',    to: '/leave/encashments' },
];

const Leave: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
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
          className="bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 flex items-center gap-1.5"
        >
          <Plus size={18} /> Add Leave
        </button>
      </header>

      {/* Sub-navigation tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {SUB_TABS.map((tab) => {
          const active = location.pathname === tab.to;
          return (
            <button
              key={tab.to}
              onClick={() => navigate(tab.to)}
              className={`px-4 py-2.5 text-sm font-bold transition-colors border-b-2 -mb-px ${
                active
                  ? 'border-navy text-navy'
                  : 'border-transparent text-slate-400 hover:text-navy'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
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
        <Dropdown
          className="w-full"
          trigger={(isOpen) => (
            <button type="button" className="w-full bg-primary border border-border rounded-2xl px-4 py-3 text-sm font-medium shadow-sm flex items-center justify-between hover:border-accent-green transition-colors">
              <span className="truncate">{filterStatus ? filterStatus.charAt(0) + filterStatus.slice(1).toLowerCase() : 'All Statuses'}</span>
              <ChevronDown size={14} className={`text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
          )}
          sections={[{ items: [
            { label: 'All Statuses', onClick: () => setFilterStatus('') },
            { label: 'Pending',      onClick: () => setFilterStatus('PENDING') },
            { label: 'Approved',     onClick: () => setFilterStatus('APPROVED') },
            { label: 'Rejected',     onClick: () => setFilterStatus('REJECTED') },
            { label: 'Cancelled',    onClick: () => setFilterStatus('CANCELLED') },
          ]}]}
        />

        {/* Employee autocomplete */}
        <div className="relative">
          <input
            type="text"
            value={filterEmployeeQuery}
            onChange={(e) => { setFilterEmployeeQuery(e.target.value); setEmpDropdownOpen(true); }}
            onFocus={() => setEmpDropdownOpen(true)}
            onBlur={() => setTimeout(() => setEmpDropdownOpen(false), 150)}
            placeholder="Search employee…"
            className="w-full bg-primary border border-border rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green shadow-sm"
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

        <input
          type="date"
          value={filterStartDate}
          onChange={(e) => setFilterStartDate(e.target.value)}
          className="w-full bg-primary border border-border rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green shadow-sm"
          placeholder="Start date"
        />

        <input
          type="date"
          value={filterEndDate}
          onChange={(e) => setFilterEndDate(e.target.value)}
          className="w-full bg-primary border border-border rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green shadow-sm"
          placeholder="End date"
        />
      </div>
      </div>

      {/* Table */}
      {loading ? (
        <SkeletonTable headers={['Employee', 'Leave Type', 'Dates', 'Days', 'Status', 'Actions']} />
      ) : records.length === 0 ? (
        <EmptyState
          variant="no-data"
          icon={CalendarDays}
          title="No leave records yet"
          description="Start tracking employee leave by recording the first entry."
          action={{ label: 'Record Leave', onClick: () => navigate('/leave/new') }}
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
