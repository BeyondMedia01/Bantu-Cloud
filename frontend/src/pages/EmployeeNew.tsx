import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { EmployeeAPI, BranchAPI, DepartmentAPI, TaxTableAPI, SystemSettingsAPI } from '../api/client';
import { getActiveCompanyId } from '../lib/companyContext';

const ZIMBABWE_BANKS = [
  'Agribank (Agricultural Bank of Zimbabwe)',
  'BancABC Zimbabwe',
  'CABS (Central Africa Building Society)',
  'CBZ Bank',
  'Ecobank Zimbabwe',
  'FBC Bank',
  'First Capital Bank',
  'MetBank',
  'NMB Bank',
  "POSB (People's Own Savings Bank)",
  'Stanbic Bank Zimbabwe',
  'Standard Chartered Bank Zimbabwe',
  'Steward Bank',
  'ZB Bank',
];

const TITLES = ['Mr', 'Mrs', 'Miss', 'Ms', 'Dr', 'Prof', 'Rev'];

const EmployeeNew: React.FC = () => {
  const navigate = useNavigate();
  const [branches, setBranches] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [taxTables, setTaxTables] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    // Personal Details
    employeeCode: '', title: '', firstName: '', lastName: '', maidenName: '',
    nationality: '', idPassport: '', dateOfBirth: '', gender: '', maritalStatus: '',
    homeAddress: '', postalAddress: '',
    nextOfKinName: '', nextOfKinContact: '', socialSecurityNum: '',
    // Work Details
    startDate: '', occupation: '', position: '', departmentId: '', branchId: '',
    costCenter: '', grade: '', employmentType: 'PERMANENT',
    leaveEntitlement: '', dischargeDate: '', dischargeReason: '',
    // Pay Details
    paymentMethod: 'BANK', paymentBasis: 'MONTHLY', rateSource: 'MANUAL',
    baseRate: '', currency: 'USD', hoursPerPeriod: '', daysPerPeriod: '',
    bankAccounts: [
      { accountName: '', accountNumber: '', bankName: '', bankBranch: '', branchCode: '', splitType: 'REMAINDER', splitValue: 0, priority: 0, currency: 'USD' }
    ] as any[],
    // Tax Details
    taxDirectivePerc: '', taxDirectiveAmt: '', taxMethod: 'NON_FDS',
    taxTable: '', accumulativeSetting: 'NO', taxCredits: '',
    tin: '', motorVehicleBenefit: '', motorVehicleType: '',
    // Leave Details
    annualLeaveAccrued: '', annualLeaveTaken: '',
  });

  useEffect(() => {
    const companyId = getActiveCompanyId();
    if (companyId) {
      BranchAPI.getAll({ companyId }).then((r) => setBranches(r.data)).catch(() => {});
      DepartmentAPI.getAll({ companyId }).then((r) => setDepartments(r.data)).catch(() => {});
    }
    Promise.all([
      TaxTableAPI.getAll(),
      SystemSettingsAPI.getAll(),
    ]).then(([tt, ss]) => {
      setTaxTables(tt.data);
      const defaultSetting = (ss.data as any[])
        .filter((s) => s.settingName === 'DEFAULT_TAX_TABLE_USD' && s.isActive)
        .sort((a: any, b: any) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime())[0];
      if (defaultSetting) setForm((f) => ({ ...f, taxTable: defaultSetting.settingValue }));
    }).catch(() => {});
  }, []);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleAccountChange = (index: number, field: string, value: any) => {
    setForm(f => {
      const newAccounts = [...f.bankAccounts];
      newAccounts[index] = { ...newAccounts[index], [field]: value };
      return { ...f, bankAccounts: newAccounts };
    });
  };

  const addAccount = () => {
    setForm(f => ({
      ...f,
      bankAccounts: [...f.bankAccounts, { accountName: '', accountNumber: '', bankName: '', bankBranch: '', branchCode: '', splitType: 'FIXED', splitValue: 0, priority: f.bankAccounts.length, currency: 'USD' }]
    }));
  };

  const removeAccount = (index: number) => {
    setForm(f => ({
      ...f,
      bankAccounts: f.bankAccounts.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await EmployeeAPI.create({
        ...form,
        baseRate: parseFloat(form.baseRate),
        motorVehicleBenefit: form.motorVehicleBenefit ? parseFloat(form.motorVehicleBenefit) : undefined,
        companyId: getActiveCompanyId() ?? undefined,
        bankAccounts: form.paymentMethod === 'BANK' ? form.bankAccounts : [],
      } as any);
      navigate('/employees');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create employee');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate('/employees')} aria-label="Go back" className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold">New Employee</h1>
          <p className="text-slate-500 font-medium text-sm">Add a new employee to your company</p>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-8">

        {/* ── Personal Details ── */}
        <Section title="Personal Details">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Employee Code" required>
              <input required value={form.employeeCode} onChange={set('employeeCode')} placeholder="e.g. EMP001" />
            </Field>
            <Field label="Title">
              <select value={form.title} onChange={set('title')}>
                <option value="">— Select —</option>
                {TITLES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="First Name" required>
              <input required value={form.firstName} onChange={set('firstName')} />
            </Field>
            <Field label="Last Name" required>
              <input required value={form.lastName} onChange={set('lastName')} />
            </Field>
            <Field label="Maiden Name">
              <input value={form.maidenName} onChange={set('maidenName')} />
            </Field>
            <Field label="Nationality" required>
              <input required value={form.nationality} onChange={set('nationality')} placeholder="e.g. Zimbabwean" />
            </Field>
            <Field label="ID / Passport Number" required>
              <input required value={form.idPassport} onChange={set('idPassport')} />
            </Field>
            <Field label="Date of Birth" required>
              <input required type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} />
            </Field>
            <Field label="Gender" required>
              <select required value={form.gender} onChange={set('gender')}>
                <option value="">— Select —</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </select>
            </Field>
            <Field label="Marital Status" required>
              <select required value={form.maritalStatus} onChange={set('maritalStatus')}>
                <option value="">— Select —</option>
                <option value="SINGLE">Single</option>
                <option value="MARRIED">Married</option>
                <option value="DIVORCED">Divorced</option>
                <option value="WIDOWED">Widowed</option>
              </select>
            </Field>
            <Field label="Home Address" className="col-span-2">
              <input value={form.homeAddress} onChange={set('homeAddress')} />
            </Field>
            <Field label="Postal Address" className="col-span-2">
              <input value={form.postalAddress} onChange={set('postalAddress')} />
            </Field>
            <Field label="Next of Kin Name">
              <input value={form.nextOfKinName} onChange={set('nextOfKinName')} />
            </Field>
            <Field label="Next of Kin Contact">
              <input value={form.nextOfKinContact} onChange={set('nextOfKinContact')} />
            </Field>
            <Field label="Social Security Number">
              <input value={form.socialSecurityNum} onChange={set('socialSecurityNum')} />
            </Field>
          </div>
        </Section>

        {/* ── Work Details ── */}
        <Section title="Work Details">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Start Date" required>
              <input required type="date" value={form.startDate} onChange={set('startDate')} />
            </Field>
            <Field label="Occupation">
              <input value={form.occupation} onChange={set('occupation')} placeholder="e.g. Software Engineer" />
            </Field>
            <Field label="Position / Job Title" required>
              <input required value={form.position} onChange={set('position')} />
            </Field>
            <Field label="Department">
              <select value={form.departmentId} onChange={set('departmentId')}>
                <option value="">— None —</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="Branch">
              <select value={form.branchId} onChange={set('branchId')}>
                <option value="">— None —</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
            <Field label="Cost Center">
              <input value={form.costCenter} onChange={set('costCenter')} />
            </Field>
            <Field label="Grade">
              <input value={form.grade} onChange={set('grade')} placeholder="e.g. Grade 5" />
            </Field>
            <Field label="Employment Type" required>
              <select required value={form.employmentType} onChange={set('employmentType')}>
                <option value="PERMANENT">Permanent</option>
                <option value="CONTRACT">Contract</option>
                <option value="TEMPORARY">Temporary</option>
                <option value="PART_TIME">Part Time</option>
              </select>
            </Field>
            <Field label="Leave Entitlement (days)">
              <input type="number" step="0.5" value={form.leaveEntitlement} onChange={set('leaveEntitlement')} placeholder="e.g. 30" />
            </Field>
            <Field label="Discharge Date">
              <input type="date" value={form.dischargeDate} onChange={set('dischargeDate')} />
            </Field>
            <Field label="Discharge Reason" className="col-span-2">
              <input value={form.dischargeReason} onChange={set('dischargeReason')} />
            </Field>
          </div>
        </Section>

        {/* ── Pay Details ── */}
        <Section title="Pay Details & Bank Splitting">
          <div className="grid grid-cols-2 gap-4 mb-6">
            <Field label="Payment Method" required>
              <select required value={form.paymentMethod} onChange={(e) => {
                const method = e.target.value;
                setForm(f => ({
                  ...f,
                  paymentMethod: method,
                  bankAccounts: method === 'CASH' ? [] : f.bankAccounts,
                }));
              }}>
                <option value="BANK">Bank</option>
                <option value="CASH">Cash</option>
              </select>
            </Field>
            <Field label="Payment Basis" required>
              <select required value={form.paymentBasis} onChange={set('paymentBasis')}>
                <option value="MONTHLY">Monthly</option>
                <option value="DAILY">Daily</option>
                <option value="HOURLY">Hourly</option>
              </select>
            </Field>
            <Field label="Rate Source" required>
              <select required value={form.rateSource} onChange={set('rateSource')}>
                <option value="MANUAL">Manual</option>
                <option value="NEC_GRADE">NEC Grade</option>
              </select>
            </Field>
            <Field label="Base Rate" required>
              <input required type="number" step="0.01" min="0" value={form.baseRate} onChange={set('baseRate')} placeholder="0.00" />
            </Field>
            <Field label="Currency" required>
              <select required value={form.currency} onChange={set('currency')}>
                <option value="USD">USD</option>
                <option value="ZiG">ZiG</option>
              </select>
            </Field>
            <Field label="Hours per Period">
              <input type="number" step="0.5" value={form.hoursPerPeriod} onChange={set('hoursPerPeriod')} placeholder="e.g. 176" />
            </Field>
            <Field label="Days per Period">
              <input type="number" step="0.5" value={form.daysPerPeriod} onChange={set('daysPerPeriod')} placeholder="e.g. 22" />
            </Field>
          </div>

          {form.paymentMethod === 'BANK' && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between border-b pb-2 mb-2">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Bank Accounts & Splitting</h4>
                <button type="button" onClick={addAccount} className="text-[10px] font-bold text-accent-blue hover:underline uppercase">
                  + Add Split Account
                </button>
              </div>

              <datalist id="zw-banks">
                {ZIMBABWE_BANKS.map(b => <option key={b} value={b} />)}
              </datalist>

              {form.bankAccounts.map((acc, index) => (
                <div key={index} className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 relative group transition-all hover:bg-slate-50">
                  {form.bankAccounts.length > 1 && (
                    <button 
                      type="button" 
                      onClick={() => removeAccount(index)}
                      className="absolute -right-2 -top-2 bg-white border border-red-100 shadow-sm rounded-full p-1 text-red-400 hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
                    >
                      <ArrowLeft size={14} className="rotate-45" />
                    </button>
                  )}
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Bank Name</label>
                      <input
                        required
                        list="zw-banks"
                        value={acc.bankName}
                        onChange={(e) => handleAccountChange(index, 'bankName', e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-border rounded-lg text-sm font-medium focus:ring-2 focus:ring-accent-blue/10 focus:border-accent-blue outline-none transition-all"
                        placeholder="Search or type bank name"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Account Number</label>
                      <input 
                        required 
                        value={acc.accountNumber} 
                        onChange={(e) => handleAccountChange(index, 'accountNumber', e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-border rounded-lg text-sm font-medium focus:ring-2 focus:ring-accent-blue/10 focus:border-accent-blue outline-none transition-all"
                        placeholder="000000000"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Account Name</label>
                      <input 
                        value={acc.accountName} 
                        onChange={(e) => handleAccountChange(index, 'accountName', e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-border rounded-lg text-sm font-medium focus:ring-2 focus:ring-accent-blue/10 focus:border-accent-blue outline-none transition-all"
                        placeholder="Holder Name"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Split Mode</label>
                      <select
                        value={acc.splitType}
                        onChange={(e) => handleAccountChange(index, 'splitType', e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-border rounded-lg text-sm font-bold text-navy focus:ring-2 focus:ring-accent-blue/10 focus:border-accent-blue outline-none transition-all"
                      >
                        <option value="REMAINDER">Remainder</option>
                        <option value="FIXED">Fixed Amount</option>
                        <option value="PERCENTAGE">Percentage (%)</option>
                      </select>
                      <p className="text-[10px] text-slate-400 leading-snug">
                        {acc.splitType === 'REMAINDER' && 'Receives everything left after other splits.'}
                        {acc.splitType === 'FIXED' && 'A fixed currency amount is paid to this account.'}
                        {acc.splitType === 'PERCENTAGE' && 'A percentage of net pay is paid to this account.'}
                      </p>
                    </div>

                    {acc.splitType !== 'REMAINDER' && (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Split Value</label>
                        <input 
                          type="number" 
                          step="0.01" 
                          required
                          value={acc.splitValue} 
                          onChange={(e) => handleAccountChange(index, 'splitValue', e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-border rounded-lg text-sm font-bold text-accent-blue focus:ring-2 focus:ring-accent-blue/10 focus:border-accent-blue outline-none transition-all"
                        />
                      </div>
                    )}

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Account Currency</label>
                      <select 
                        value={acc.currency} 
                        onChange={(e) => handleAccountChange(index, 'currency', e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-border rounded-lg text-sm font-medium focus:ring-2 focus:ring-accent-blue/10 focus:border-accent-blue outline-none transition-all"
                      >
                        <option value="USD">USD</option>
                        <option value="ZiG">ZiG</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ── Tax Details ── */}
        <Section title="Tax Details">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Tax Directive %">
              <input type="number" step="0.01" min="0" max="100" value={form.taxDirectivePerc} onChange={set('taxDirectivePerc')} placeholder="0.00" />
            </Field>
            <Field label="Tax Directive Amount">
              <input type="number" step="0.01" min="0" value={form.taxDirectiveAmt} onChange={set('taxDirectiveAmt')} placeholder="0.00" />
            </Field>
            <Field label="Tax Method" required>
              <select required value={form.taxMethod} onChange={set('taxMethod')}>
                <option value="NON_FDS">Non-FDS</option>
                <option value="FDS_AVERAGE">FDS Average</option>
                <option value="FDS_FORECASTING">FDS Forecasting</option>
              </select>
              <p className="text-[10px] text-slate-400 mt-1 leading-snug">
                {form.taxMethod === 'NON_FDS' && 'Standard PAYE — tax calculated monthly on current earnings.'}
                {form.taxMethod === 'FDS_AVERAGE' && 'Fixed-date scheme using average of year-to-date earnings.'}
                {form.taxMethod === 'FDS_FORECASTING' && 'Fixed-date scheme projecting annual income from current pay.'}
              </p>
            </Field>
            <Field label="Tax Table" required>
              <select required value={form.taxTable} onChange={set('taxTable')}>
                <option value="">— Select tax table —</option>
                {taxTables.map((t: any) => (
                  <option key={t.id} value={t.name}>
                    {t.name} ({t.currency}){t.isActive ? ' ★' : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Accumulative Setting" required>
              <select required value={form.accumulativeSetting} onChange={set('accumulativeSetting')}>
                <option value="NO">No</option>
                <option value="YES">Yes</option>
              </select>
            </Field>
            <Field label="Tax Credits">
              <input type="number" step="0.01" min="0" value={form.taxCredits} onChange={set('taxCredits')} placeholder="0.00" />
            </Field>
            <Field label="TIN (Tax Identification Number)">
              <input value={form.tin} onChange={set('tin')} />
            </Field>
            <Field label="Motor Vehicle Benefit">
              <input type="number" step="0.01" min="0" value={form.motorVehicleBenefit} onChange={set('motorVehicleBenefit')} placeholder="0.00" />
            </Field>
            <Field label="Motor Vehicle Type">
              <input value={form.motorVehicleType} onChange={set('motorVehicleType')} placeholder="e.g. Saloon" />
            </Field>
          </div>
        </Section>

        {/* ── Leave Details ── */}
        <Section title="Leave Details">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Annual Leave Accrued (days)">
              <input type="number" step="0.5" min="0" value={form.annualLeaveAccrued} onChange={set('annualLeaveAccrued')} placeholder="0" />
            </Field>
            <Field label="Annual Leave Taken (days)">
              <input type="number" step="0.5" min="0" value={form.annualLeaveTaken} onChange={set('annualLeaveTaken')} placeholder="0" />
            </Field>
          </div>
        </Section>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 bg-btn-primary text-navy px-8 py-3 rounded-full font-bold shadow hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            <Save size={16} /> {loading ? 'Saving…' : 'Save Employee'}
          </button>
          <button type="button" onClick={() => navigate('/employees')} className="px-6 py-3 rounded-full border border-border font-bold text-slate-500 hover:bg-slate-50">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-primary rounded-2xl border border-border p-6 shadow-sm">
    <h3 className="font-bold mb-4 text-sm uppercase tracking-wider text-slate-400">{title}</h3>
    {children}
  </div>
);

const Field: React.FC<{ label: string; required?: boolean; className?: string; children: React.ReactElement }> = ({ label, required, className, children }) => {
  const child = React.cloneElement(children as React.ReactElement<any>, {
    className: 'w-full px-4 py-3 bg-slate-50 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue transition-all font-medium text-sm',
  });
  return (
    <div className={`flex flex-col gap-1.5 ${className || ''}`}>
      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
        {label}{required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {child}
    </div>
  );
};

export default EmployeeNew;
