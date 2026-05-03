import { useState } from 'react';
import { Settings as SettingsIcon, DollarSign, Calculator, Percent, FileText, BarChart3, ShieldCheck, History, ChevronRight, Download } from 'lucide-react';
import CurrencyRates from './CurrencyRates';
import TaxConfiguration from './TaxConfiguration';
import PayTransactions from './PayTransactions';
import PayslipTransactions from './PayslipTransactions';
import PayslipSummaries from './PayslipSummaries';
import NSSAContributions from './NSSAContributions';
import AuditLogs from './AuditLogs';
import PayrollCore from './PayrollCore';
import PayslipExports from './PayslipExports';
import SystemSettings from './SystemSettings';
import PayrollUsers from './PayrollUsers';
import PayrollLogs from './PayrollLogs';

interface SettingsProps {
  activeCompanyId: string | null;
}

type SettingsSection = 'rates' | 'tax' | 'pay-codes' | 'ledger' | 'summaries' | 'nssa' | 'audit' | 'core' | 'exports' | 'globals' | 'users' | 'logs';

const Settings = ({ activeCompanyId }: SettingsProps) => {
  const [activeTab, setActiveTab] = useState<SettingsSection>('rates');

  const menuItems = [
    { id: 'rates', label: 'Currency Rates', icon: DollarSign, group: 'Configuration' },
    { id: 'tax', label: 'Tax Configuration', icon: Percent, group: 'Configuration' },
    { id: 'pay-codes', label: 'Pay Codes', icon: Calculator, group: 'Configuration' },
    { id: 'ledger', label: 'Payroll Ledger', icon: FileText, group: 'Payroll Assets' },
    { id: 'summaries', label: 'Payroll Summaries', icon: BarChart3, group: 'Payroll Assets' },
    { id: 'nssa', label: 'NSSA Compliance', icon: ShieldCheck, group: 'Compliance' },
    { id: 'audit', label: 'Forensic Audit', icon: History, group: 'Compliance' },
    { id: 'exports', label: 'Batch Exports', icon: Download, group: 'Compliance' },
    { id: 'logs', label: 'Payroll Logs', icon: FileText, group: 'Compliance' },
    { id: 'users', label: 'Access Control', icon: ShieldCheck, group: 'Configuration' },
    { id: 'globals', label: 'Global Configurations', icon: SettingsIcon, group: 'Configuration' },
  ];

  return (
    <div className="flex flex-col lg:flex-row gap-8 items-start">
      {/* Settings Side Nav */}
      <aside className="w-full lg:w-80 bg-white rounded-3xl border border-border shadow-sm overflow-hidden shrink-0">
        <div className="p-6 border-b border-border bg-slate-50/50">
          <div className="flex items-center gap-3 text-navy">
            <div className="p-2 bg-brand text-navy rounded-xl shadow-lg">
              <SettingsIcon size={20} />
            </div>
            <h2 className="font-bold text-lg tracking-tight">System Settings</h2>
          </div>
        </div>
        
        <div className="p-4 space-y-6">
          {['Configuration', 'Payroll Assets', 'Compliance'].map(group => (
            <div key={group}>
              <h3 className="px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">{group}</h3>
              <div className="space-y-1">
                {menuItems.filter(item => item.group === group).map(item => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id as SettingsSection)}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all group ${activeTab === item.id ? 'bg-brand text-navy shadow-xl shadow-navy/20' : 'text-slate-500 hover:bg-slate-50 font-medium'}`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon size={18} className={activeTab === item.id ? 'text-accent-blue' : 'group-hover:text-navy transition-colors'} />
                        <span className="text-sm font-bold">{item.label}</span>
                      </div>
                      <ChevronRight size={14} className={activeTab === item.id ? 'opacity-50' : 'opacity-0'} />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Settings Content Area */}
      <main className="flex-1 w-full min-w-0">
        <div className="bg-primary rounded-3xl min-h-[600px]">
          {activeTab === 'rates' && <CurrencyRates activeCompanyId={activeCompanyId} />}
          {activeTab === 'tax' && <TaxConfiguration activeCompanyId={activeCompanyId} />}
          {activeTab === 'pay-codes' && <PayTransactions activeCompanyId={activeCompanyId} />}
          {activeTab === 'ledger' && <PayslipTransactions activeCompanyId={activeCompanyId} />}
          {activeTab === 'summaries' && <PayslipSummaries activeCompanyId={activeCompanyId} />}
          {activeTab === 'nssa' && <NSSAContributions activeCompanyId={activeCompanyId} />}
          { activeTab === 'audit' && <AuditLogs activeCompanyId={activeCompanyId} />}
          { activeTab === 'core' && <PayrollCore activeCompanyId={activeCompanyId} />}
          { activeTab === 'exports' && <PayslipExports activeCompanyId={activeCompanyId} />}
          { activeTab === 'globals' && <SystemSettings activeCompanyId={activeCompanyId} />}
          { activeTab === 'users' && <PayrollUsers activeCompanyId={activeCompanyId} />}
          { activeTab === 'logs' && <PayrollLogs activeCompanyId={activeCompanyId} />}
        </div>
      </main>
    </div>
  );
};

export default Settings;
