import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { AdminAPI, type AuditLog } from '../../api/client';

const ACTION_COLORS: Record<string, string> = {
  EMPLOYEE_CREATED:   'bg-emerald-100 text-emerald-700',
  EMPLOYEE_UPDATED:   'bg-blue-100 text-blue-700',
  EMPLOYEE_DELETED:   'bg-red-100 text-red-700',
  PAYROLL_CREATED:    'bg-violet-100 text-violet-700',
  PAYROLL_COMPLETED:  'bg-emerald-100 text-emerald-700',
  LEAVE_CREATED:      'bg-amber-100 text-amber-700',
  LEAVE_APPROVED:     'bg-emerald-100 text-emerald-700',
  LEAVE_REJECTED:     'bg-red-100 text-red-700',
  LOAN_CREATED:       'bg-teal-100 text-teal-700',
  LOAN_UPDATED:       'bg-blue-100 text-blue-700',
};

function actionColor(action: string): string {
  return ACTION_COLORS[action] ?? 'bg-slate-100 text-slate-600';
}

const LIMIT = 50;

const AuditLogs: React.FC = () => {
  const navigate = useNavigate();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  // Filters
  const [action, setAction]     = useState('');
  const [resource, setResource] = useState('');
  const [email, setEmail]       = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');

  const fetchLogs = useCallback(async (pg = 1) => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        page: String(pg),
        limit: String(LIMIT),
      };
      if (action)   params.action    = action;
      if (resource) params.resource  = resource;
      if (email)    params.userEmail = email;
      if (dateFrom) params.dateFrom  = dateFrom;
      if (dateTo)   params.dateTo    = dateTo;

      const res = await AdminAPI.getLogs(params);
      setLogs(res.data.logs);
      setTotal(res.data.total);
      setPage(pg);
    } catch {
      // silently fail — user can retry
    } finally {
      setLoading(false);
    }
  }, [action, resource, email, dateFrom, dateTo]);

  useEffect(() => {
    fetchLogs(1);
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate('/admin')} aria-label="Go back" className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Audit Logs</h1>
          <p className="text-slate-500 font-medium text-sm">All platform actions across users and resources</p>
        </div>
        <button
          onClick={() => fetchLogs(page)}
          className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-navy px-3 py-2 rounded-xl hover:bg-slate-100 transition-colors"
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="bg-primary border border-border rounded-2xl p-5 mb-6 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <input
            type="text"
            placeholder="Action (e.g. EMPLOYEE_CREATED)"
            aria-label="Filter by action"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="px-4 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/30 focus:border-accent-green"
          />
          <input
            type="text"
            placeholder="Resource (e.g. employee)"
            aria-label="Filter by resource"
            value={resource}
            onChange={(e) => setResource(e.target.value)}
            className="px-4 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/30 focus:border-accent-green"
          />
          <input
            type="text"
            placeholder="User email"
            aria-label="Filter by user email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="px-4 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/30 focus:border-accent-green"
          />
          <input
            type="date"
            aria-label="Filter from date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-4 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/30 focus:border-accent-green"
          />
          <input
            type="date"
            aria-label="Filter to date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-4 py-2.5 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/30 focus:border-accent-green"
          />
        </div>
        <div className="flex gap-3 mt-3">
          <button
            onClick={() => fetchLogs(1)}
            className="flex items-center gap-2 bg-brand text-navy px-5 py-2 rounded-full text-sm font-bold hover:opacity-90"
          >
            <Search size={14} /> Search
          </button>
          <button
            onClick={() => {
              setAction(''); setResource(''); setEmail('');
              setDateFrom(''); setDateTo('');
              setTimeout(() => fetchLogs(1), 0);
            }}
            className="px-5 py-2 rounded-full border border-border text-sm font-bold text-slate-500 hover:bg-slate-50"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-primary border border-border rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm font-medium">Loading…</div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm font-medium">No audit logs found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-3 text-xs font-black text-slate-400 uppercase tracking-wider">Timestamp</th>
                  <th className="text-left px-5 py-3 text-xs font-black text-slate-400 uppercase tracking-wider">Action</th>
                  <th className="text-left px-5 py-3 text-xs font-black text-slate-400 uppercase tracking-wider">Resource</th>
                  <th className="text-left px-5 py-3 text-xs font-black text-slate-400 uppercase tracking-wider">User</th>
                  <th className="text-left px-5 py-3 text-xs font-black text-slate-400 uppercase tracking-wider">Details</th>
                  <th className="text-left px-5 py-3 text-xs font-black text-slate-400 uppercase tracking-wider">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3 text-slate-500 font-medium whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString(undefined, {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-[11px] font-black uppercase tracking-wide px-2 py-1 rounded-full ${actionColor(log.action)}`}>
                        {log.action.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="font-medium text-navy">{log.resource}</span>
                      {log.resourceId && (
                        <span className="text-slate-400 text-[11px] ml-1 font-mono">#{log.resourceId.slice(-6)}</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-600 font-medium">{log.userEmail ?? '—'}</td>
                    <td className="px-5 py-3 text-slate-400 font-mono text-[11px] max-w-[220px] truncate">
                      {log.details ? JSON.stringify(log.details) : '—'}
                    </td>
                    <td className="px-5 py-3 text-slate-400 font-mono text-[11px]">{log.ipAddress ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && total > LIMIT && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-border">
            <span className="text-xs text-slate-400 font-medium">
              {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total} entries
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchLogs(page - 1)}
                disabled={page <= 1}
                className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-bold text-navy">{page} / {totalPages}</span>
              <button
                onClick={() => fetchLogs(page + 1)}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLogs;
