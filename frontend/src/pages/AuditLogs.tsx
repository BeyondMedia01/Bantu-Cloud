import React, { useEffect, useState } from 'react';
import { Search, History, ArrowRight, ShieldCheck, Download, Filter } from 'lucide-react';
import { AuditLogAPI } from '../api/client';

const AuditLogs: React.FC<{ activeCompanyId?: string | null }> = ({ activeCompanyId }) => {
  const [logs, setLogs] = useState<any[]>([]);
  const [search, setSearch] = useState('');

  const fetchLogs = async () => {
    try {
      const response = await AuditLogAPI.getAll();
      setLogs(response.data);
    } catch (error) {
      console.error('Failed to fetch audit logs');
    }
  };

  useEffect(() => {
    if (activeCompanyId) {
      fetchLogs();
    }
  }, [activeCompanyId]);

  const filteredLogs = logs.filter(l => 
    l.employee?.fullName.toLowerCase().includes(search.toLowerCase()) ||
    l.triggeredBy.toLowerCase().includes(search.toLowerCase()) ||
    l.notes?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-navy mb-1 flex items-center gap-3">
            <History size={32} className="text-accent-blue" />
            Currency Forensic Log
          </h2>
          <p className="text-slate-500 font-medium font-sans">Immutable audit trail of every currency conversion event in the system.</p>
        </div>
        <div className="flex items-center gap-3">
           <button className="bg-btn-primary text-navy px-6 py-3 rounded-[9999px] font-bold shadow-lg hover:opacity-90 transition-opacity flex items-center gap-2">
            <Download size={20} /> Export Evidence
          </button>
        </div>
      </header>

      {/* Info Stats */}
      <div className="bg-slate-900 rounded-3xl p-8 text-white relative overflow-hidden shadow-2xl">
        <div className="relative z-10 flex flex-col md:flex-row gap-8 items-center">
          <div className="flex-1">
            <div className="flex items-center gap-2 text-accent-blue font-bold tracking-widest text-[10px] uppercase mb-4">
              <ShieldCheck size={16} /> Forensic Integrity Active
            </div>
            <h3 className="text-2xl font-bold mb-3 tracking-tight">Multi-Currency Verification</h3>
            <p className="text-slate-400 leading-relaxed font-medium text-sm max-w-xl">
              This log captures conversions at the <strong>moment of transaction</strong>. It serves as the primary evidence layer for resolving disputes regarding tax calculations, net pay variances, and statutory reporting under multi-currency regulation.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 w-full md:w-auto">
            <div className="bg-white/5 border border-white/10 p-5 rounded-2xl backdrop-blur-sm">
              <p className="text-slate-400 text-[10px] font-bold uppercase mb-1">Total Logs</p>
              <p className="text-2xl font-black text-white">{logs.length}</p>
            </div>
            <div className="bg-white/5 border border-white/10 p-5 rounded-2xl backdrop-blur-sm">
              <p className="text-slate-400 text-[10px] font-bold uppercase mb-1">Precision</p>
              <p className="text-2xl font-black text-accent-blue font-mono">15dp</p>
            </div>
          </div>
        </div>
        {/* Decorative background element */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-accent-blue/10 blur-[100px] -mr-32 -mt-32 rounded-full" />
      </div>

      {/* Audit Table */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/50 overflow-hidden font-sans">
        <div className="p-6 border-b border-slate-50 flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search logs by Employee, Trigger, or Notes..." 
                className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-medium focus:ring-2 focus:ring-accent-blue/20 transition-all outline-none"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <button className="p-3 bg-slate-50 text-slate-400 rounded-2xl hover:bg-slate-100 transition-colors">
              <Filter size={20} />
            </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-50 bg-slate-50/30">
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Timestamp / Event</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Conversion Flow</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Application Rate</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Source / Result</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Source Module</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredLogs.length > 0 ? filteredLogs.map(l => (
                <tr key={l.id} className="hover:bg-slate-50/80 transition-all duration-300 group">
                  <td className="px-8 py-6">
                    <div className="flex flex-col gap-1">
                      <p className="text-sm font-bold text-navy tracking-tight">{new Date(l.timestamp).toLocaleString()}</p>
                      <div className="flex items-center gap-1.5">
                         <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest ${l.conversionType === 'MANUAL_OVERRIDE' ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
                            {l.conversionType.replace('_', ' ')}
                         </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-3">
                       <span className="text-xs font-black text-navy px-2 py-1 bg-white border border-slate-100 rounded-lg shadow-sm">{l.sourceCurrency}</span>
                       <ArrowRight size={14} className="text-slate-300" />
                       <span className="text-xs font-black text-accent-blue px-2 py-1 bg-blue-50 border border-blue-100 rounded-lg shadow-sm">{l.targetCurrency}</span>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <p className="text-sm font-black font-mono text-slate-600">{l.conversionRateUsed.toFixed(15)}</p>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex flex-col gap-0.5">
                       <p className="text-xs font-bold text-slate-400">Orig: {l.sourceCurrency === 'ZiG' ? 'Z' : '$'}{l.sourceAmount.toLocaleString()}</p>
                       <p className="text-sm font-black text-navy">Res: {l.targetCurrency === 'ZiG' ? 'Z' : '$'}{l.convertedAmount.toLocaleString()}</p>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex flex-col">
                       <p className="text-xs font-bold text-navy tracking-tight">{l.triggeredBy}</p>
                       <p className="text-[10px] text-slate-400 font-medium truncate max-w-[150px] italic">"{l.notes || 'No meta notes'}"</p>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} className="px-8 py-32 text-center text-slate-300">
                    <History size={64} className="mx-auto mb-6 opacity-5 rotate-12" />
                    <p className="text-lg font-bold tracking-tight mb-1">Investigation Clear</p>
                    <p className="text-sm font-medium">No conversion events have been recorded for this organization yet.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AuditLogs;
