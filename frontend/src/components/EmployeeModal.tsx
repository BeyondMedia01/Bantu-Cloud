import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Dropdown } from '@/components/ui/dropdown';

interface EmployeeModalProps {
  onClose: () => void;
  onSave: (data: any) => void;
  initialData?: any;
}

const EmployeeModal: React.FC<EmployeeModalProps> = ({ onClose, onSave, initialData }) => {
  const [formData, setFormData] = useState(initialData || {
    firstName: '',
    lastName: '',
    nationalId: '',
    jobTitle: '',
    department: '',
    baseSalary: 0,
    currency: 'USD',
    medicalAid: 0,
    taxableBenefits: 0,
    necDeduction: 0,
    leaveBalance: 0,
    dateOfJoining: new Date().toISOString().split('T')[0]
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex justify-center items-center z-[100] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="employee-modal-title"
    >
      <div className="bg-primary w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border shadow-2xl p-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 id="employee-modal-title" className="text-2xl font-bold text-navy">{initialData ? 'Edit Profile' : 'New Employee'}</h2>
            <p className="text-sm text-slate-500 font-medium">Configure core details and payroll particulars.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-navy transition-colors font-bold text-xl">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {/* Section: Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="em-first-name" className="text-xs font-bold text-slate-400 uppercase tracking-wider">First Name</label>
              <input
                id="em-first-name"
                type="text"
                required
                className="w-full bg-slate-50 border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-accent-green focus:ring-2 focus:ring-accent-green/20 font-medium"
                value={formData.firstName}
                onChange={e => setFormData({ ...formData, firstName: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="em-last-name" className="text-xs font-bold text-slate-400 uppercase tracking-wider">Last Name</label>
              <input
                id="em-last-name"
                type="text"
                required
                className="w-full bg-slate-50 border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-accent-green focus:ring-2 focus:ring-accent-green/20 font-medium"
                value={formData.lastName}
                onChange={e => setFormData({ ...formData, lastName: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="em-national-id" className="text-xs font-bold text-slate-400 uppercase tracking-wider">National ID</label>
              <input
                id="em-national-id"
                type="text"
                required
                placeholder="63-123456-X-42"
                className="w-full bg-slate-50 border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-accent-green focus:ring-2 focus:ring-accent-green/20 font-medium"
                value={formData.nationalId}
                onChange={e => setFormData({ ...formData, nationalId: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="em-department" className="text-xs font-bold text-slate-400 uppercase tracking-wider">Department</label>
              <input
                id="em-department"
                type="text"
                className="w-full bg-slate-50 border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-accent-green focus:ring-2 focus:ring-accent-green/20 font-medium"
                value={formData.department}
                onChange={e => setFormData({ ...formData, department: e.target.value })}
              />
            </div>
          </div>

          {/* Section: Financials & Benefits */}
          <div className="border-t border-border pt-6 mt-2">
            <h3 className="text-sm font-bold text-navy mb-4 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-accent-green"></div>
              Earnings & Deductions
            </h3>
            
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="em-base-salary" className="text-xs font-bold text-slate-400 uppercase tracking-wider">Base Salary</label>
                <input
                  id="em-base-salary"
                  type="number"
                  step="0.01"
                  required
                  className="w-full bg-slate-50 border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-accent-green focus:ring-2 focus:ring-accent-green/20 font-bold text-navy"
                  value={formData.baseSalary}
                  onChange={e => setFormData({ ...formData, baseSalary: parseFloat(e.target.value) })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="em-currency" className="text-xs font-bold text-slate-400 uppercase tracking-wider">Currency</label>
                <Dropdown className="w-full" trigger={(isOpen) => (
                  <button type="button" className="w-full bg-slate-50 border border-border rounded-xl px-4 py-2.5 font-bold text-navy flex items-center justify-between hover:border-accent-green transition-colors">
                    <span>{formData.currency}</span>
                    <ChevronDown size={14} className={`text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                )} sections={[{ items: [
                  { label: 'USD', onClick: () => setFormData({ ...formData, currency: 'USD' }) },
                  { label: 'ZiG', onClick: () => setFormData({ ...formData, currency: 'ZiG' }) },
                ]}]} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="em-taxable-benefits" className="text-xs font-bold text-slate-400 uppercase tracking-wider text-accent-green">Tax. Benefits</label>
                <input
                   id="em-taxable-benefits"
                   type="number"
                   step="0.01"
                   placeholder="0.00"
                   className="w-full bg-emerald-50/50 border border-emerald-100 rounded-xl px-4 py-2.5 focus:outline-none focus:border-accent-green focus:ring-2 focus:ring-accent-green/20 font-bold text-accent-green"
                   value={formData.taxableBenefits}
                   onChange={e => setFormData({ ...formData, taxableBenefits: parseFloat(e.target.value) })}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="em-medical-aid" className="text-xs font-bold text-slate-400 uppercase tracking-wider">Medical Aid</label>
                <input
                   id="em-medical-aid"
                   type="number"
                   step="0.01"
                   className="w-full bg-slate-50 border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-accent-green focus:ring-2 focus:ring-accent-green/20 font-bold text-navy"
                   value={formData.medicalAid}
                   onChange={e => setFormData({ ...formData, medicalAid: parseFloat(e.target.value) })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="em-nec-deduction" className="text-xs font-bold text-slate-400 uppercase tracking-wider">NEC Deduction</label>
                <input
                   id="em-nec-deduction"
                   type="number"
                   step="0.01"
                   className="w-full bg-slate-50 border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-accent-green focus:ring-2 focus:ring-accent-green/20 font-bold text-navy"
                   value={formData.necDeduction}
                   onChange={e => setFormData({ ...formData, necDeduction: parseFloat(e.target.value) })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="em-leave-balance" className="text-xs font-bold text-slate-400 uppercase tracking-wider">Leave Balance</label>
                <input
                   id="em-leave-balance"
                   type="number"
                   step="0.5"
                   className="w-full bg-slate-50 border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-accent-green focus:ring-2 focus:ring-accent-green/20 font-bold text-navy"
                   value={formData.leaveBalance}
                   onChange={e => setFormData({ ...formData, leaveBalance: parseFloat(e.target.value) })}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-6 border-t border-border mt-2">
            <button 
              type="button" 
              onClick={onClose} 
              className="px-6 py-2.5 rounded-xl border border-border text-sm font-bold text-slate-400 hover:text-navy hover:bg-slate-50 transition-all font-inter"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="px-8 py-2.5 rounded-xl bg-brand text-navy text-sm font-bold shadow-lg hover:opacity-90 transition-all font-inter"
            >
              Save Employee
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EmployeeModal;
