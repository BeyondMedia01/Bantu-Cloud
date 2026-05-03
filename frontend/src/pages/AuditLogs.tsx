import React, { useEffect, useState, useCallback } from 'react';
import {
  Search, Shield, Download, ChevronLeft, ChevronRight,
  Calendar, User, Database, Tag, Clock, AlertCircle, SlidersHorizontal,
  X, RefreshCw,
} from 'lucide-react';
import { AuditLogAPI } from '../api/client';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface AuditLog {
  id: string;
  userId: string | null;
  userEmail: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const ACTION_META: Record<string, { color: string; bg: string; dot: string }> = {
  CREATE: { color: 'text-emerald-700', bg: 'bg-emerald-50', dot: 'bg-emerald-400' },
  UPDATE: { color: 'text-blue-700',    bg: 'bg-blue-50',    dot: 'bg-blue-400'    },
  DELETE: { color: 'text-rose-700',    bg: 'bg-rose-50',    dot: 'bg-rose-400'    },
  LOGIN:  { color: 'text-violet-700',  bg: 'bg-violet-50',  dot: 'bg-violet-400'  },
  EXPORT: { color: 'text-amber-700',   bg: 'bg-amber-50',   dot: 'bg-amber-400'   },
};

function getActionMeta(action: string) {
  const verb = action.split('_')[0];
  return ACTION_META[verb] ?? { color: 'text-slate-600', bg: 'bg-slate-100', dot: 'bg-slate-400' };
}

function formatResource(r: string) {
  return r.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatAction(a: string) {
  return a.replace(/_/g, ' ');
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  };
}

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Sub-components ────────────────────────────────────────────────────────────

const ActionBadge: React.FC<{ action: string }> = ({ action }) => {
  const meta = getActionMeta(action);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase ${meta.bg} ${meta.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
      {formatAction(action)}
    </span>
  );
};

const FilterPill: React.FC<{ label: string; onRemove: () => void }> = ({ label, onRemove }) => (
  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-navy text-white rounded-full text-xs font-semibold">
    {label}
    <button onClick={onRemove} className="hover:opacity-70 transition-opacity">
      <X size={12} />
    </button>
  </span>
);

const EmptyState: React.FC = () => (
  <tr>
    <td colSpan={6} className="px-8 py-24 text-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center">
          <Shield size={28} className="text-slate-500" />
        </div>
        <div>
          <p className="text-sm font-bold text-slate-400">No events found</p>
          <p className="text-xs text-slate-500 mt-1">Adjust your filters or expand the date range</p>
        </div>
      </div>
    </td>
  </tr>
);

// ─── Main Page ─────────────────────────────────────────────────────────────────

const LIMIT = 50;

const AuditLogs: React.FC<{ activeCompanyId?: string | null }> = ({ activeCompanyId }) => {
  const [logs, setLogs]     = useState<AuditLog[]>([]);
  const [total, setTotal]   = useState(0);
  const [page, setPage]     = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  // Filters
  const [search, setSearch]       = useState('');
  const [filterAction, setFilterAction]     = useState('');
  const [filterResource, setFilterResource] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo]     = useState('');
  const [showFilters, setShowFilters]       = useState(false);

  // Expanded row
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchLogs = useCallback(async (p = 1) => {
    if (!activeCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { page: String(p), limit: String(LIMIT) };
      if (filterAction)   params.action   = filterAction;
      if (filterResource) params.resource = filterResource;
      if (search)         params.userEmail = search;
      if (filterDateFrom) params.dateFrom = filterDateFrom;
      if (filterDateTo)   params.dateTo   = filterDateTo;

      const res = await AuditLogAPI.getAll(params);
      const body = res.data as unknown as { logs: AuditLog[]; total: number };
      setLogs(body.logs ?? []);
      setTotal(body.total ?? 0);
      setPage(p);
    } catch {
      setError('Failed to load audit events. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId, filterAction, filterResource, search, filterDateFrom, filterDateTo]);

  useEffect(() => { fetchLogs(1); }, [fetchLogs]);

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const activeFilters: { label: string; clear: () => void }[] = [
    ...(filterAction   ? [{ label: `Action: ${filterAction}`,     clear: () => setFilterAction('')   }] : []),
    ...(filterResource ? [{ label: `Resource: ${filterResource}`, clear: () => setFilterResource('') }] : []),
    ...(filterDateFrom ? [{ label: `From: ${filterDateFrom}`,     clear: () => setFilterDateFrom('') }] : []),
    ...(filterDateTo   ? [{ label: `To: ${filterDateTo}`,         clear: () => setFilterDateTo('')   }] : []),
  ];

  return (
    <div className="flex flex-col gap-6 max-w-[1400px] mx-auto">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-navy flex items-center justify-center shadow-lg shadow-navy/20 flex-shrink-0">
            <Shield size={22} className="text-brand" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-navy tracking-tight leading-none">Audit Log</h1>
            <p className="text-sm text-slate-400 font-medium mt-0.5">
              Immutable record of every system action
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchLogs(page)}
            className="p-2.5 rounded-xl border border-slate-200 text-slate-400 hover:text-navy hover:border-slate-300 hover:bg-slate-50 transition-all"
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button className="flex items-center gap-2 px-4 py-2.5 bg-brand text-navy text-sm font-bold rounded-xl hover:opacity-90 transition-opacity shadow-sm">
            <Download size={15} />
            Export
          </button>
        </div>
      </header>

      {/* ── Stats Strip ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Events', value: total.toLocaleString(), icon: Database, accent: 'text-accent-blue' },
          { label: 'This Page',    value: logs.length,             icon: Clock,    accent: 'text-emerald-500' },
          { label: 'Page',         value: `${page} / ${totalPages}`, icon: Tag,   accent: 'text-amber-500'   },
          { label: 'Per Page',     value: LIMIT,                   icon: SlidersHorizontal, accent: 'text-violet-500' },
        ].map(({ label, value, icon: Icon, accent }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
            <div className={`w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center flex-shrink-0`}>
              <Icon size={15} className={accent} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">{label}</p>
              <p className="text-lg font-black text-navy leading-none">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Error ───────────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-700">
          <AlertCircle size={18} className="flex-shrink-0" />
          <p className="text-sm font-semibold">{error}</p>
        </div>
      )}

      {/* ── Table Card ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-100/80 overflow-hidden">

        {/* Toolbar */}
        <div className="p-5 border-b border-slate-50 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 max-w-sm">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by email…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 rounded-xl text-sm font-medium text-navy placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-accent-blue/20 transition-all border-none"
              />
            </div>

            {/* Filter toggle */}
            <button
              onClick={() => setShowFilters(v => !v)}
              className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
                showFilters || activeFilters.length > 0
                  ? 'bg-navy text-white border-navy'
                  : 'bg-slate-50 text-slate-500 border-slate-100 hover:border-slate-200'
              }`}
            >
              <SlidersHorizontal size={15} />
              Filters
              {activeFilters.length > 0 && (
                <span className="w-4 h-4 rounded-full bg-brand text-navy text-[9px] font-black flex items-center justify-center">
                  {activeFilters.length}
                </span>
              )}
            </button>
          </div>

          {/* Filter panel */}
          {showFilters && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Tag size={11} /> Action
                </label>
                <input
                  type="text"
                  placeholder="e.g. PAYROLL_CREATED"
                  aria-label="Filter by action"
                  value={filterAction}
                  onChange={e => setFilterAction(e.target.value)}
                  className="px-3 py-2 bg-slate-50 rounded-xl text-xs font-medium text-navy placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-accent-blue/20 border-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Database size={11} /> Resource
                </label>
                <input
                  type="text"
                  placeholder="e.g. employee"
                  aria-label="Filter by resource"
                  value={filterResource}
                  onChange={e => setFilterResource(e.target.value)}
                  className="px-3 py-2 bg-slate-50 rounded-xl text-xs font-medium text-navy placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-accent-blue/20 border-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Calendar size={11} /> From
                </label>
                <input
                  type="date"
                  aria-label="Filter from date"
                  value={filterDateFrom}
                  onChange={e => setFilterDateFrom(e.target.value)}
                  className="px-3 py-2 bg-slate-50 rounded-xl text-xs font-medium text-navy outline-none focus:ring-2 focus:ring-accent-blue/20 border-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Calendar size={11} /> To
                </label>
                <input
                  type="date"
                  aria-label="Filter to date"
                  value={filterDateTo}
                  onChange={e => setFilterDateTo(e.target.value)}
                  className="px-3 py-2 bg-slate-50 rounded-xl text-xs font-medium text-navy outline-none focus:ring-2 focus:ring-accent-blue/20 border-none"
                />
              </div>
            </div>
          )}

          {/* Active filter pills */}
          {activeFilters.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active:</span>
              {activeFilters.map(f => (
                <FilterPill key={f.label} label={f.label} onRemove={f.clear} />
              ))}
              <button
                onClick={() => { setFilterAction(''); setFilterResource(''); setFilterDateFrom(''); setFilterDateTo(''); }}
                className="text-[10px] font-bold text-slate-400 hover:text-rose-500 uppercase tracking-widest transition-colors"
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[800px]">
            <thead>
              <tr className="border-b border-slate-50">
                {['Timestamp', 'Actor', 'Action', 'Resource', 'Resource ID', 'IP'].map(h => (
                  <th key={h} className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] whitespace-nowrap bg-slate-50/60">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50/80">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-6 py-5">
                        <div className={`h-3 bg-slate-100 rounded-full animate-pulse ${j === 0 ? 'w-32' : j === 1 ? 'w-40' : 'w-24'}`} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <EmptyState />
              ) : logs.map(log => {
                const { date, time } = formatDate(log.createdAt);
                const isExpanded = expandedId === log.id;
                return (
                  <React.Fragment key={log.id}>
                    <tr
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                      className="hover:bg-slate-50/70 cursor-pointer transition-colors group"
                    >
                      {/* Timestamp */}
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-0.5">
                          <p className="text-xs font-bold text-navy leading-none">{date}</p>
                          <p className="text-[11px] font-mono text-slate-400 leading-none mt-1">{time}</p>
                          <p className="text-[10px] text-slate-500 leading-none mt-0.5">{formatRelative(log.createdAt)}</p>
                        </div>
                      </td>

                      {/* Actor */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                            <User size={13} className="text-slate-400" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-navy leading-none truncate max-w-[160px]">
                              {log.userEmail ?? <span className="text-slate-500 italic">System</span>}
                            </p>
                            {log.userId && (
                              <p className="text-[10px] font-mono text-slate-500 leading-none mt-1 truncate max-w-[160px]">{log.userId.slice(0, 8)}…</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Action */}
                      <td className="px-6 py-4">
                        <ActionBadge action={log.action} />
                      </td>

                      {/* Resource */}
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg">
                          <Database size={11} className="text-slate-400" />
                          {formatResource(log.resource)}
                        </span>
                      </td>

                      {/* Resource ID */}
                      <td className="px-6 py-4">
                        {log.resourceId ? (
                          <p className="text-[11px] font-mono text-slate-400 truncate max-w-[100px]" title={log.resourceId}>
                            {log.resourceId.slice(0, 8)}…
                          </p>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>

                      {/* IP */}
                      <td className="px-6 py-4">
                        <p className="text-[11px] font-mono text-slate-400">
                          {log.ipAddress ?? <span className="text-slate-400">—</span>}
                        </p>
                      </td>
                    </tr>

                    {/* Expanded details row */}
                    {isExpanded && (
                      <tr className="bg-slate-50/80">
                        <td colSpan={6} className="px-6 py-4">
                          <div className="flex items-start gap-3">
                            <div className="w-5 h-5 rounded-md bg-navy/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <Database size={11} className="text-navy/40" />
                            </div>
                            <div className="flex-1">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Event Details</p>
                              {log.details ? (
                                <pre className="text-[11px] font-mono text-slate-600 bg-white border border-slate-100 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                                  {JSON.stringify(log.details, null, 2)}
                                </pre>
                              ) : (
                                <p className="text-xs text-slate-500 italic">No additional details recorded</p>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-50 flex items-center justify-between gap-4">
            <p className="text-xs text-slate-400 font-medium">
              Showing <span className="font-bold text-navy">{(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)}</span> of <span className="font-bold text-navy">{total.toLocaleString()}</span> events
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchLogs(page - 1)}
                disabled={page <= 1 || loading}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all border border-slate-100"
              >
                <ChevronLeft size={14} /> Previous
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let p: number;
                  if (totalPages <= 5) {
                    p = i + 1;
                  } else if (page <= 3) {
                    p = i + 1;
                  } else if (page >= totalPages - 2) {
                    p = totalPages - 4 + i;
                  } else {
                    p = page - 2 + i;
                  }
                  return (
                    <button
                      key={p}
                      onClick={() => fetchLogs(p)}
                      className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                        p === page
                          ? 'bg-navy text-white shadow-sm'
                          : 'text-slate-400 hover:bg-slate-50 hover:text-navy'
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => fetchLogs(page + 1)}
                disabled={page >= totalPages || loading}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all border border-slate-100"
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLogs;
