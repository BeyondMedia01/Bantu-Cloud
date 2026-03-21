import React, { useState, useEffect } from 'react';
import { useToast } from '../context/ToastContext';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Loader, FileText, Upload, Trash2, Download } from 'lucide-react';
import { EmployeeAPI, BranchAPI, DepartmentAPI, NecTableAPI, TaxTableAPI, SystemSettingsAPI, DocumentsAPI } from '../api/client';
import { getActiveCompanyId } from '../lib/companyContext';
import SalaryStructurePanel from '../components/employees/SalaryStructurePanel';
import EmployeeAuditTab from '../components/EmployeeAuditTab';

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

const EmployeeEdit: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [branches, setBranches] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [necGrades, setNecGrades] = useState<any[]>([]);
  const [taxTables, setTaxTables] = useState<any[]>([]);
  const [fetching, setFetching] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { showToast } = useToast();

  const [form, setForm] = useState<Record<string, any>>({
    // Personal
    employeeCode: '', title: '', firstName: '', lastName: '', maidenName: '',
    nationality: '', idPassport: '', dateOfBirth: '', gender: '', maritalStatus: '',
    homeAddress: '', postalAddress: '',
    nextOfKinName: '', nextOfKinContact: '', socialSecurityNum: '', pensionNumber: '',
    // Work
    startDate: '', occupation: '', position: '', departmentId: '', branchId: '',
    costCenter: '', grade: '', employmentType: 'PERMANENT',
    leaveEntitlement: '', dischargeDate: '', dischargeReason: '',
    // Pay
    paymentMethod: 'BANK', paymentBasis: 'MONTHLY', rateSource: 'MANUAL',
    baseRate: '', currency: 'USD', hoursPerPeriod: '', daysPerPeriod: '',
    bankName: '', bankBranch: '', accountNumber: '',
    // Tax
    taxDirectivePerc: '', taxDirectiveAmt: '', taxMethod: 'NON_FDS',
    taxTable: '', accumulativeSetting: 'NO', taxCredits: '',
    tin: '', motorVehicleBenefit: '', motorVehicleType: '',
    // Leave
    annualLeaveAccrued: '', annualLeaveTaken: '',
    // NEC / Split currency
    necGradeId: '', splitUsdPercent: '',
    bankAccounts: [] as any[],
  });
  const [activeTab, setActiveTab] = useState<'PERSONAL' | 'WORK' | 'PAY' | 'TAX' | 'LEAVE' | 'DOCUMENTS' | 'AUDIT'>('PERSONAL');
  const [documents, setDocuments] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const companyId = getActiveCompanyId();
    Promise.all([
      EmployeeAPI.getById(id!),
      companyId ? BranchAPI.getAll({ companyId }) : Promise.resolve({ data: [] }),
      companyId ? DepartmentAPI.getAll({ companyId }) : Promise.resolve({ data: [] }),
      NecTableAPI.getAll(),
      TaxTableAPI.getAll(),
      SystemSettingsAPI.getAll(),
    ]).then(([emp, br, dep, nec, tt, ss]) => {
      setTaxTables(tt.data);
      const e = emp.data;
      const empCurrency = e.currency || 'USD';
      const tableNames = new Set((tt.data as any[]).map((t: any) => t.name));
      const settingName = `DEFAULT_TAX_TABLE_${empCurrency}`;
      const defaultSetting = (ss.data as any[])
        .filter((s) => s.settingName === settingName && s.isActive)
        .sort((a: any, b: any) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime())[0];
      const resolvedTaxTable = (e.taxTable && tableNames.has(e.taxTable))
        ? e.taxTable
        : (defaultSetting?.settingValue || '');
      const d = (v: any) => (v ? String(v).slice(0, 10) : '');

      // Flatten all grades from all NEC tables for the dropdown
      const allGrades: any[] = [];
      (nec.data as any[]).forEach((table: any) => {
        (table.grades ?? []).forEach((g: any) => allGrades.push({ ...g, tableName: table.name }));
      });
      setNecGrades(allGrades);

      setForm({
        employeeCode:       e.employeeCode || '',
        title:              e.title || '',
        firstName:          e.firstName || '',
        lastName:           e.lastName || '',
        maidenName:         e.maidenName || '',
        nationality:        e.nationality || '',
        idPassport:         e.idPassport || '',
        dateOfBirth:        d(e.dateOfBirth),
        gender:             e.gender || '',
        maritalStatus:      e.maritalStatus || '',
        homeAddress:        e.homeAddress || '',
        postalAddress:      e.postalAddress || '',
        nextOfKinName:      e.nextOfKinName || '',
        nextOfKinContact:   e.nextOfKinContact || '',
        socialSecurityNum:  e.socialSecurityNum || '',
        pensionNumber:      e.pensionNumber || '',
        startDate:          d(e.startDate),
        occupation:         e.occupation || '',
        position:           e.position || '',
        departmentId:       e.departmentId || '',
        branchId:           e.branchId || '',
        costCenter:         e.costCenter || '',
        grade:              e.grade?.name || '',
        employmentType:     e.employmentType || 'PERMANENT',
        leaveEntitlement:   e.leaveEntitlement ?? '',
        dischargeDate:      d(e.dischargeDate),
        dischargeReason:    e.dischargeReason || '',
        paymentMethod:      e.paymentMethod || 'BANK',
        paymentBasis:       e.paymentBasis || 'MONTHLY',
        rateSource:         e.rateSource || 'MANUAL',
        baseRate:           e.baseRate ?? '',
        currency:           e.currency || 'USD',
        hoursPerPeriod:     e.hoursPerPeriod ?? '',
        daysPerPeriod:      e.daysPerPeriod ?? '',
        bankName:           e.bankName || '',
        bankBranch:         e.bankBranch || '',
        accountNumber:      e.accountNumber || '',
        taxDirectivePerc:   e.taxDirectivePerc ?? '',
        taxDirectiveAmt:    e.taxDirectiveAmt ?? '',
        taxMethod:          e.taxMethod || 'NON_FDS',
        taxTable:           resolvedTaxTable,
        accumulativeSetting: e.accumulativeSetting || 'NO',
        taxCredits:         e.taxCredits ?? '',
        tin:                e.tin || '',
        motorVehicleBenefit: e.motorVehicleBenefit ?? '',
        motorVehicleType:   e.motorVehicleType || '',
        annualLeaveAccrued: e.leaveBalance ?? '',
        annualLeaveTaken:   e.leaveTaken ?? '',
        necGradeId:         e.necGradeId || '',
        splitUsdPercent:    e.splitUsdPercent ?? '',
        bankAccounts:       e.bankAccounts?.length ? e.bankAccounts : [
          { accountName: '', accountNumber: '', bankName: '', bankBranch: '', branchCode: '', splitType: 'REMAINDER', splitValue: 0, priority: 0, currency: e.currency || 'USD' }
        ],
      });
      setBranches(br.data);
      setDepartments(dep.data);
      loadDocuments();
    }).catch(() => setError('Failed to load employee')).finally(() => setFetching(false));
  }, [id]);

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
      bankAccounts: [...f.bankAccounts, { accountName: '', accountNumber: '', bankName: '', bankBranch: '', branchCode: '', splitType: 'FIXED', splitValue: 0, priority: f.bankAccounts.length, currency: f.currency || 'USD' }]
    }));
  };

  const removeAccount = (index: number) => {
    setForm(f => ({
      ...f,
      bankAccounts: f.bankAccounts.filter((_: any, i: number) => i !== index)
    }));
  };

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await EmployeeAPI.update(id!, {
        ...form,
        baseRate: form.baseRate ? parseFloat(form.baseRate) : undefined,
        motorVehicleBenefit: form.motorVehicleBenefit ? parseFloat(form.motorVehicleBenefit) : undefined,
        necGradeId: form.necGradeId || null,
        splitUsdPercent: form.splitUsdPercent !== '' ? parseFloat(form.splitUsdPercent) : null,
        bankAccounts: form.paymentMethod === 'BANK' ? form.bankAccounts : [],
      } as any);
      navigate('/employees');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update employee');
    } finally {
      setLoading(false);
    }
  };

  const loadDocuments = async () => {
    try {
      const res = await DocumentsAPI.getByEmployee(id!);
      setDocuments(res.data);
    } catch (err) {
      console.error('Failed to load documents');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const type = window.prompt('Document Type (ID, CONTRACT, MEDICAL, OTHER)?', 'OTHER') || 'OTHER';
    const name = window.prompt('Document Name?', file.name) || file.name;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('employeeId', id!);
    formData.append('name', name);
    formData.append('type', type.toUpperCase());

    setUploading(true);
    try {
      await DocumentsAPI.upload(formData);
      loadDocuments();
      showToast('Document uploaded successfully', 'success');
    } catch (err) {
      showToast('Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const deleteDocument = async (docId: string) => {
    if (!window.confirm('Delete this document?')) return;
    try {
      await DocumentsAPI.delete(docId);
      loadDocuments();
      showToast('Document deleted', 'success');
    } catch (err) {
      showToast('Delete failed', 'error');
    }
  };

  if (fetching) return (
    <div className="flex items-center justify-center h-64 text-slate-400">
      <Loader size={24} className="animate-spin" />
    </div>
  );

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate('/employees')} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold">Edit Employee</h1>
          <p className="text-slate-500 font-medium text-sm">{form.firstName} {form.lastName}</p>
        </div>
      </div>

      {error && <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium">{error}</div>}

      <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl mb-8 w-fit">
        {[
          { id: 'PERSONAL', label: 'Personal' },
          { id: 'WORK', label: 'Work' },
          { id: 'PAY', label: 'Pay' },
          { id: 'TAX', label: 'Tax' },
          { id: 'LEAVE', label: 'Stats' },
          { id: 'DOCUMENTS', label: 'Documents' },
          { id: 'AUDIT', label: 'Audit' },
        ].map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id as any)}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === t.id ? 'bg-white text-navy shadow-sm' : 'text-slate-500 hover:text-navy'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-8">

        {activeTab === 'PERSONAL' && (
          <Section title="Personal Details">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Employee Code" required>
              <input required value={form.employeeCode} onChange={set('employeeCode')} />
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
              <input required value={form.nationality} onChange={set('nationality')} />
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
            <Field label="Pension Member Number">
              <input value={form.pensionNumber} onChange={set('pensionNumber')} />
            </Field>
          </div>
        </Section>
        )}

        {activeTab === 'WORK' && (
        <Section title="Work Details">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Start Date" required>
              <input required type="date" value={form.startDate} onChange={set('startDate')} />
            </Field>
            <Field label="Occupation">
              <input value={form.occupation} onChange={set('occupation')} />
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
              <input value={form.grade} onChange={set('grade')} />
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
              <input type="number" step="0.5" value={form.leaveEntitlement} onChange={set('leaveEntitlement')} />
            </Field>
            <Field label="Discharge Date">
              <input type="date" value={form.dischargeDate} onChange={set('dischargeDate')} />
            </Field>
            <Field label="Discharge Reason" className="col-span-2">
              <input value={form.dischargeReason} onChange={set('dischargeReason')} />
            </Field>
          </div>
        </Section>
        )}

        {activeTab === 'PAY' && (
        <Section title="Pay Details & Bank Splitting">
          <div className="grid grid-cols-2 gap-4 mb-6">
            <Field label="Payment Method" required>
              <select required value={form.paymentMethod} onChange={set('paymentMethod')}>
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
            {form.rateSource === 'NEC_GRADE' && (
              <Field label="NEC Grade">
                <select value={form.necGradeId} onChange={set('necGradeId')}>
                  <option value="">— Select grade —</option>
                  {necGrades.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.gradeCode}{g.description ? ` — ${g.description}` : ''} ({g.tableName})
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Base Rate" required>
              <input required type="number" step="0.01" min="0" value={form.baseRate} onChange={set('baseRate')} />
            </Field>
            <Field label="Currency" required>
              <select required value={form.currency} onChange={set('currency')}>
                <option value="USD">USD</option>
                <option value="ZiG">ZiG</option>
              </select>
            </Field>
            <Field label="Hours per Period">
              <input type="number" step="0.5" value={form.hoursPerPeriod} onChange={set('hoursPerPeriod')} />
            </Field>
            <Field label="Days per Period">
              <input type="number" step="0.5" value={form.daysPerPeriod} onChange={set('daysPerPeriod')} />
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

              {form.bankAccounts.map((acc: any, index: number) => (
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
                      <select 
                        required 
                        value={acc.bankName} 
                        onChange={(e) => handleAccountChange(index, 'bankName', e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-border rounded-lg text-sm font-medium focus:ring-2 focus:ring-accent-blue/10 focus:border-accent-blue outline-none transition-all"
                      >
                        <option value="">Select Bank</option>
                        {ZIMBABWE_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
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
        )}

        {activeTab === 'TAX' && (
        <Section title="Tax Details">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Tax Directive %">
              <input type="number" step="0.01" min="0" max="100" value={form.taxDirectivePerc} onChange={set('taxDirectivePerc')} />
            </Field>
            <Field label="Tax Directive Amount">
              <input type="number" step="0.01" min="0" value={form.taxDirectiveAmt} onChange={set('taxDirectiveAmt')} />
            </Field>
            <Field label="Tax Method" required>
              <select required value={form.taxMethod} onChange={set('taxMethod')}>
                <option value="NON_FDS">Non-FDS</option>
                <option value="FDS_AVERAGE">FDS Average</option>
                <option value="FDS_FORECASTING">FDS Forecasting</option>
              </select>
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
              <input type="number" step="0.01" min="0" value={form.taxCredits} onChange={set('taxCredits')} />
            </Field>
            <Field label="TIN (Tax Identification Number)">
              <input value={form.tin} onChange={set('tin')} />
            </Field>
            <Field label="Motor Vehicle Benefit">
              <input type="number" step="0.01" min="0" value={form.motorVehicleBenefit} onChange={set('motorVehicleBenefit')} />
            </Field>
            <Field label="Motor Vehicle Type">
              <input value={form.motorVehicleType} onChange={set('motorVehicleType')} />
            </Field>
          </div>
        </Section>
        )}

        {activeTab === 'LEAVE' && (
        <Section title="Leave Details">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Annual Leave Accrued (days)">
              <input type="number" step="0.5" min="0" value={form.annualLeaveAccrued} onChange={set('annualLeaveAccrued')} />
            </Field>
            <Field label="Annual Leave Taken (days)">
              <input type="number" step="0.5" min="0" value={form.annualLeaveTaken} onChange={set('annualLeaveTaken')} />
            </Field>
          </div>
        </Section>
        )}

        {activeTab === 'DOCUMENTS' && (
        <Section title="Employee Documents">
          <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center mb-4">
              <p className="text-xs text-slate-500 max-w-xs font-medium">Upload ID documents, contracts, medical certificates, etc.</p>
              <label className="cursor-pointer bg-accent-blue text-white px-4 py-2 rounded-xl text-xs font-bold hover:opacity-90 transition-opacity flex items-center gap-2">
                <Upload size={14} /> {uploading ? 'Uploading...' : 'Upload New'}
                <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {documents.length === 0 ? (
                <div className="py-12 border-2 border-dashed border-slate-100 rounded-2xl flex flex-col items-center justify-center text-slate-300">
                  <FileText size={40} className="mb-2 opacity-20" />
                  <p className="text-sm font-bold">No documents uploaded</p>
                </div>
              ) : documents.map(doc => (
                <div key={doc.id} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl group hover:border-accent-blue/30 transition-all">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-white rounded-xl shadow-sm group-hover:bg-accent-blue group-hover:text-white transition-all">
                      <FileText size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-navy">{doc.name}</p>
                        <span className="px-1.5 py-0.5 bg-slate-200 text-slate-500 rounded text-[9px] font-black uppercase tracking-wider">{doc.type}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        {new Date(doc.createdAt).toLocaleDateString()} · {(doc.size / 1024).toFixed(0)} KB
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <a 
                      href={doc.fileUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="p-2 hover:bg-white rounded-lg text-slate-400 hover:text-accent-blue transition-all shadow-sm"
                      title="View/Download"
                    >
                      <Download size={14} />
                    </a>
                    <button 
                      type="button" 
                      onClick={() => deleteDocument(doc.id)}
                      className="p-2 hover:bg-white rounded-lg text-slate-400 hover:text-red-500 transition-all shadow-sm"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Section>
        )}

        {activeTab === 'AUDIT' && id && (
          <EmployeeAuditTab employeeId={id} />
        )}

        {activeTab !== 'DOCUMENTS' && activeTab !== 'AUDIT' && (
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 bg-btn-primary text-navy px-8 py-3 rounded-full font-bold shadow hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              <Save size={16} /> {loading ? 'Saving…' : 'Save Changes'}
            </button>
            <button type="button" onClick={() => navigate('/employees')} className="px-6 py-3 rounded-full border border-border font-bold text-slate-500 hover:bg-slate-50">
              Cancel
            </button>
          </div>
        )}
      </form>

      {/* Salary structure panel — outside the form so its own sub-forms don't conflict */}
      {id && <SalaryStructurePanel empId={id} />}
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

export default EmployeeEdit;
