import React, { useState } from 'react';
import { Calculator, X, Home, GraduationCap, ArrowRight } from 'lucide-react';

interface BenefitCalculatorProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (amount: number) => void;
  baseSalary?: number;
}

const BenefitCalculator: React.FC<BenefitCalculatorProps> = ({ isOpen, onClose, onApply, baseSalary = 0 }) => {
  const [type, setType] = useState<'HOUSING' | 'SCHOOL'>('HOUSING');
  
  // Housing States
  const [housingType, setHousingType] = useState<'OWNED' | 'RENTED'>('OWNED');
  const [marketValue, setMarketValue] = useState<string>('');
  const [employeePayment, setEmployeePayment] = useState<string>('');
  
  // School Fees States
  const [feesAmount, setFeesAmount] = useState<string>('');

  if (!isOpen) return null;

  const calculateHousing = () => {
    if (housingType === 'OWNED') {
      return baseSalary * 0.07;
    } else {
      const val = parseFloat(marketValue) || 0;
      const pay = parseFloat(employeePayment) || 0;
      return Math.max(0, val - pay);
    }
  };

  const calculateSchool = () => {
    return parseFloat(feesAmount) || 0;
  };

  const result = type === 'HOUSING' ? calculateHousing() : calculateSchool();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-navy/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-white/20 overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-border flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent-blue/10 rounded-xl text-accent-blue">
              <Calculator size={20} />
            </div>
            <div>
              <h3 className="font-bold text-navy">ZIMRA Benefit Calculator</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Statutory Calculation Helper</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          {/* Type Selector */}
          <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl mb-6">
            <button
              onClick={() => setType('HOUSING')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-all ${
                type === 'HOUSING' ? 'bg-white text-navy shadow-sm' : 'text-slate-500 hover:text-navy'
              }`}
            >
              <Home size={16} /> Housing
            </button>
            <button
              onClick={() => setType('SCHOOL')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-all ${
                type === 'SCHOOL' ? 'bg-white text-navy shadow-sm' : 'text-slate-500 hover:text-navy'
              }`}
            >
              <GraduationCap size={16} /> School Fees
            </button>
          </div>

          {type === 'HOUSING' ? (
            <div className="space-y-4 animate-in slide-in-from-left-2 duration-300">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Housing Type</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setHousingType('OWNED')}
                    className={`flex-1 py-3 px-4 rounded-2xl border-2 transition-all text-sm font-bold ${
                      housingType === 'OWNED' ? 'border-accent-blue bg-accent-blue/5 text-accent-blue' : 'border-border text-slate-400'
                    }`}
                  >
                    Employer Owned (7% Rule)
                  </button>
                  <button
                    onClick={() => setHousingType('RENTED')}
                    className={`flex-1 py-3 px-4 rounded-2xl border-2 transition-all text-sm font-bold ${
                      housingType === 'RENTED' ? 'border-accent-blue bg-accent-blue/5 text-accent-blue' : 'border-border text-slate-400'
                    }`}
                  >
                    Rented / Lease
                  </button>
                </div>
              </div>

              {housingType === 'OWNED' ? (
                <div className="p-4 bg-slate-50 rounded-2xl border border-border">
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Under ZIMRA rules, free/subsidized housing in employer-owned property is taxed at <span className="font-bold text-navy">7% of gross salary</span>.
                  </p>
                  <div className="mt-3 flex justify-between items-center">
                    <span className="text-xs font-medium text-slate-400">Current Salary:</span>
                    <span className="text-sm font-bold text-navy">${baseSalary.toLocaleString()}</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase">Market Rental / Cost to Employer</label>
                    <input
                      type="number"
                      className="w-full mt-1 px-4 py-3 bg-slate-50 border border-border rounded-xl font-bold text-navy"
                      placeholder="0.00"
                      value={marketValue}
                      onChange={(e) => setMarketValue(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase">Amount Paid by Employee (if any)</label>
                    <input
                      type="number"
                      className="w-full mt-1 px-4 py-3 bg-slate-50 border border-border rounded-xl font-bold text-navy"
                      placeholder="0.00"
                      value={employeePayment}
                      onChange={(e) => setEmployeePayment(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4 animate-in slide-in-from-right-2 duration-300">
              <div className="p-4 bg-blue-50 text-blue-700 rounded-2xl text-xs leading-relaxed font-medium">
                School fees paid by the employer for an employee's children are a taxable benefit. The full amount is added to taxable income.
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Total Fees Paid</label>
                <input
                  type="number"
                  className="w-full mt-1 px-4 py-3 bg-slate-50 border border-border rounded-xl font-bold text-navy text-lg"
                  placeholder="0.00"
                  value={feesAmount}
                  onChange={(e) => setFeesAmount(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Result Footer */}
          <div className="mt-8 pt-6 border-t border-border flex flex-col gap-4">
            <div className="flex justify-between items-end">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Calculated Benefit</p>
                <p className="text-3xl font-black text-navy mt-1">${result.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <button
                onClick={() => onApply(result)}
                className="bg-accent-blue text-white px-8 py-3 rounded-2xl font-bold shadow-lg shadow-accent-blue/20 hover:scale-105 transition-all flex items-center gap-2"
              >
                Apply <ArrowRight size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BenefitCalculator;
