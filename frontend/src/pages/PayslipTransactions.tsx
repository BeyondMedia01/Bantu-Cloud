import React, { useEffect, useState } from 'react';
import { Plus, Search, Calendar, User, Hash, Info, Trash } from 'lucide-react';
import { PayslipTransactionAPI } from '../api/client';
import ConfirmModal from '../components/common/ConfirmModal';
import { useToast } from '../context/ToastContext';

const PayslipTransactions: React.FC<{ activeCompanyId?: string | null }> = ({ activeCompanyId }) => {
  const { showToast } = useToast();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const fetchTransactions = async () => {
    try {
      const response = await PayslipTransactionAPI.getAll();
      setTransactions(response.data);
    } catch (error) {
      console.error('Failed to fetch payslip transactions');
    }
  };

  useEffect(() => {
    if (activeCompanyId) {
      fetchTransactions();
    }
  }, [activeCompanyId]);

  const handleDelete = (id: string) => setDeleteTarget(id);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await PayslipTransactionAPI.delete(deleteTarget);
      fetchTransactions();
    } catch {
      showToast('Failed to delete transaction', 'error');
    } finally {
      setDeleteTarget(null);
    }
  };

  const filteredTransactions = transactions.filter(t => 
    t.employee?.fullName.toLowerCase().includes(search.toLowerCase()) ||
    t.transaction?.description.toLowerCase().includes(search.toLowerCase()) ||
    t.transactionCode.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-8">
      {deleteTarget && (
        <ConfirmModal
          title="Delete Transaction"
          message="Delete this transaction ledger entry? This action cannot be undone."
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-navy mb-1">Transaction Ledger</h2>
          <p className="text-slate-500 font-medium">Detailed audit trail of individual earnings and deductions per employee.</p>
        </div>
        <button className="bg-btn-primary text-navy px-6 py-3 rounded-[9999px] font-bold shadow-lg hover:opacity-90 transition-opacity flex items-center gap-2">
          <Plus size={20} /> Add Entry
        </button>
      </header>

      {/* Info Stats */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 flex gap-4 items-start">
        <div className="p-2 bg-white rounded-xl text-accent-blue shadow-sm">
          <Info size={24} />
        </div>
        <div>
          <h3 className="font-bold text-navy mb-1">Ledger Integrity</h3>
          <p className="text-sm text-slate-600 leading-relaxed max-w-2xl">
            This ledger captures the <strong>point-in-time exchange rate</strong> for every transaction. This ensures that even if rates fluctuate later, the historical payroll records remain audit-compliant and mathematically consistent.
          </p>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="p-4 px-6 border-b border-border bg-slate-50/50 flex items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search by Employee or Code..." 
                className="w-full pl-10 pr-4 py-2 bg-white border border-border rounded-xl text-sm focus:outline-none focus:border-accent-blue"
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
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Transaction Code</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Orig. Amount</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Rate (to USD)</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">USD Value</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredTransactions.length > 0 ? filteredTransactions.map(t => (
                <tr key={t.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                        <User size={18} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-navy">{t.employee?.fullName}</p>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold uppercase">
                          <Calendar size={12} />
                          {new Date(t.payPeriod).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-md self-start ${t.transaction?.type === 'EARNING' ? 'bg-emerald-50 text-accent-green' : 'bg-red-50 text-red-500'}`}>
                        {t.transactionCode}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium mt-1">
                        {t.description || t.transaction?.description || '—'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-bold text-navy">
                      {t.currencyCode === 'ZiG' ? 'Z' : '$'}{t.amountOriginal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">{t.currencyCode}</span>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-slate-500 font-mono">
                    {t.rateToUSD.toFixed(6)}
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-bold text-accent-blue">
                      ${t.amountInUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                    {t.isManual && <span className="text-[9px] bg-slate-100 px-1 rounded text-slate-400 uppercase font-bold">Manual</span>}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => handleDelete(t.id)}
                      className="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash size={16} />
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center text-slate-300">
                    <Hash size={48} className="mx-auto mb-4 opacity-20" />
                    <p className="italic font-medium">No transactions recorded in the ledger yet.</p>
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

export default PayslipTransactions;
