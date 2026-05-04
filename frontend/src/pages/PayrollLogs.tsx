import { useState, useEffect } from 'react';
import { Search, FileText, AlertCircle, CheckCircle, Filter, ChevronDown, ChevronRight, Clock, User, Database } from 'lucide-react';
import { Dropdown } from '@/components/ui/dropdown';
import { PayrollLogAPI } from '../api/client';

const ACTION_TYPES = ['CREATE', 'UPDATE', 'DELETE', 'PROCESS_PAYROLL', 'EXPORT', 'LOGIN', 'SYSTEM_EVENT'];

const PayrollLogs: React.FC<{ activeCompanyId?: string | null }> = ({ activeCompanyId }) => {
  const [logs, setLogs] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchLogs = async () => {
    try {
      const params: Record<string, string> = {};
      if (filterAction) params.actionType = filterAction;
      if (filterStatus) params.status = filterStatus;
      const response = await PayrollLogAPI.getAll(params);
      setLogs(response.data);
    } catch (error) {
    }
  };

  useEffect(() => {
    if (activeCompanyId) fetchLogs();
  }, [activeCompanyId, filterAction, filterStatus]);

  const filteredLogs = logs.filter(log =>
    log.entityAffected.toLowerCase().includes(search.toLowerCase()) ||
    (log.entityId || '').toLowerCase().includes(search.toLowerCase()) ||
    (log.payrollUser?.fullName || '').toLowerCase().includes(search.toLowerCase())
  );

  const getActionStyle = (type: string) => {
    switch (type) {
      case 'DELETE':        return 'bg-red-50 text-red-600 border-red-100';
      case 'PROCESS_PAYROLL': return 'bg-purple-50 text-purple-600 border-purple-100';
      case 'EXPORT':        return 'bg-amber-50 text-amber-600 border-amber-100';
      case 'LOGIN':         return 'bg-sky-50 text-sky-600 border-sky-100';
      case 'CREATE':        return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      case 'UPDATE':        return 'bg-accent-green/10 text-accent-green border-accent-green/20';
      default:              return 'bg-muted text-muted-foreground border-border';
    }
  };

  const hasValueChange = (log: any) => log.oldValue || log.newValue;

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h2 className="text-3xl font-bold text-navy mb-1">Payroll Activity Logs</h2>
        <p className="text-muted-foreground font-medium">Immutable audit trail of all actions, changes, and system events.</p>
      </header>

      {/* Immutability Banner */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-5 flex items-center gap-4 border border-slate-700">
        <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20 shrink-0">
          <AlertCircle size={22} />
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          <strong className="text-white">Read-Only Archive.</strong> Entries in this log are append-only and cannot be edited or deleted by any user. This ensures full compliance integrity for audits and regulatory reviews.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-primary rounded-3xl border border-border shadow-sm overflow-hidden">
        <div className="p-4 px-6 border-b border-border bg-muted/30 flex flex-col sm:flex-row gap-3 items-center">
          <div className="relative flex-1 min-w-0">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by entity, entity ID, or user..."
              aria-label="Search payroll logs"
              className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:border-accent-green shadow-sm"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2 shrink-0">
            <Dropdown
              trigger={(isOpen) => (
                <button type="button" className="flex items-center gap-2 px-3 py-2 bg-background border border-border rounded-xl text-sm font-semibold shadow-sm hover:border-accent-green transition-colors">
                  <Filter size={14} className="text-muted-foreground shrink-0" />
                  <span className="truncate">{filterAction ? filterAction.replace('_', ' ') : 'All Actions'}</span>
                  <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
              )}
              sections={[{ items: [
                { label: 'All Actions', onClick: () => setFilterAction('') },
                ...ACTION_TYPES.map(a => ({ label: a.replace('_', ' '), onClick: () => setFilterAction(a) })),
              ]}]}
            />
            <Dropdown
              trigger={(isOpen) => (
                <button type="button" className="flex items-center gap-2 px-3 py-2 bg-background border border-border rounded-xl text-sm font-semibold shadow-sm hover:border-accent-green transition-colors">
                  <span className="truncate">{filterStatus || 'All Statuses'}</span>
                  <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
              )}
              sections={[{ items: [
                { label: 'All Statuses', onClick: () => setFilterStatus('') },
                { label: 'Success',      onClick: () => setFilterStatus('SUCCESS') },
                { label: 'Failed',       onClick: () => setFilterStatus('FAILED') },
              ]}]}
            />
          </div>
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest shrink-0">{filteredLogs.length} entries</span>
        </div>

        {/* Log Entries */}
        <div className="divide-y divide-border">
          {filteredLogs.length > 0 ? filteredLogs.map(log => (
            <div key={log.id} className="hover:bg-muted/40 transition-colors">
              <div
                className="p-4 px-6 flex flex-col sm:flex-row sm:items-center gap-4 cursor-pointer"
                onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
              >
                {/* Status */}
                <div className="shrink-0">
                  {log.status === 'SUCCESS'
                    ? <CheckCircle size={18} className="text-emerald-500" />
                    : <AlertCircle size={18} className="text-red-500" />
                  }
                </div>

                {/* Main Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest border ${getActionStyle(log.actionType)}`}>
                      {log.actionType.replace('_', ' ')}
                    </span>
                    <span className="text-sm font-bold text-navy">{log.entityAffected}</span>
                    {log.entityId && (
                      <span className="text-xs font-mono text-muted-foreground truncate max-w-[120px]" title={log.entityId}>#{log.entityId.slice(0, 8)}…</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground font-bold uppercase tracking-tight">
                    <span className="flex items-center gap-1"><Clock size={11} />{new Date(log.actionTimestamp).toLocaleString()}</span>
                    {log.payrollUser && <span className="flex items-center gap-1"><User size={11} />{log.payrollUser.fullName}</span>}
                    {log.ipAddress && <span className="flex items-center gap-1"><Database size={11} />{log.ipAddress}</span>}
                  </div>
                  {log.errorMessage && (
                    <p className="mt-1 text-xs text-red-500 font-semibold italic">{log.errorMessage}</p>
                  )}
                </div>

                {/* Expand toggle */}
                {hasValueChange(log) && (
                  <div className="text-muted-foreground/50 shrink-0">
                    {expandedId === log.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </div>
                )}
              </div>

              {/* Expanded diff view */}
              {expandedId === log.id && hasValueChange(log) && (
                <div className="px-6 pb-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {log.oldValue && (
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-2">Before</p>
                      <pre className="bg-red-50 border border-red-100 p-4 rounded-xl text-xs text-red-800 overflow-auto max-h-48 font-mono whitespace-pre-wrap">
                        {(() => { try { return JSON.stringify(JSON.parse(log.oldValue), null, 2); } catch { return log.oldValue; } })()}
                      </pre>
                    </div>
                  )}
                  {log.newValue && (
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-2">After</p>
                      <pre className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl text-xs text-emerald-800 overflow-auto max-h-48 font-mono whitespace-pre-wrap">
                        {(() => { try { return JSON.stringify(JSON.parse(log.newValue), null, 2); } catch { return log.newValue; } })()}
                      </pre>
                    </div>
                  )}
                  {log.notes && (
                    <div className="md:col-span-2">
                      <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">Notes</p>
                      <p className="text-sm text-foreground/80">{log.notes}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )) : (
            <div className="p-20 text-center text-muted-foreground">
              <FileText size={36} className="mx-auto mb-3 opacity-20" />
              <p className="italic font-medium">No log entries found matching your criteria.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PayrollLogs;
