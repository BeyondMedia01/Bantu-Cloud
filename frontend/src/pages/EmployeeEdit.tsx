import React, { useState, useEffect } from 'react';
import { useToast } from '../context/ToastContext';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Loader, FileText, Upload, Trash2, Download, ChevronDown } from 'lucide-react';
import { Dropdown } from '@/components/ui/dropdown';
import { EmployeeAPI, BranchAPI, DepartmentAPI, NecTableAPI, TaxTableAPI, SystemSettingsAPI, DocumentsAPI } from '../api/client';
import type { Branch, Department } from '../types/common';
import type { NecGrade, TaxTable, EmployeeDocument as Document } from '../types/domain';
import { Field } from '../components/common/Field';
import ConfirmModal from '../components/common/ConfirmModal';
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

const AFRICAN_NATIONALITIES = [
  'Zimbabwean', 'South African', 'Zambian', 'Botswana', 'Malawian',
  'Mozambican', 'Namibian', 'Kenyan', 'Nigerian', 'Ghanaian', 'Other'
];

const TITLES = ['Mr', 'Mrs', 'Miss', 'Ms', 'Dr', 'Prof', 'Rev'];

const EmployeeEdit: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [necGrades, setNecGrades] = useState<NecGrade[]>([]);
  const [taxTables, setTaxTables] = useState<TaxTable[]>([]);
  const [fetching, setFetching] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { showToast } = useToast();

  const [form, setForm] = useState<Record<string, any>>({
    // Personal
    employeeCode: '', title: '', firstName: '', lastName: '', maidenName: '',
    nationality: 'Zimbabwean', nationalId: '', passportNumber: '', email: '', phone: '', dateOfBirth: '', gender: '', maritalStatus: '',
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
    splitZigMode: 'NONE', splitZigValue: '',
    bankAccounts: [] as any[],
  });
  const [activeTab, setActiveTab] = useState<'PERSONAL' | 'WORK' | 'PAY' | 'TAX' | 'LEAVE' | 'DOCUMENTS' | 'AUDIT'>('PERSONAL');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [uploading, setUploading] = useState(false);
  const [docUploadFile, setDocUploadFile] = useState<File | null>(null);
  const [docForm, setDocForm] = useState({ type: 'OTHER', name: '' });
  const [deleteDocTarget, setDeleteDocTarget] = useState<string | null>(null);

  useEffect(() => {
    const companyId = getActiveCompanyId();
    Promise.all([
      EmployeeAPI.getById(id!),
      BranchAPI.getAll(companyId ? { companyId } : {}),
      DepartmentAPI.getAll(companyId ? { companyId } : {}),
      NecTableAPI.getAll(),
      TaxTableAPI.getAll(),
      SystemSettingsAPI.getAll(),
    ]).then(([emp, br, dep, nec, tt, ss]) => {
      setTaxTables(tt.data);
      const e = emp.data;
      const empCurrency = e.currency || 'USD';
      const tableNames = new Set((tt.data as TaxTable[]).map((t) => t.name));
      const settingName = `DEFAULT_TAX_TABLE_${empCurrency}`;
      const defaultSetting = (ss.data as { settingName: string; isActive: boolean; effectiveFrom: string; settingValue: string }[])
        .filter((s) => s.settingName === settingName && s.isActive)
        .sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime())[0];
      const resolvedTaxTable = (e.taxTable && tableNames.has(e.taxTable))
        ? e.taxTable
        : (defaultSetting?.settingValue || '');
      const d = (v: unknown) => (v ? String(v).slice(0, 10) : '');

      // Flatten all grades from all NEC tables for the dropdown
      const allGrades: NecGrade[] = [];
      (nec.data as { name: string; grades?: NecGrade[] }[]).forEach((table) => {
        (table.grades ?? []).forEach((g) => allGrades.push({ ...g, tableName: table.name }));
      });
      setNecGrades(allGrades);

      setForm({
        employeeCode:       e.employeeCode || '',
        title:              e.title || '',
        firstName:          e.firstName || '',
        lastName:           e.lastName || '',
        maidenName:         e.maidenName || '',
        nationality:        e.nationality || 'Zimbabwean',
        nationalId:         e.nationalId || '',
        passportNumber:     e.passportNumber || '',
        email:              e.email || '',
        phone:              e.phone || '',
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
        splitZigMode:       e.splitZigMode || 'NONE',
        splitZigValue:      e.splitZigValue ?? '',
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

  const handleAccountChange = (index: number, field: string, value: string | number) => {
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
      bankAccounts: f.bankAccounts.filter((_: unknown, i: number) => i !== index)
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
        splitZigMode: form.splitZigMode || 'NONE',
        splitZigValue: form.splitZigValue !== '' ? parseFloat(form.splitZigValue) : null,
        bankAccounts: form.paymentMethod === 'BANK' ? form.bankAccounts : [],
      } as any);
      navigate('/employees');
    } catch (err) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to update employee');
    } finally {
      setLoading(false);
    }
  };

  const loadDocuments = async () => {
    try {
      const res = await DocumentsAPI.getByEmployee(id!);
      setDocuments(res.data);
    } catch (err) {
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDocForm({ type: 'OTHER', name: file.name });
    setDocUploadFile(file);
    e.target.value = '';
  };

  const deleteDocument = (docId: string) => setDeleteDocTarget(docId);

  const confirmDeleteDocument = async () => {
    if (!deleteDocTarget) return;
    try {
      await DocumentsAPI.delete(deleteDocTarget);
      loadDocuments();
      showToast('Document deleted', 'success');
    } catch {
      showToast('Delete failed', 'error');
    } finally {
      setDeleteDocTarget(null);
    }
  };

  if (fetching) return (
    <div className="flex items-center justify-center h-64 text-muted-foreground">
      <Loader size={24} className="animate-spin" />
    </div>
  );

  return (
    <div className="max-w-3xl">
      {docUploadFile && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-navy mb-5">Upload Document</h3>
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Document Type</label>
                <Dropdown className="w-full" trigger={(isOpen) => (
                  <button type="button" className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium flex items-center justify-between hover:border-accent-green transition-colors">
                    <span>{({ID:'ID',CONTRACT:'Contract',MEDICAL:'Medical',OTHER:'Other'} as Record<string,string>)[docForm.type] ?? docForm.type}</span>
                    <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                )} sections={[{ items: [
                  { label: 'ID',       onClick: () => setDocForm(p => ({ ...p, type: 'ID' })) },
                  { label: 'Contract', onClick: () => setDocForm(p => ({ ...p, type: 'CONTRACT' })) },
                  { label: 'Medical',  onClick: () => setDocForm(p => ({ ...p, type: 'MEDICAL' })) },
                  { label: 'Other',    onClick: () => setDocForm(p => ({ ...p, type: 'OTHER' })) },
                ]}]} />
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Document Name</label>
                <input
                  type="text"
                  value={docForm.name}
                  onChange={(e) => setDocForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={async () => {
                  const file = docUploadFile;
                  setDocUploadFile(null);
                  const formData = new FormData();
                  formData.append('file', file);
                  formData.append('employeeId', id!);
                  formData.append('name', docForm.name || file.name);
                  formData.append('type', docForm.type.toUpperCase());
                  setUploading(true);
                  try {
                    await DocumentsAPI.upload(formData);
                    loadDocuments();
                    showToast('Document uploaded successfully', 'success');
                  } catch {
                    showToast('Upload failed', 'error');
                  } finally {
                    setUploading(false);
                  }
                }}
                className="flex-1 bg-brand text-navy py-2.5 rounded-full font-bold hover:opacity-90 text-sm"
              >
                Upload
              </button>
              <button
                onClick={() => setDocUploadFile(null)}
                className="px-4 py-2 rounded-full border border-border font-bold text-muted-foreground hover:bg-muted text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {deleteDocTarget && (
        <ConfirmModal
          title="Delete Document"
          message="Delete this document? This action cannot be undone."
          confirmLabel="Delete"
          onConfirm={confirmDeleteDocument}
          onCancel={() => setDeleteDocTarget(null)}
        />
      )}
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate('/employees')} aria-label="Go back" className="p-2 hover:bg-muted rounded-xl transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold">Edit Employee</h1>
          <p className="text-muted-foreground font-medium text-sm">{form.firstName} {form.lastName}</p>
        </div>
      </div>

      {error && <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-600 dark:text-red-300 font-medium">{error}</div>}

      <div className="flex gap-2 p-1 tab-pill-track rounded-2xl mb-8 w-fit">
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
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              activeTab === t.id ? 'tab-pill-active' : 'tab-pill-inactive'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-8">

        {activeTab === 'PERSONAL' && (
          <Section title="Personal Details">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Employee Code" required>
              <input required value={form.employeeCode} onChange={set('employeeCode')} />
            </Field>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Title</label>
              <Dropdown className="w-full" trigger={(isOpen) => (
                <button type="button" className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium flex items-center justify-between hover:border-accent-green transition-colors text-foreground">
                  <span>{form.title || '— Select —'}</span>
                  <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
              )} sections={[{ items: [
                { label: '— Select —', onClick: () => setForm(p => ({ ...p, title: '' })) },
                ...TITLES.map(t => ({ label: t, onClick: () => setForm(p => ({ ...p, title: t })) })),
              ]}]} />
            </div>
            <Field label="First Name" required>
              <input required value={form.firstName} onChange={set('firstName')} />
            </Field>
            <Field label="Last Name" required>
              <input required value={form.lastName} onChange={set('lastName')} />
            </Field>
            <Field label="Maiden Name">
              <input value={form.maidenName} onChange={set('maidenName')} />
            </Field>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Nationality *</label>
              <Dropdown className="w-full" trigger={(isOpen) => (
                <button type="button" className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium flex items-center justify-between hover:border-accent-green transition-colors text-foreground">
                  <span className="truncate">{form.nationality || 'Zimbabwean'}</span>
                  <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
              )} sections={[{ items: [
                { label: '— Select —', onClick: () => setForm(p => ({ ...p, nationality: '' })) },
                ...AFRICAN_NATIONALITIES.map(n => ({ label: n, onClick: () => setForm(p => ({ ...p, nationality: n })) })),
              ]}]} />
            </div>
            <Field label="National ID" required={form.nationality === 'Zimbabwean'}>
              <input 
                required={form.nationality === 'Zimbabwean'} 
                value={form.nationalId} 
                onChange={set('nationalId')} 
                placeholder={form.nationality === 'Zimbabwean' ? "e.g. 63-123456A78" : "National ID"}
                pattern={form.nationality === 'Zimbabwean' ? "^[0-9]{2}-?[0-9]{6,7}\\s?[A-Za-z]\\s?[0-9]{2}$" : undefined}
                title={form.nationality === 'Zimbabwean' ? "Format: 63-123456A78" : undefined}
              />
            </Field>
            <Field label="Passport Number">
              <input value={form.passportNumber} onChange={set('passportNumber')} placeholder="Passport Number" />
            </Field>
            <Field label="Email Address">
              <input type="email" value={form.email} onChange={set('email')} placeholder="e.g. john@example.com" />
            </Field>
            <Field label="Phone Number">
              <input type="tel" value={form.phone} onChange={set('phone')} placeholder="e.g. 0771234567" />
            </Field>
            <Field label="Date of Birth" required>
              <input required type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} />
            </Field>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Gender *</label>
              <Dropdown className="w-full" trigger={(isOpen) => (
                <button type="button" className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium flex items-center justify-between hover:border-accent-green transition-colors text-foreground">
                  <span>{({MALE:'Male',FEMALE:'Female',OTHER:'Other'} as Record<string,string>)[form.gender] ?? (form.gender || '— Select —')}</span>
                  <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
              )} sections={[{ items: [
                { label: '— Select —', onClick: () => setForm(p => ({ ...p, gender: '' })) },
                { label: 'Male',   onClick: () => setForm(p => ({ ...p, gender: 'MALE' })) },
                { label: 'Female', onClick: () => setForm(p => ({ ...p, gender: 'FEMALE' })) },
                { label: 'Other',  onClick: () => setForm(p => ({ ...p, gender: 'OTHER' })) },
              ]}]} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Marital Status *</label>
              <Dropdown className="w-full" trigger={(isOpen) => (
                <button type="button" className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium flex items-center justify-between hover:border-accent-green transition-colors text-foreground">
                  <span>{({SINGLE:'Single',MARRIED:'Married',DIVORCED:'Divorced',WIDOWED:'Widowed'} as Record<string,string>)[form.maritalStatus] ?? (form.maritalStatus || '— Select —')}</span>
                  <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
              )} sections={[{ items: [
                { label: '— Select —', onClick: () => setForm(p => ({ ...p, maritalStatus: '' })) },
                { label: 'Single',   onClick: () => setForm(p => ({ ...p, maritalStatus: 'SINGLE' })) },
                { label: 'Married',  onClick: () => setForm(p => ({ ...p, maritalStatus: 'MARRIED' })) },
                { label: 'Divorced', onClick: () => setForm(p => ({ ...p, maritalStatus: 'DIVORCED' })) },
                { label: 'Widowed',  onClick: () => setForm(p => ({ ...p, maritalStatus: 'WIDOWED' })) },
              ]}]} />
            </div>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Start Date" required>
              <input required type="date" value={form.startDate} onChange={set('startDate')} />
            </Field>
            <Field label="Occupation">
              <input value={form.occupation} onChange={set('occupation')} />
            </Field>
            <Field label="Position / Job Title" required>
              <input required value={form.position} onChange={set('position')} />
            </Field>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Department</label>
              <Dropdown className="w-full" trigger={(isOpen) => (
                <button type="button" className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium flex items-center justify-between hover:border-accent-green transition-colors text-foreground">
                  <span className="truncate">{departments.find((d) => d.id === form.departmentId)?.name || '— None —'}</span>
                  <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
              )} sections={[{ items: [
                { label: '— None —', onClick: () => setForm(p => ({ ...p, departmentId: '' })) },
                ...departments.map((d) => ({ label: d.name, onClick: () => setForm(p => ({ ...p, departmentId: d.id })) })),
              ], emptyMessage: 'No departments' }]} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Branch</label>
              <Dropdown className="w-full" trigger={(isOpen) => (
                <button type="button" className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium flex items-center justify-between hover:border-accent-green transition-colors text-foreground">
                  <span className="truncate">{branches.find((b) => b.id === form.branchId)?.name || '— None —'}</span>
                  <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
              )} sections={[{ items: [
                { label: '— None —', onClick: () => setForm(p => ({ ...p, branchId: '' })) },
                ...branches.map((b) => ({ label: b.name, onClick: () => setForm(p => ({ ...p, branchId: b.id })) })),
              ], emptyMessage: 'No branches' }]} />
            </div>
            <Field label="Cost Center">
              <input value={form.costCenter} onChange={set('costCenter')} />
            </Field>
            <Field label="Grade">
              <input value={form.grade} onChange={set('grade')} />
            </Field>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Employment Type *</label>
              <Dropdown className="w-full" trigger={(isOpen) => (
                <button type="button" className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium flex items-center justify-between hover:border-accent-green transition-colors text-foreground">
                  <span>{({PERMANENT:'Permanent',CONTRACT:'Contract',TEMPORARY:'Temporary',PART_TIME:'Part Time'} as Record<string,string>)[form.employmentType] ?? form.employmentType}</span>
                  <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
              )} sections={[{ items: [
                { label: 'Permanent',  onClick: () => setForm(p => ({ ...p, employmentType: 'PERMANENT' })) },
                { label: 'Contract',   onClick: () => setForm(p => ({ ...p, employmentType: 'CONTRACT' })) },
                { label: 'Temporary',  onClick: () => setForm(p => ({ ...p, employmentType: 'TEMPORARY' })) },
                { label: 'Part Time',  onClick: () => setForm(p => ({ ...p, employmentType: 'PART_TIME' })) },
              ]}]} />
            </div>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Payment Method *</label>
              <Dropdown className="w-full" trigger={(isOpen) => (
                <button type="button" className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium flex items-center justify-between hover:border-accent-green transition-colors text-foreground">
                  <span>{({BANK:'Bank',CASH:'Cash'} as Record<string,string>)[form.paymentMethod] ?? form.paymentMethod}</span>
                  <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
              )} sections={[{ items: [
                { label: 'Bank', onClick: () => setForm(p => ({ ...p, paymentMethod: 'BANK' })) },
                { label: 'Cash', onClick: () => setForm(p => ({ ...p, paymentMethod: 'CASH' })) },
              ]}]} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Payment Basis *</label>
              <Dropdown className="w-full" trigger={(isOpen) => (
                <button type="button" className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium flex items-center justify-between hover:border-accent-green transition-colors text-foreground">
                  <span>{({MONTHLY:'Monthly',DAILY:'Daily',HOURLY:'Hourly'} as Record<string,string>)[form.paymentBasis] ?? form.paymentBasis}</span>
                  <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
              )} sections={[{ items: [
                { label: 'Monthly', onClick: () => setForm(p => ({ ...p, paymentBasis: 'MONTHLY' })) },
                { label: 'Daily',   onClick: () => setForm(p => ({ ...p, paymentBasis: 'DAILY' })) },
                { label: 'Hourly',  onClick: () => setForm(p => ({ ...p, paymentBasis: 'HOURLY' })) },
              ]}]} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Rate Source *</label>
              <Dropdown className="w-full" trigger={(isOpen) => (
                <button type="button" className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium flex items-center justify-between hover:border-accent-green transition-colors text-foreground">
                  <span>{({MANUAL:'Manual',NEC_GRADE:'NEC Grade'} as Record<string,string>)[form.rateSource] ?? form.rateSource}</span>
                  <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
              )} sections={[{ items: [
                { label: 'Manual',    onClick: () => setForm(p => ({ ...p, rateSource: 'MANUAL' })) },
                { label: 'NEC Grade', onClick: () => setForm(p => ({ ...p, rateSource: 'NEC_GRADE' })) },
              ]}]} />
            </div>
            {form.rateSource === 'NEC_GRADE' && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">NEC Grade</label>
                <Dropdown className="w-full" trigger={(isOpen) => (
                  <button type="button" className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium flex items-center justify-between hover:border-accent-green transition-colors text-foreground">
                    <span className="truncate">{necGrades.find((g) => g.id === form.necGradeId) ? `${necGrades.find((g) => g.id === form.necGradeId)!.gradeCode}${necGrades.find((g) => g.id === form.necGradeId)!.description ? ` — ${necGrades.find((g) => g.id === form.necGradeId)!.description}` : ''}` : '— Select grade —'}</span>
                    <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                )} sections={[{ items: [
                  { label: '— Select grade —', onClick: () => setForm(p => ({ ...p, necGradeId: '' })) },
                  ...necGrades.map((g) => ({ label: `${g.gradeCode}${g.description ? ` — ${g.description}` : ''} (${g.tableName})`, onClick: () => setForm(p => ({ ...p, necGradeId: g.id })) })),
                ], emptyMessage: 'No grades available' }]} />
              </div>
            )}
            <Field label="Base Rate" required>
              <input required type="number" step="0.01" min="0" value={form.baseRate} onChange={set('baseRate')} />
            </Field>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Currency *</label>
              <Dropdown className="w-full" trigger={(isOpen) => (
                <button type="button" className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium flex items-center justify-between hover:border-accent-green transition-colors text-foreground">
                  <span>{form.currency}</span>
                  <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
              )} sections={[{ items: [
                { label: 'USD', onClick: () => setForm(p => ({ ...p, currency: 'USD' })) },
                { label: 'ZiG', onClick: () => setForm(p => ({ ...p, currency: 'ZiG' })) },
              ]}]} />
            </div>
            <Field label="Hours per Period">
              <input type="number" step="0.5" value={form.hoursPerPeriod} onChange={set('hoursPerPeriod')} />
            </Field>
            <Field label="Days per Period">
              <input type="number" step="0.5" value={form.daysPerPeriod} onChange={set('daysPerPeriod')} />
            </Field>
          </div>

          {/* ZiG Basic Salary Splitting */}
          <div className="bg-emerald-50/30 dark:bg-emerald-950/20 border border-emerald-100/50 dark:border-emerald-800/40 p-6 rounded-2xl mb-8">
            <h4 className="text-xs font-bold text-emerald-700 uppercase tracking-widest mb-4 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
              ZiG Basic Salary Splitting (ZIMRA Apportionment)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">ZiG Portion Mode</label>
                <Dropdown className="w-full" trigger={(isOpen) => (
                  <button type="button" className="w-full px-4 py-3 bg-background border border-emerald-200 dark:border-emerald-800 rounded-xl text-sm font-medium flex items-center justify-between hover:border-emerald-400 transition-colors text-foreground">
                    <span>{({NONE:'None (100% USD)',PERCENTAGE:'Percentage of USD Basic',FIXED:'Fixed ZiG Amount'} as Record<string,string>)[form.splitZigMode] ?? form.splitZigMode}</span>
                    <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                )} sections={[{ items: [
                  { label: 'None (100% USD)',          onClick: () => setForm(p => ({ ...p, splitZigMode: 'NONE' })) },
                  { label: 'Percentage of USD Basic',  onClick: () => setForm(p => ({ ...p, splitZigMode: 'PERCENTAGE' })) },
                  { label: 'Fixed ZiG Amount',         onClick: () => setForm(p => ({ ...p, splitZigMode: 'FIXED' })) },
                ]}]} />
              </div>
              {form.splitZigMode !== 'NONE' && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
                    {form.splitZigMode === 'PERCENTAGE' ? 'ZiG Portion (%)' : 'ZiG Amount'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.splitZigValue}
                    onChange={set('splitZigValue')}
                    className="w-full px-4 py-3 bg-background border border-emerald-200 dark:border-emerald-800 rounded-xl text-sm font-bold text-emerald-700 dark:text-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              )}
            </div>
            <p className="mt-4 text-[10px] text-emerald-600/70 leading-relaxed font-medium">
              {form.splitZigMode === 'PERCENTAGE' && "The ZiG basic will be calculated as a percentage of the USD base rate. The remainder stays as USD basic."}
              {form.splitZigMode === 'FIXED' && "The ZiG basic is fixed and separate. The employee receives both the full USD basic and the fixed ZiG amount."}
              {form.splitZigMode === 'NONE' && "The employee is paid entirely in the primary currency selected above."}
            </p>
          </div>

          {form.paymentMethod === 'BANK' && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between border-b pb-2 mb-2">
                <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Bank Accounts & Splitting</h4>
                <button type="button" onClick={addAccount} className="text-[10px] font-bold text-accent-green hover:underline uppercase">
                  + Add Split Account
                </button>
              </div>

              <datalist id="zw-banks">
                {ZIMBABWE_BANKS.map(b => <option key={b} value={b} />)}
              </datalist>

              {form.bankAccounts.map((acc, index: number) => (
                <div key={index} className="bg-muted/50 p-4 rounded-2xl border border-border relative group transition-all hover:bg-muted">
                  {form.bankAccounts.length > 1 && (
                    <button 
                      type="button" 
                      onClick={() => removeAccount(index)}
                      className="absolute -right-2 -top-2 bg-card border border-red-200 dark:border-red-800 shadow-sm rounded-full p-1 text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-all opacity-0 group-hover:opacity-100"
                    >
                      <ArrowLeft size={14} className="rotate-45" />
                    </button>
                  )}
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Bank Name</label>
                      <input
                        required
                        list="zw-banks"
                        value={acc.bankName}
                        onChange={(e) => handleAccountChange(index, 'bankName', e.target.value)}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-medium text-foreground focus:ring-2 focus:ring-accent-green/10 focus:border-accent-green outline-none transition-all"
                        placeholder="Search or type bank name"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Account Number</label>
                      <input 
                        required 
                        value={acc.accountNumber} 
                        onChange={(e) => handleAccountChange(index, 'accountNumber', e.target.value)}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-medium text-foreground focus:ring-2 focus:ring-accent-green/10 focus:border-accent-green outline-none transition-all"
                        placeholder="000000000"
                        pattern="^\d+$"
                        title="Account number must contain only digits"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Account Name</label>
                      <input 
                        value={acc.accountName} 
                        onChange={(e) => handleAccountChange(index, 'accountName', e.target.value)}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-medium text-foreground focus:ring-2 focus:ring-accent-green/10 focus:border-accent-green outline-none transition-all"
                        placeholder="Holder Name"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Split Mode</label>
                      <Dropdown className="w-full" trigger={(isOpen) => (
                        <button type="button" className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-bold text-foreground flex items-center justify-between hover:border-accent-green transition-colors">
                          <span>{({REMAINDER:'Remainder',FIXED:'Fixed Amount',PERCENTAGE:'Percentage (%)'} as Record<string,string>)[acc.splitType] ?? acc.splitType}</span>
                          <ChevronDown size={13} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        </button>
                      )} sections={[{ items: [
                        { label: 'Remainder',      onClick: () => handleAccountChange(index, 'splitType', 'REMAINDER') },
                        { label: 'Fixed Amount',   onClick: () => handleAccountChange(index, 'splitType', 'FIXED') },
                        { label: 'Percentage (%)', onClick: () => handleAccountChange(index, 'splitType', 'PERCENTAGE') },
                      ]}]} />
                      <p className="text-[10px] text-muted-foreground leading-snug">
                        {acc.splitType === 'REMAINDER' && 'Receives everything left after other splits.'}
                        {acc.splitType === 'FIXED' && 'A fixed currency amount is paid to this account.'}
                        {acc.splitType === 'PERCENTAGE' && 'A percentage of net pay is paid to this account.'}
                      </p>
                    </div>

                    {acc.splitType !== 'REMAINDER' && (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Split Value</label>
                        <input 
                          type="number" 
                          step="0.01" 
                          required
                          value={acc.splitValue} 
                          onChange={(e) => handleAccountChange(index, 'splitValue', e.target.value)}
                          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-bold text-accent-green focus:ring-2 focus:ring-accent-green/10 focus:border-accent-green outline-none transition-all"
                        />
                      </div>
                    )}

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Account Currency</label>
                      <Dropdown className="w-full" trigger={(isOpen) => (
                        <button type="button" className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-medium text-foreground flex items-center justify-between hover:border-accent-green transition-colors">
                          <span>{acc.currency}</span>
                          <ChevronDown size={13} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        </button>
                      )} sections={[{ items: [
                        { label: 'USD', onClick: () => handleAccountChange(index, 'currency', 'USD') },
                        { label: 'ZiG', onClick: () => handleAccountChange(index, 'currency', 'ZiG') },
                      ]}]} />
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Tax Directive %">
              <input type="number" step="0.01" min="0" max="100" value={form.taxDirectivePerc} onChange={set('taxDirectivePerc')} />
            </Field>
            <Field label="Tax Directive Amount">
              <input type="number" step="0.01" min="0" value={form.taxDirectiveAmt} onChange={set('taxDirectiveAmt')} />
            </Field>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Tax Method *</label>
              <Dropdown className="w-full" trigger={(isOpen) => (
                <button type="button" className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium flex items-center justify-between hover:border-accent-green transition-colors text-foreground">
                  <span>{({NON_FDS:'Non-FDS',FDS_AVERAGE:'FDS Average',FDS_FORECASTING:'FDS Forecasting'} as Record<string,string>)[form.taxMethod] ?? form.taxMethod}</span>
                  <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
              )} sections={[{ items: [
                { label: 'Non-FDS',         onClick: () => setForm(p => ({ ...p, taxMethod: 'NON_FDS' })) },
                { label: 'FDS Average',     onClick: () => setForm(p => ({ ...p, taxMethod: 'FDS_AVERAGE' })) },
                { label: 'FDS Forecasting', onClick: () => setForm(p => ({ ...p, taxMethod: 'FDS_FORECASTING' })) },
              ]}]} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Tax Table *</label>
              <Dropdown className="w-full" trigger={(isOpen) => (
                <button type="button" className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium flex items-center justify-between hover:border-accent-green transition-colors text-foreground">
                  <span className="truncate">{taxTables.find((t) => t.name === form.taxTable) ? `${form.taxTable} (${taxTables.find((t) => t.name === form.taxTable)!.currency})` : (form.taxTable || '— Select tax table —')}</span>
                  <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
              )} sections={[{ items: [
                { label: '— Select tax table —', onClick: () => setForm(p => ({ ...p, taxTable: '' })) },
                ...taxTables.map((t) => ({ label: `${t.name} (${t.currency})${t.isActive ? ' ★' : ''}`, onClick: () => setForm(p => ({ ...p, taxTable: t.name })) })),
              ], emptyMessage: 'No tax tables available' }]} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Accumulative Setting *</label>
              <Dropdown className="w-full" trigger={(isOpen) => (
                <button type="button" className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium flex items-center justify-between hover:border-accent-green transition-colors text-foreground">
                  <span>{({NO:'No',YES:'Yes'} as Record<string,string>)[form.accumulativeSetting] ?? form.accumulativeSetting}</span>
                  <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
              )} sections={[{ items: [
                { label: 'No',  onClick: () => setForm(p => ({ ...p, accumulativeSetting: 'NO' })) },
                { label: 'Yes', onClick: () => setForm(p => ({ ...p, accumulativeSetting: 'YES' })) },
              ]}]} />
            </div>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <p className="text-xs text-muted-foreground max-w-xs font-medium">Upload ID documents, contracts, medical certificates, etc.</p>
              <label className="cursor-pointer bg-accent-green text-white px-4 py-2 rounded-xl text-xs font-bold hover:opacity-90 transition-opacity flex items-center gap-2">
                <Upload size={14} /> {uploading ? 'Uploading...' : 'Upload New'}
                <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {documents.length === 0 ? (
                <div className="py-12 border-2 border-dashed border-border rounded-2xl flex flex-col items-center justify-center text-muted-foreground/40">
                  <FileText size={40} className="mb-2 opacity-20" />
                  <p className="text-sm font-bold">No documents uploaded</p>
                </div>
              ) : documents.map(doc => (
                <div key={doc.id} className="flex items-center justify-between p-4 bg-muted/50 border border-border rounded-2xl group hover:border-accent-green/30 transition-all">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-card rounded-xl shadow-sm group-hover:bg-accent-green group-hover:text-white transition-all">
                      <FileText size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-navy">{doc.name}</p>
                        <span className="px-1.5 py-0.5 bg-muted text-muted-foreground rounded text-[9px] font-black uppercase tracking-wider">{doc.type}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                        {new Date(doc.createdAt).toLocaleDateString()} · {(doc.size / 1024).toFixed(0)} KB
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <a 
                      href={doc.fileUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="p-2 hover:bg-card rounded-lg text-muted-foreground hover:text-accent-green transition-all shadow-sm"
                      title="View/Download"
                    >
                      <Download size={14} />
                    </a>
                    <button
                      type="button"
                      onClick={() => deleteDocument(doc.id)}
                      className="p-2 hover:bg-card rounded-lg text-muted-foreground hover:text-red-500 transition-all shadow-sm"
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
              className="flex items-center gap-1.5 bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              <Save size={16} /> {loading ? 'Saving…' : 'Save Changes'}
            </button>
            <button type="button" onClick={() => navigate('/employees')} className="px-4 py-2 rounded-full border border-border font-bold text-muted-foreground hover:bg-muted">
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
  <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
    <h3 className="font-bold mb-4 text-sm uppercase tracking-wider text-muted-foreground">{title}</h3>
    {children}
  </div>
);

export default EmployeeEdit;
