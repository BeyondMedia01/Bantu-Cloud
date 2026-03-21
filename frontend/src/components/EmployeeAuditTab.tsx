import React, { useEffect, useState } from 'react';
import { History, User as UserIcon, Calendar, Info, Clock } from 'lucide-react';
import { EmployeeAPI, type AuditLog } from '../api/client';

interface Props {
  employeeId: string;
}

const EmployeeAuditTab: React.FC<Props> = ({ employeeId }) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    EmployeeAPI.getAuditLogs(employeeId)
      .then(res => setLogs(res.data))
      .catch(err => console.error('Failed to load audit logs:', err))
      .finally(() => setLoading(false));
  }, [employeeId]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-blue"></div>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
        <History size={48} className="opacity-10" />
        <p className="font-semibold">No audit history found for this employee</p>
        <p className="text-xs">Actions like creation, transfers, and updates will appear here.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-2 bg-accent-blue/10 rounded-lg text-accent-blue">
          <History size={20} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-navy">Audit Trail</h3>
          <p className="text-xs text-slate-500 font-medium tracking-tight">Systematic record of all changes and actions.</p>
        </div>
      </div>

      <div className="relative border-l-2 border-slate-100 ml-3 pl-8 pb-10 flex flex-col gap-8">
        {logs.map((log) => (
          <div key={log.id} className="relative">
            {/* The dot */}
            <div className="absolute -left-[41px] top-0 w-6 h-6 rounded-full bg-white border-4 border-slate-100 flex items-center justify-center shadow-sm">
              <div className="w-1.5 h-1.5 rounded-full bg-accent-blue"></div>
            </div>

            <div className="bg-white border border-border rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 mb-2 inline-block">
                    {log.action.replace(/_/g, ' ')}
                  </span>
                  <h4 className="font-bold text-navy flex items-center gap-2">
                    {formatActionLabel(log.action)}
                  </h4>
                </div>
                <div className="text-right">
                  <div className="flex items-center justify-end gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-0.5">
                    <Calendar size={10} />
                    {new Date(log.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                  <div className="flex items-center justify-end gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                    <Clock size={10} />
                    {new Date(log.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-medium border-t border-slate-50 pt-4 mt-4">
                <div className="flex items-center gap-2.5 text-slate-600">
                  <div className="p-1.5 bg-slate-100 rounded-lg shrink-0">
                    <UserIcon size={12} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest mb-0.5">Performed By</p>
                    <p className="truncate">{log.userEmail || 'System Process'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 text-slate-600">
                  <div className="p-1.5 bg-slate-100 rounded-lg shrink-0">
                    <Info size={12} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest mb-0.5">Source IP</p>
                    <p className="truncate font-mono">{log.ipAddress || '—'}</p>
                  </div>
                </div>
              </div>

              {log.details && Object.keys(log.details).length > 0 && (
                <div className="mt-4 bg-slate-50/50 rounded-xl p-4 border border-slate-100">
                   <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest mb-3">Change Details</p>
                   <div className="grid grid-cols-1 gap-2">
                      {Object.entries(log.details as Record<string, any>).map(([key, value]) => {
                        // Skip system internal fields or large objects if needed
                        if (key === 'id' || key === 'employeeId') return null;
                        
                        return (
                          <div key={key} className="flex items-center justify-between gap-4 py-1 border-b border-slate-200/50 last:border-0">
                            <span className="text-slate-500 capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                            <span className="font-bold text-navy truncate max-w-[200px]">
                              {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                            </span>
                          </div>
                        );
                      })}
                   </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Helper to make action strings prettier
function formatActionLabel(action: string): string {
  const parts = action.split('_');
  if (parts.length < 2) return action;
  
  const verb = parts[parts.length - 1].toLowerCase();
  
  if (verb === 'created') return `New profile established`;
  if (verb === 'updated') return `Record modified`;
  if (verb === 'deleted') return `Profile removed`;
  
  return action.replace(/_/g, ' ');
}

export default EmployeeAuditTab;
