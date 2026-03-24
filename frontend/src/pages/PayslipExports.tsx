import React, { useEffect, useState } from 'react';
import { Search, Download, ExternalLink, ShieldCheck, Banknote, FileType, CheckCircle2, XCircle, Clock, Info } from 'lucide-react';
import { PayslipExportAPI } from '../api/client';

const PayslipExports: React.FC<{ activeCompanyId?: string | null }> = ({ activeCompanyId }) => {
  const [exports, setExports] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchExports = async () => {
    try {
      setFetchError(null);
      const response = await PayslipExportAPI.getAll();
      setExports(response.data);
    } catch (error) {
      console.error('Failed to fetch export records');
      setFetchError('Failed to load export records. Please try again later.');
    }
  };

  useEffect(() => {
    if (activeCompanyId) {
      fetchExports();
    }
  }, [activeCompanyId]);

  const filteredExports = exports.filter(exp => {
    const matchesSearch = exp.employee?.fullName.toLowerCase().includes(search.toLowerCase()) || 
                         exp.exportedBy?.toLowerCase().includes(search.toLowerCase());
    const matchesType = filterType === 'ALL' || exp.exportType === filterType;
    return matchesSearch && matchesType;
  });

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'EXPORTED': return 'bg-emerald-50 text-accent-green border-emerald-100';
      case 'FAILED': return 'bg-red-50 text-red-500 border-red-100';
      default: return 'bg-amber-50 text-amber-500 border-amber-100';
    }
  };

  const getExportIcon = (type: string) => {
    switch (type) {
        case 'BANK_TRANSFER': return <Banknote size={18} />;
        case 'NSSA_REPORT': return <ShieldCheck size={18} />;
        case 'ZIMRA_REPORT': return <FileType size={18} />;
        default: return <ExternalLink size={18} />;
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-navy mb-1">Batch Exports</h2>
          <p className="text-slate-500 font-medium">Compliance ledger for bank transfers and statutory report metadata.</p>
        </div>
        <div className="flex items-center gap-3">
           <button className="bg-btn-primary text-navy px-6 py-3 rounded-[9999px] font-bold shadow-lg hover:opacity-90 transition-opacity flex items-center gap-2">
            <Download size={20} /> Generate New Batch
          </button>
        </div>
      </header>

      {/* Audit Info Card */}
      <div className="bg-slate-900 rounded-3xl p-6 text-white flex gap-6 items-center shadow-xl shadow-slate-200">
        <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center border border-white/10">
          <ShieldCheck size={32} className="text-accent-blue" />
        </div>
        <div>
          <h3 className="text-lg font-bold mb-1">Export Integrity & Chain of Custody</h3>
          <p className="text-sm text-slate-400 leading-relaxed max-w-2xl">
            This log serves as an immutable record of all payroll data transmitted outside the system. It tracks the specific destination, format, and the internal authority responsible for each compliance submission.
          </p>
        </div>
      </div>

      {fetchError && (
        <div className="bg-red-50 text-red-600 border border-red-200 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
          <XCircle size={20} className="text-red-500 shrink-0" />
          <p className="text-sm font-medium">{fetchError}</p>
        </div>
      )}

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row gap-4">
         <div className="relative flex-1">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search by Employee or Submitter..." 
              className="w-full pl-10 pr-4 py-3 bg-primary border border-border rounded-2xl text-sm focus:outline-none focus:border-accent-blue shadow-sm"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
         </div>
         <select 
          className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm font-bold text-navy focus:outline-none focus:border-accent-blue shadow-sm min-w-[200px]"
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
         >
           <option value="ALL">All Export Types</option>
           <option value="BANK_TRANSFER">Bank Transfers</option>
           <option value="NSSA_REPORT">NSSA Reports</option>
           <option value="ZIMRA_REPORT">ZIMRA Reports</option>
           <option value="PAYSLIP_PDF">Payslip PDFs</option>
         </select>
      </div>

      {/* Export Ledger Table */}
      <div className="bg-primary rounded-3xl border border-border overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-border">
                <th className="px-6 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Type / Details</th>
                <th className="px-6 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Employee</th>
                <th className="px-6 py-5 text-xs font-black text-slate-400 uppercase tracking-widest text-right">Net Totals</th>
                <th className="px-6 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Format & Status</th>
                <th className="px-6 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Audit Trail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredExports.length > 0 ? filteredExports.map(exp => (
                <tr key={exp.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-4">
                       <div className={`p-2.5 rounded-xl border ${getStatusStyle(exp.exportStatus)}`}>
                          {getExportIcon(exp.exportType)}
                       </div>
                       <div>
                          <p className="text-sm font-black text-navy">{exp.exportType.replace('_', ' ')}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Period: {new Date(exp.payPeriod).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</p>
                       </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div>
                      <p className="text-sm font-bold text-navy">{exp.employee?.fullName}</p>
                      <p className="text-[10px] text-slate-400 font-bold">{exp.employee?.employeeID}</p>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <div className="flex flex-col gap-0.5 font-mono">
                       {exp.netPayUSD > 0 && <span className="text-sm font-black text-navy">${exp.netPayUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>}
                       {exp.netPayZiG > 0 && <span className="text-xs text-slate-400 font-bold">Z {exp.netPayZiG.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>}
                    </div>
                  </td>
                  <td className="px-6 py-5">
                     <div className="flex flex-col gap-2">
                        <span className="px-2 py-0.5 bg-slate-100 rounded-lg text-[10px] font-black text-slate-400 uppercase self-start border border-slate-200">{exp.exportFormat}</span>
                        <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase px-2 py-0.5 rounded-lg border self-start ${getStatusStyle(exp.exportStatus)}`}>
                           {exp.exportStatus === 'EXPORTED' ? <CheckCircle2 size={12} /> : exp.exportStatus === 'FAILED' ? <XCircle size={12} /> : <Clock size={12} />}
                           {exp.exportStatus}
                        </div>
                     </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex flex-col gap-1">
                       <p className="text-[10px] font-bold text-navy">By: {exp.exportedBy || 'System'}</p>
                       <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tight">On: {exp.exportDate ? new Date(exp.exportDate).toLocaleDateString() : 'Pending'}</p>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                   <td colSpan={5} className="px-6 py-24 text-center">
                      <div className="flex flex-col items-center gap-4 text-slate-300">
                         <div className="p-4 bg-slate-50 rounded-full border border-border border-dashed">
                            <ExternalLink size={48} className="opacity-20" />
                         </div>
                         <p className="italic font-medium">No export records found in the ledger.</p>
                      </div>
                   </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      <div className="flex items-center gap-3 p-4 bg-blue-50/50 rounded-2xl border border-blue-100/50 text-slate-500">
         <Info size={16} className="text-accent-blue" />
         <p className="text-xs font-medium italic">All bank account metadata attached to these exports are point-in-time snapshots extracted from PayrollCore records.</p>
      </div>
    </div>
  );
};

export default PayslipExports;
