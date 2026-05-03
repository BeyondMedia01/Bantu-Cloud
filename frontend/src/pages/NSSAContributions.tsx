import React, { useEffect, useState } from 'react';
import { Search, User, Hash, CheckCircle, ShieldCheck, Download, FileText, AlertCircle, Trash, Settings, X, Save, Info } from 'lucide-react';
import { NSSAContributionAPI, NSSASettingsAPI, type NSSASettings } from '../api/client';
import ConfirmModal from '../components/common/ConfirmModal';
import { useToast } from '../context/ToastContext';

const NSSAContributions: React.FC<{ activeCompanyId?: string | null }> = ({ activeCompanyId }) => {
  const { showToast } = useToast();
  const [contributions, setContributions] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [settings, setSettings] = useState<NSSASettings>({
    employeeRate: 3.5,
    employerRate: 3.5,
    ceilingUSD: 700,
    wcifRate: 0.01,
    employeeRateZIG: 3.5,
    employerRateZIG: 3.5,
    ceilingZIG: 18000,
  });
  const [savingSettings, setSavingSettings] = useState(false);

  const fetchSettings = async () => {
    try {
      const res = await NSSASettingsAPI.get();
      setSettings(res.data);
    } catch (err) {
      console.error('Failed to fetch NSSA settings');
    }
  };

  const fetchContributions = async () => {
    try {
      const response = await NSSAContributionAPI.getAll();
      setContributions(response.data);
    } catch (error) {
      console.error('Failed to fetch NSSA contributions');
    }
  };

  useEffect(() => {
    if (activeCompanyId) {
      fetchContributions();
      fetchSettings();
    }
  }, [activeCompanyId]);

  const handleToggleSubmission = async (id: string, currentStatus: boolean) => {
    try {
      await NSSAContributionAPI.update(id, { submittedToNSSA: !currentStatus });
      fetchContributions();
    } catch (error) {
      showToast('Failed to update submission status', 'error');
    }
  };

  const handleDelete = (id: string) => setDeleteTarget(id);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await NSSAContributionAPI.delete(deleteTarget);
      fetchContributions();
    } catch {
      showToast('Failed to delete NSSA record', 'error');
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await NSSASettingsAPI.update(settings);
      setShowSettings(false);
      fetchContributions();
    } catch (err) {
      showToast('Failed to save NSSA settings', 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  const filteredContributions = contributions.filter(c => 
    c.employee?.fullName.toLowerCase().includes(search.toLowerCase()) ||
    c.employee?.employeeCode?.toLowerCase().includes(search.toLowerCase()) ||
    c.employee?.employeeID?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-8 relative">
      {deleteTarget && (
        <ConfirmModal
          title="Delete NSSA Record"
          message="Are you sure you want to delete this NSSA contribution record?"
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-navy mb-1">NSSA Contributions</h2>
          <p className="text-slate-500 font-medium">Monthly statutory pension tracking and compliance ledger.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowSettings(true)}
            className="bg-white border border-border text-navy px-4 py-2 rounded-full font-bold hover:bg-slate-50 transition-colors flex items-center gap-1.5"
          >
            <Settings size={20} /> Configure NSSA
          </button>
          <button className="bg-slate-100 text-navy px-4 py-2 rounded-full font-bold hover:bg-slate-200 transition-colors flex items-center gap-1.5">
            <Download size={20} /> Export NSSA Return
          </button>
        </div>
      </header>

      {/* Info Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-navy rounded-2xl p-6 text-white flex gap-4 items-start shadow-xl border-t border-white/10">
          <div className="p-2 bg-white/10 rounded-xl">
            <ShieldCheck size={24} className="text-accent-green" />
          </div>
          <div>
            <h3 className="font-bold text-lg mb-1 tracking-tight">Capped Compliance</h3>
            <p className="text-sm text-slate-500 leading-relaxed font-medium">
              Pensionable earnings are automatically capped at regulatory thresholds (USD {settings.ceilingUSD.toLocaleString()}). All calculations follow the {settings.employeeRate}% + {settings.employerRate}% split.
            </p>
          </div>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6 flex gap-4 items-start">
          <div className="p-2 bg-white rounded-xl text-accent-green shadow-sm">
            <FileText size={24} />
          </div>
          <div>
            <h3 className="font-bold text-navy mb-1">Audit Readiness</h3>
            <p className="text-sm text-slate-600 leading-relaxed font-medium">
              Every entry captures the exact currency split used for payment, ensuring transparent audits during NSSA site visits or regulatory reviews.
            </p>
          </div>
        </div>
      </div>

      {/* Contribution Table */}
      <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="p-4 px-6 border-b border-border bg-slate-50/50 flex items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search by Employee..."
                aria-label="Search contributions"
                className="w-full pl-10 pr-4 py-2 bg-white border border-border rounded-xl text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left font-sans">
            <thead>
              <tr className="border-b border-border bg-slate-50">
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Employee / Period</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Pensionable (USD)</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Contribution (EE/ER)</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Limit Status</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Submission</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredContributions.length > 0 ? filteredContributions.map(c => (
                <tr key={c.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
                        <User size={18} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-navy leading-none mb-1">{c.employee?.fullName}</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{new Date(c.payPeriod).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-bold font-mono text-navy">${c.pensionableEarningsUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">EE ({settings.employeeRate}%)</p>
                        <p className="text-sm font-bold text-navy font-mono">${c.employeeContributionUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                      </div>
                      <div className="h-8 w-px bg-slate-100" />
                      <div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">ER ({settings.employerRate}%)</p>
                        <p className="text-sm font-bold text-navy font-mono">${c.employerContributionUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {c.isWithinLimit ? (
                      <span className="text-[10px] font-bold px-2 py-1 bg-emerald-50 text-accent-green rounded-md uppercase">Normal</span>
                    ) : (
                      <div className="flex items-center gap-1.5 text-amber-500">
                        <AlertCircle size={14} />
                        <span className="text-[10px] font-bold uppercase tracking-tight">At Ceiling</span>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <button 
                      onClick={() => handleToggleSubmission(c.id, c.submittedToNSSA)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all ${c.submittedToNSSA ? 'bg-emerald-500 text-white font-bold' : 'bg-slate-100 text-slate-400 font-bold hover:bg-slate-200'}`}
                    >
                      {c.submittedToNSSA ? <CheckCircle size={14} /> : <div className="w-3.5 h-3.5 border-2 border-slate-300 rounded-full" />}
                      <span className="text-[10px] uppercase tracking-wider">{c.submittedToNSSA ? 'Submitted' : 'Pending'}</span>
                    </button>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => handleDelete(c.id)}
                      className="p-2 hover:bg-red-50 rounded-lg text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash size={16} />
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center text-slate-500 font-medium">
                    <Hash size={48} className="mx-auto mb-4 opacity-10" />
                    <p className="italic">No pension contribution records found for this period.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Settings Modal (Conditional) */}
      {showSettings && (
        <div className="fixed inset-0 bg-navy/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-[32px] w-full max-w-lg shadow-2xl border border-white/20 overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-8 pb-0 flex justify-between items-start">
              <div>
                <div className="p-3 bg-accent-green/10 rounded-2xl text-accent-green w-fit mb-4">
                  <Settings size={24} />
                </div>
                <h3 className="text-2xl font-black text-navy tracking-tight">NSSA Configuration</h3>
                <p className="text-sm text-slate-500 font-medium">Global statutory rates and contribution ceilings.</p>
              </div>
              <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="p-8 flex flex-col gap-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Employee Rate (%)</label>
                  <input 
                    type="number" step="0.01" required
                    className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl font-bold text-navy outline-none focus:ring-2 focus:ring-accent-green/10 focus:border-accent-green transition-all"
                    value={settings.employeeRate}
                    onChange={e => setSettings({...settings, employeeRate: parseFloat(e.target.value)})}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Employer Rate (%)</label>
                  <input 
                    type="number" step="0.01" required
                    className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl font-bold text-navy outline-none focus:ring-2 focus:ring-accent-green/10 focus:border-accent-green transition-all"
                    value={settings.employerRate}
                    onChange={e => setSettings({...settings, employerRate: parseFloat(e.target.value)})}
                  />
                </div>
                <div className="flex flex-col gap-2 col-span-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Insurable Ceiling (USD)</label>
                  <input 
                    type="number" step="0.01" required
                    className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl font-bold text-accent-green text-lg outline-none focus:ring-2 focus:ring-accent-green/10 focus:border-accent-green transition-all"
                    value={settings.ceilingUSD}
                    onChange={e => setSettings({...settings, ceilingUSD: parseFloat(e.target.value)})}
                  />
                </div>
                <div className="flex flex-col gap-2 col-span-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">WCIF Rate (%)</label>
                  <input 
                    type="number" step="0.01" required
                    className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl font-bold text-navy outline-none focus:ring-2 focus:ring-accent-green/10 focus:border-accent-green transition-all"
                    value={settings.wcifRate}
                    onChange={e => setSettings({...settings, wcifRate: parseFloat(e.target.value)})}
                  />
                </div>
              </div>

              <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex gap-3 items-start">
                <Info size={18} className="text-amber-500 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed text-amber-800 font-medium">
                  <p className="font-bold mb-1">Regulatory Notice:</p>
                  <p>Ensuring the correct ceiling for USD payrolls is critical for ZIMRA/NSSA compliance. Current NSSA ceilings may fluctuate based on the Total Monthly Insurable Earnings (TMIE) formula or specific Statutory Instruments.</p>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  type="submit" 
                  disabled={savingSettings}
                  className="flex-1 bg-navy text-white py-4 rounded-2xl font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-lg"
                >
                  {savingSettings ? 'Applying...' : <><Save size={18} /> Apply Global Updates</>}
                </button>
                <button 
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="px-6 py-4 bg-slate-100 rounded-2xl font-bold text-slate-500 hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default NSSAContributions;
