import React, { useEffect, useState } from 'react';
import { Search, User, Hash, CheckCircle, Lock, Download, FileText } from 'lucide-react';
import { PayslipSummaryAPI } from '../api/client';
import ConfirmModal from '../components/common/ConfirmModal';
import { useToast } from '../context/ToastContext';

const PayslipSummaries: React.FC<{ activeCompanyId?: string | null }> = ({ activeCompanyId }) => {
  const { showToast } = useToast();
  const [summaries, setSummaries] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [finalizeTarget, setFinalizeTarget] = useState<string | null>(null);

  const fetchSummaries = async () => {
    try {
      const response = await PayslipSummaryAPI.getAll();
      setSummaries(response.data);
    } catch (error) {
      console.error('Failed to fetch payslip summaries');
    }
  };

  useEffect(() => {
    if (activeCompanyId) {
      fetchSummaries();
    }
  }, [activeCompanyId]);

  const handleFinalize = (id: string) => setFinalizeTarget(id);

  const confirmFinalize = async () => {
    if (!finalizeTarget) return;
    try {
      await PayslipSummaryAPI.update(finalizeTarget, { isFinalized: true });
      fetchSummaries();
    } catch {
      showToast('Failed to finalize payslip', 'error');
    } finally {
      setFinalizeTarget(null);
    }
  };

  const filteredSummaries = summaries.filter(s => 
    s.employee?.fullName.toLowerCase().includes(search.toLowerCase()) ||
    s.employee?.employeeID.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-8">
      {finalizeTarget && (
        <ConfirmModal
          title="Finalize Payslip"
          message="Finalizing this payslip will lock it from further edits. This action cannot be undone."
          confirmLabel="Finalize"
          onConfirm={confirmFinalize}
          onCancel={() => setFinalizeTarget(null)}
        />
      )}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-navy mb-1">Payroll Summaries</h2>
          <p className="text-slate-500 font-medium">Monthly aggregation of employee earnings, deductions, and net pay ledgers.</p>
        </div>
        <div className="flex items-center gap-3">
           <button className="bg-slate-100 text-navy px-6 py-3 rounded-[9999px] font-bold hover:bg-slate-200 transition-colors flex items-center gap-2">
            <Download size={20} /> Export All
          </button>
        </div>
      </header>

      {/* Info Stats */}
      <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6 flex gap-4 items-start">
        <div className="p-2 bg-white rounded-xl text-accent-green shadow-sm">
          <CheckCircle size={24} />
        </div>
        <div>
          <h3 className="font-bold text-navy mb-1">Payroll Finalization</h3>
          <p className="text-sm text-slate-600 leading-relaxed max-w-2xl">
            Summaries are generated after the payroll run. Once <strong>Finalized</strong>, the records are locked to prevent accidental changes to statutory submissions and bank disbursement files.
          </p>
        </div>
      </div>

      {/* Summary Table */}
      <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="p-4 px-6 border-b border-border bg-slate-50/50 flex items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search by Employee ID or Name..."
                aria-label="Search payslip summaries"
                className="w-full pl-10 pr-4 py-2 bg-white border border-border rounded-xl text-sm focus:outline-none focus:border-accent-green focus:ring-2 focus:ring-accent-green/30"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-slate-50">
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Employee / Period</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Gross (USD/ZiG)</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Deductions</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-accent-green">Total Net (USD)</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredSummaries.length > 0 ? filteredSummaries.map(s => (
                <tr key={s.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 font-bold group-hover:bg-blue-50 group-hover:text-accent-green transition-colors">
                        <User size={18} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-navy">{s.employee?.fullName}</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{new Date(s.payPeriod).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-0.5 font-mono">
                       <span className="text-sm font-bold text-navy">${s.grossUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                       <span className="text-[10px] text-slate-400">Z {s.grossZiG.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                     <div className="flex flex-col gap-0.5 font-mono">
                       <span className="text-sm font-bold text-red-500">-${s.deductionsUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                       <span className="text-[10px] text-slate-400">-Z {s.deductionsZiG.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                     <div className="flex flex-col">
                        <span className="text-sm font-black text-accent-green">${s.totalNetPayInUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        <span className="text-[9px] text-slate-400 font-bold uppercase">Rate: {s.exchangeRateUsed.toFixed(4)}</span>
                     </div>
                  </td>
                  <td className="px-6 py-4">
                    {s.isFinalized ? (
                      <div className="flex items-center gap-1.5 text-accent-green">
                        <Lock size={16} />
                        <span className="text-[10px] font-bold uppercase">Finalized</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-amber-500">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                        <span className="text-[10px] font-bold uppercase">Open</span>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                       <button className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-navy transition-colors">
                        <FileText size={16} />
                      </button>
                      {!s.isFinalized && (
                        <button 
                          onClick={() => handleFinalize(s.id)}
                          className="p-2 hover:bg-emerald-50 rounded-lg text-slate-400 hover:text-accent-green transition-colors"
                        >
                          <CheckCircle size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center text-slate-500">
                    <Hash size={48} className="mx-auto mb-4 opacity-20" />
                    <p className="italic font-medium">No payroll summaries found for this company.</p>
                  </td>
                </tr>
              )}
            </tbody>
            {filteredSummaries.length > 0 && (() => {
              const totalGrossUSD = filteredSummaries.reduce((sum, s) => sum + (s.grossUSD || 0), 0);
              const totalGrossZiG = filteredSummaries.reduce((sum, s) => sum + (s.grossZiG || 0), 0);
              const totalDeductionsUSD = filteredSummaries.reduce((sum, s) => sum + (s.deductionsUSD || 0), 0);
              const totalDeductionsZiG = filteredSummaries.reduce((sum, s) => sum + (s.deductionsZiG || 0), 0);
              const totalNetUSD = filteredSummaries.reduce((sum, s) => sum + (s.totalNetPayInUSD || 0), 0);
              return (
                <tfoot>
                  <tr className="border-t-2 border-border bg-slate-50 font-bold">
                    <td className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Total ({filteredSummaries.length} employee{filteredSummaries.length !== 1 ? 's' : ''})
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-0.5 font-mono">
                        <span className="text-sm font-bold text-navy">${totalGrossUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        <span className="text-[10px] text-slate-400">Z {totalGrossZiG.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-0.5 font-mono">
                        <span className="text-sm font-bold text-red-500">-${totalDeductionsUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        <span className="text-[10px] text-slate-400">-Z {totalDeductionsZiG.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-black text-accent-green">${totalNetUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              );
            })()}
          </table>
        </div>
      </div>
    </div>
  );
};

export default PayslipSummaries;
