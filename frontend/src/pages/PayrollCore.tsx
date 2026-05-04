
import React, { useEffect, useState } from 'react';
import { Plus, Edit, Trash, Search, Database, Coins, XCircle } from 'lucide-react';
import { PayrollCoreAPI } from '../api/client';
import { getAvatarGradient } from '@/lib/avatarGradient';

const PayrollCore: React.FC<{ activeCompanyId?: string | null }> = ({ activeCompanyId }) => {
  const [cores, setCores] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchCores = async () => {
    try {
      setFetchError(null);
      const response = await PayrollCoreAPI.getAll();
      setCores(response.data);
    } catch (error) {
      console.error('Failed to fetch PayrollCore entries');
      setFetchError('Failed to load foundational payroll records. Please try again.');
    }
  };

  useEffect(() => {
    if (activeCompanyId) {
      fetchCores();
    }
  }, [activeCompanyId]);

  const filteredCores = cores.filter(core => 
    core.fullName.toLowerCase().includes(search.toLowerCase()) ||
    core.employeeID.includes(search)
  );

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-navy mb-1">Payroll Core</h2>
          <p className="text-muted-foreground font-medium">Foundational multi-currency data and currency split configurations.</p>
        </div>
        <button className="bg-brand text-navy px-4 py-2 rounded-full font-bold shadow-lg hover:opacity-90 transition-opacity flex items-center gap-1.5">
          <Plus size={20} /> Add Foundational Entry
        </button>
      </header>

      {fetchError && (
        <div className="bg-red-50 text-red-600 border border-red-200 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
          <XCircle size={20} className="text-red-500 shrink-0" />
          <p className="text-sm font-medium">{fetchError}</p>
        </div>
      )}

      {/* Stats Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-primary rounded-2xl border border-border p-6 shadow-sm flex items-center justify-between">
           <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-50 text-accent-green rounded-2xl flex items-center justify-center">
                 <Database size={24} />
              </div>
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Base Records</p>
                <p className="text-xl font-bold">{cores.length}</p>
              </div>
           </div>
        </div>
        <div className="bg-primary rounded-2xl border border-border p-6 shadow-sm flex items-center justify-between">
           <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-50 text-accent-green rounded-2xl flex items-center justify-center">
                 <Coins size={24} />
              </div>
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Multi-Currency</p>
                <p className="text-xl font-bold">ZiG / USD Active</p>
              </div>
           </div>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="p-4 px-6 border-b border-border bg-muted/30 flex items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input 
                type="text" 
                placeholder="Search by ID or Name..." 
                className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:border-accent-green"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Employee</th>
                <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Salary (ZiG)</th>
                <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Currency Split</th>
                <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Payments</th>
                <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredCores.length > 0 ? filteredCores.map(core => (
                <tr key={core.id} className="hover:bg-muted/30 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs uppercase text-white"
                        style={getAvatarGradient(core.fullName)}>
                        {core.fullName[0]}
                      </div>
                      <div>
                        <p className="text-sm font-bold">{core.fullName}</p>
                        <p className="text-xs text-muted-foreground font-semibold">{core.employeeID} • {core.jobTitle}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-bold">{core.basicSalaryZiG.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Base ZiG</p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-1">
                       {Object.entries(core.preferredCurrencySplit || {}).map(([curr, val]: any) => (
                         <span key={curr} className="px-2 py-0.5 rounded-lg bg-blue-50 text-accent-green text-[10px] font-bold border border-blue-100 italic">
                            {curr}: {val * 100}%
                         </span>
                       ))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                     <p className="text-xs font-bold text-navy">{core.paymentFrequency}</p>
                     <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Freq</p>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                       <button className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-navy transition-colors">
                        <Edit size={16} />
                      </button>
                      <button className="p-2 hover:bg-red-50 rounded-lg text-muted-foreground hover:text-red-500 transition-colors">
                        <Trash size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground font-medium italic">
                    No foundational records found.
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

export default PayrollCore;
