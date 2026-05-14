import React, { useState, useEffect, useRef } from 'react';
import { useToast } from '../context/ToastContext';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Loader, FileText, Upload, Trash2, Download, ChevronDown, X, Plus } from 'lucide-react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { employeeSchema, type EmployeeFormValues } from '@/lib/schemas/employee.schema';
import { Dropdown } from '@/components/ui/dropdown';
import { Input } from '@/components/ui/input';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { EmployeeAPI, BranchAPI, DepartmentAPI, NecTableAPI, TaxTableAPI, SystemSettingsAPI, DocumentsAPI } from '../api/client';
import ConfirmModal from '../components/common/ConfirmModal';
import { getActiveCompanyId } from '../lib/companyContext';
import SalaryStructurePanel from '../components/employees/SalaryStructurePanel';
import EmployeeAuditTab from '../components/EmployeeAuditTab';
import { cn } from '@/lib/utils';

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

// Helper: convert ISO date string to Date object (noon UTC to avoid timezone shifts)
function parseDate(val: any): Date | undefined {
  if (!val) return undefined;
  if (val instanceof Date) return val;
  const s = String(val).slice(0, 10);
  if (!s) return undefined;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

// Helper: format Date to YYYY-MM-DD string for <input type="date">
function formatDateInput(val: Date | undefined): string {
  if (!val) return '';
  const y = val.getFullYear();
  const m = String(val.getMonth() + 1).padStart(2, '0');
  const d = String(val.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

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

  const [activeTab, setActiveTab] = useState<'PERSONAL' | 'WORK' | 'PAY' | 'TAX' | 'LEAVE' | 'DOCUMENTS' | 'AUDIT'>('PERSONAL');
  const [documents, setDocuments] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [docUploadFile, setDocUploadFile] = useState<File | null>(null);
  const [docForm, setDocForm] = useState({ type: 'OTHER', name: '' });
  const [deleteDocTarget, setDeleteDocTarget] = useState<string | null>(null);

  const loadingRef = useRef(false);

  const rhfForm = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeSchema) as any,
    defaultValues: {
      // Personal
      employeeCode: '', title: '', firstName: '', lastName: '', maidenName: '',
      nationality: 'Zimbabwean', nationalId: '', passportNumber: '', email: '', phone: '',
      gender: '', maritalStatus: '',
      homeAddress: '', postalAddress: '',
      nextOfKinName: '', nextOfKinContact: '', socialSecurityNum: '', pensionNumber: '',
      // Work
      occupation: '', position: '', departmentId: '', branchId: '',
      costCenter: '', grade: '', employmentType: 'PERMANENT',
      leaveEntitlement: undefined, dischargeReason: '',
      // Pay
      paymentMethod: 'BANK', paymentBasis: 'MONTHLY', rateSource: 'MANUAL',
      baseRate: 0, currency: 'USD', hoursPerPeriod: undefined, daysPerPeriod: undefined,
      necGradeId: '', splitUsdPercent: undefined,
      bankAccounts: [{ accountName: '', accountNumber: '', bankName: '', bankBranch: '', branchCode: '', splitType: 'REMAINDER', splitValue: 0, priority: 0, currency: 'USD' }],
      // Tax
      taxDirectivePerc: undefined, taxDirectiveAmt: undefined, taxMethod: 'NON_FDS',
      taxTable: '', accumulativeSetting: 'NO', taxCredits: undefined,
      tin: '', motorVehicleBenefit: undefined, motorVehicleType: '',
      // Leave
      annualLeaveAccrued: undefined, annualLeaveTaken: undefined,
      // Split
      splitZigMode: 'NONE', splitZigValue: undefined,
    },
  });

  const { register, handleSubmit, setValue, watch, control, formState: { errors } } = rhfForm;

  const { fields: bankAccountFields, append: appendAccount, remove: removeAccount } = useFieldArray({
    control,
    name: 'bankAccounts',
  });

  const paymentMethod = watch('paymentMethod');
  const nationality = watch('nationality');
  const taxMethod = watch('taxMethod');
  const rateSource = watch('rateSource');
  const splitZigMode = watch('splitZigMode');

  const loadDocuments = async () => {
    try {
      const res = await DocumentsAPI.getByEmployee(id!);
      setDocuments(res.data);
    } catch {
      // silent
    }
  };

  const loadEmployeeData = () => {
    if (loadingRef.current || !id) return;
    loadingRef.current = true;

    const companyId = getActiveCompanyId();
    const handleError = (label: string) => (err: any) => {
      console.error(`[EmployeeEdit] ${label}: status=${err?.status}, message=`, err?.message);
      return null;
    };
    setFetching(true);
    setError('');
    Promise.all([
      EmployeeAPI.getById(id!).catch(handleError('EmployeeAPI.getById')),
      BranchAPI.getAll(companyId ? { companyId } : {}).catch(handleError('BranchAPI.getAll')),
      DepartmentAPI.getAll(companyId ? { companyId } : {}).catch(handleError('DepartmentAPI.getAll')),
      NecTableAPI.getAll().catch(handleError('NecTableAPI.getAll')),
      TaxTableAPI.getAll().catch(handleError('TaxTableAPI.getAll')),
      SystemSettingsAPI.getAll().catch(handleError('SystemSettingsAPI.getAll')),
    ]).then(([emp, br, dep, nec, tt, ss]) => {
      if (!emp) {
        setError('Failed to load employee');
        return;
      }
      if (tt) setTaxTables(tt.data);
      const e = emp.data;
      const empCurrency = e.currency || 'USD';
      const tableNames = new Set((tt?.data as any[] | undefined)?.map((t: any) => t.name) ?? []);
      const settingName = `DEFAULT_TAX_TABLE_${empCurrency}`;
      const defaultSetting = (ss?.data as any[] | undefined)
        ?.filter((s: any) => s.settingName === settingName && s.isActive)
        .sort((a: any, b: any) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime())[0];
      const resolvedTaxTable = (e.taxTable && tableNames.has(e.taxTable))
        ? e.taxTable
        : (defaultSetting?.settingValue || '');

      if (nec) {
        const allGrades: any[] = [];
        (nec.data as any[]).forEach((table: any) => {
          (table.grades ?? []).forEach((g: any) => allGrades.push({ ...g, tableName: table.name }));
        });
        setNecGrades(allGrades);
      }

      // Populate RHF fields
      const setVal = (k: keyof EmployeeFormValues, v: any) => {
        if (v !== undefined && v !== null) setValue(k, v as any);
      };

      setVal('employeeCode',      e.employeeCode || '');
      setVal('title',             e.title || '');
      setVal('firstName',         e.firstName || '');
      setVal('lastName',          e.lastName || '');
      setVal('maidenName',        e.maidenName || '');
      setVal('nationality',       e.nationality || 'Zimbabwean');
      setVal('nationalId',        e.nationalId || '');
      setVal('passportNumber',    e.passportNumber || '');
      setVal('email',             e.email || '');
      setVal('phone',             e.phone || '');
      const dob = parseDate(e.dateOfBirth);
      if (dob) setVal('dateOfBirth', dob);
      setVal('gender',            e.gender || '');
      setVal('maritalStatus',     e.maritalStatus || '');
      setVal('homeAddress',       e.homeAddress || '');
      setVal('postalAddress',     e.postalAddress || '');
      setVal('nextOfKinName',     e.nextOfKinName || '');
      setVal('nextOfKinContact',  e.nextOfKinContact || '');
      setVal('socialSecurityNum', e.socialSecurityNum || '');
      setVal('pensionNumber',     e.pensionNumber || '');
      const sd = parseDate(e.startDate);
      if (sd) setVal('startDate', sd);
      setVal('occupation',        e.occupation || '');
      setVal('position',          e.position || '');
      setVal('departmentId',      e.departmentId || '');
      setVal('branchId',          e.branchId || '');
      setVal('costCenter',        e.costCenter || '');
      setVal('grade',             e.grade?.name || '');
      setVal('employmentType',    e.employmentType || 'PERMANENT');
      if (e.leaveEntitlement != null) setVal('leaveEntitlement', e.leaveEntitlement);
      const dd = parseDate(e.dischargeDate);
      if (dd) setVal('dischargeDate', dd);
      setVal('dischargeReason',   e.dischargeReason || '');
      setVal('paymentMethod',     e.paymentMethod || 'BANK');
      setVal('paymentBasis',      e.paymentBasis || 'MONTHLY');
      setVal('rateSource',        e.rateSource || 'MANUAL');
      if (e.baseRate != null) setVal('baseRate', e.baseRate);
      setVal('currency',          e.currency || 'USD');
      if (e.hoursPerPeriod != null) setVal('hoursPerPeriod', e.hoursPerPeriod);
      if (e.daysPerPeriod != null) setVal('daysPerPeriod', e.daysPerPeriod);
      setVal('necGradeId',        e.necGradeId || '');
      if (e.splitUsdPercent != null) setVal('splitUsdPercent', e.splitUsdPercent);
      setVal('splitZigMode',      e.splitZigMode || 'NONE');
      if (e.splitZigValue != null) setVal('splitZigValue', e.splitZigValue);
      if (e.taxDirectivePerc != null) setVal('taxDirectivePerc', e.taxDirectivePerc);
      if (e.taxDirectiveAmt != null) setVal('taxDirectiveAmt', e.taxDirectiveAmt);
      setVal('taxMethod',         e.taxMethod || 'NON_FDS');
      setVal('taxTable',          resolvedTaxTable);
      setVal('accumulativeSetting', e.accumulativeSetting || 'NO');
      if (e.taxCredits != null) setVal('taxCredits', e.taxCredits);
      setVal('tin',               e.tin || '');
      if (e.motorVehicleBenefit != null) setVal('motorVehicleBenefit', e.motorVehicleBenefit);
      setVal('motorVehicleType',  e.motorVehicleType || '');
      if (e.leaveBalance != null) setVal('annualLeaveAccrued', e.leaveBalance);
      if (e.leaveTaken != null) setVal('annualLeaveTaken', e.leaveTaken);
      if (e.bankAccounts?.length) {
        setValue('bankAccounts', e.bankAccounts);
      }

      if (br) setBranches(br.data);
      if (dep) setDepartments(dep.data);
      loadDocuments();
    }).catch(() => setError('Failed to load employee')).finally(() => {
      loadingRef.current = false;
      setFetching(false);
    });
  };

  useEffect(() => {
    loadEmployeeData();
    window.addEventListener('activeCompanyChanged', loadEmployeeData);
    return () => window.removeEventListener('activeCompanyChanged', loadEmployeeData);
  }, [id]);

  const onSubmit = async (data: EmployeeFormValues) => {
    setError('');
    setLoading(true);
    try {
      await EmployeeAPI.update(id!, {
        ...data,
        dateOfBirth: data.dateOfBirth?.toISOString(),
        startDate: data.startDate?.toISOString(),
        dischargeDate: data.dischargeDate?.toISOString(),
        necGradeId: data.necGradeId || null,
        splitUsdPercent: data.splitUsdPercent ?? null,
        splitZigMode: data.splitZigMode || 'NONE',
        splitZigValue: data.splitZigValue ?? null,
        bankAccounts: data.paymentMethod === 'BANK' ? data.bankAccounts : [],
      } as any);
      navigate('/employees');
    } catch (err: any) {
      const msg = err.message || 'Failed to update employee';
      console.error('[EmployeeEdit save]', msg, err);
      setError(msg);
    } finally {
      setLoading(false);
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

  const firstName = watch('firstName');
  const lastName = watch('lastName');

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
          <p className="text-muted-foreground font-medium text-sm">{firstName} {lastName}</p>
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

      <Form {...rhfForm}>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-8">

          {/* ── Personal Tab ── */}
          {activeTab === 'PERSONAL' && (
            <Section title="Personal Details">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField control={control} name="employeeCode" render={({ field }) => (
                  <FormItem className="flex flex-col gap-1.5">
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Employee Code <span className="text-red-400">*</span></FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormItem className="flex flex-col gap-1.5">
                  <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Title</FormLabel>
                  <Controller name="title" control={control} render={({ field }) => (
                    <Dropdown className="w-full" trigger={(isOpen) => (
                      <button type="button" className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium flex items-center justify-between hover:border-accent-green transition-colors text-foreground">
                        <span>{field.value || '— Select —'}</span>
                        <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </button>
                    )} sections={[{ items: [
                      { label: '— Select —', onClick: () => field.onChange('') },
                      ...TITLES.map(t => ({ label: t, onClick: () => field.onChange(t) })),
                    ]}]} />
                  )} />
                </FormItem>

                <FormField control={control} name="firstName" render={({ field }) => (
                  <FormItem className="flex flex-col gap-1.5">
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">First Name <span className="text-red-400">*</span></FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={control} name="lastName" render={({ field }) => (
                  <FormItem className="flex flex-col gap-1.5">
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Last Name <span className="text-red-400">*</span></FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={control} name="maidenName" render={({ field }) => (
                  <FormItem className="flex flex-col gap-1.5">
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Maiden Name</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormItem className="flex flex-col gap-1.5">
                  <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Nationality <span className="text-red-400">*</span></FormLabel>
                  <Controller name="nationality" control={control} render={({ field }) => (
                    <Dropdown className="w-full" trigger={(isOpen) => (
                      <button type="button" className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium flex items-center justify-between hover:border-accent-green transition-colors text-foreground">
                        <span className="truncate">{field.value || 'Zimbabwean'}</span>
                        <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </button>
                    )} sections={[{ items: [
                      { label: '— Select —', onClick: () => field.onChange('') },
                      ...AFRICAN_NATIONALITIES.map(n => ({ label: n, onClick: () => field.onChange(n) })),
                    ]}]} />
                  )} />
                  {errors.nationality && <p className="text-xs text-destructive mt-1">{errors.nationality.message}</p>}
                </FormItem>

                <FormField control={control} name="nationalId" render={({ field }) => (
                  <FormItem className="flex flex-col gap-1.5">
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      National ID{nationality === 'Zimbabwean' && <span className="text-red-400 ml-1">*</span>}
                    </FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={nationality === 'Zimbabwean' ? 'e.g. 63-123456A78' : 'National ID'} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={control} name="passportNumber" render={({ field }) => (
                  <FormItem className="flex flex-col gap-1.5">
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Passport Number</FormLabel>
                    <FormControl><Input {...field} placeholder="Passport Number" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={control} name="email" render={({ field }) => (
                  <FormItem className="flex flex-col gap-1.5">
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Email Address</FormLabel>
                    <FormControl><Input {...field} type="email" placeholder="e.g. john@example.com" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={control} name="phone" render={({ field }) => (
                  <FormItem className="flex flex-col gap-1.5">
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Phone Number</FormLabel>
                    <FormControl><Input {...field} type="tel" placeholder="e.g. 0771234567" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Date of Birth — raw date input with Controller for Date ↔ string conversion */}
                <Controller name="dateOfBirth" control={control} render={({ field }) => (
                  <FormItem className="flex flex-col gap-1.5">
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Date of Birth <span className="text-red-400">*</span></FormLabel>
                    <FormControl>
                      <input
                        type="date"
                        value={formatDateInput(field.value as Date | undefined)}
                        onChange={(e) => field.onChange(parseDate(e.target.value))}
                        className="flex h-10 w-full rounded-xl border border-border bg-muted px-4 py-2 text-sm font-medium outline-none transition-all focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                      />
                    </FormControl>
                    {errors.dateOfBirth && <p className="text-xs text-destructive mt-1">{errors.dateOfBirth.message as string}</p>}
                  </FormItem>
                )} />

                <FormItem className="flex flex-col gap-1.5">
                  <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Gender <span className="text-red-400">*</span></FormLabel>
                  <Controller name="gender" control={control} render={({ field }) => (
                    <Dropdown className="w-full" trigger={(isOpen) => (
                      <button type="button" className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium flex items-center justify-between hover:border-accent-green transition-colors text-foreground">
                        <span>{({MALE:'Male',FEMALE:'Female',OTHER:'Other'} as Record<string,string>)[field.value] ?? (field.value || '— Select —')}</span>
                        <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </button>
                    )} sections={[{ items: [
                      { label: '— Select —', onClick: () => field.onChange('') },
                      { label: 'Male',   onClick: () => field.onChange('MALE') },
                      { label: 'Female', onClick: () => field.onChange('FEMALE') },
                      { label: 'Other',  onClick: () => field.onChange('OTHER') },
                    ]}]} />
                  )} />
                  {errors.gender && <p className="text-xs text-destructive mt-1">{errors.gender.message}</p>}
                </FormItem>

                <FormItem className="flex flex-col gap-1.5">
                  <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Marital Status <span className="text-red-400">*</span></FormLabel>
                  <Controller name="maritalStatus" control={control} render={({ field }) => (
                    <Dropdown className="w-full" trigger={(isOpen) => (
                      <button type="button" className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium flex items-center justify-between hover:border-accent-green transition-colors text-foreground">
                        <span>{({SINGLE:'Single',MARRIED:'Married',DIVORCED:'Divorced',WIDOWED:'Widowed'} as Record<string,string>)[field.value] ?? (field.value || '— Select —')}</span>
                        <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </button>
                    )} sections={[{ items: [
                      { label: '— Select —', onClick: () => field.onChange('') },
                      { label: 'Single',   onClick: () => field.onChange('SINGLE') },
                      { label: 'Married',  onClick: () => field.onChange('MARRIED') },
                      { label: 'Divorced', onClick: () => field.onChange('DIVORCED') },
                      { label: 'Widowed',  onClick: () => field.onChange('WIDOWED') },
                    ]}]} />
                  )} />
                  {errors.maritalStatus && <p className="text-xs text-destructive mt-1">{errors.maritalStatus.message}</p>}
                </FormItem>

                <FormField control={control} name="homeAddress" render={({ field }) => (
                  <FormItem className={cn('flex flex-col gap-1.5', 'col-span-2')}>
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Home Address</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={control} name="postalAddress" render={({ field }) => (
                  <FormItem className={cn('flex flex-col gap-1.5', 'col-span-2')}>
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Postal Address</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={control} name="nextOfKinName" render={({ field }) => (
                  <FormItem className="flex flex-col gap-1.5">
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Next of Kin Name</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={control} name="nextOfKinContact" render={({ field }) => (
                  <FormItem className="flex flex-col gap-1.5">
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Next of Kin Contact</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={control} name="socialSecurityNum" render={({ field }) => (
                  <FormItem className="flex flex-col gap-1.5">
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Social Security Number</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={control} name="pensionNumber" render={({ field }) => (
                  <FormItem className="flex flex-col gap-1.5">
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Pension Member Number</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </Section>
          )}

          {/* ── Work Tab ── */}
          {activeTab === 'WORK' && (
            <Section title="Work Details">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Start Date */}
                <Controller name="startDate" control={control} render={({ field }) => (
                  <FormItem className="flex flex-col gap-1.5">
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Start Date <span className="text-red-400">*</span></FormLabel>
                    <FormControl>
                      <input
                        type="date"
                        value={formatDateInput(field.value as Date | undefined)}
                        onChange={(e) => field.onChange(parseDate(e.target.value))}
                        className="flex h-10 w-full rounded-xl border border-border bg-muted px-4 py-2 text-sm font-medium outline-none transition-all focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                      />
                    </FormControl>
                    {errors.startDate && <p className="text-xs text-destructive mt-1">{errors.startDate.message as string}</p>}
                  </FormItem>
                )} />

                <FormField control={control} name="occupation" render={({ field }) => (
                  <FormItem className="flex flex-col gap-1.5">
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Occupation</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={control} name="position" render={({ field }) => (
                  <FormItem className="flex flex-col gap-1.5">
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Position / Job Title <span className="text-red-400">*</span></FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormItem className="flex flex-col gap-1.5">
                  <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Department</FormLabel>
                  <Controller name="departmentId" control={control} render={({ field }) => (
                    <Dropdown className="w-full" trigger={(isOpen) => (
                      <button type="button" className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium flex items-center justify-between hover:border-accent-green transition-colors text-foreground">
                        <span className="truncate">{departments.find((d: any) => d.id === field.value)?.name || '— None —'}</span>
                        <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </button>
                    )} sections={[{ items: [
                      { label: '— None —', onClick: () => field.onChange('') },
                      ...departments.map((d: any) => ({ label: d.name, onClick: () => field.onChange(d.id) })),
                    ], emptyMessage: 'No departments' }]} />
                  )} />
                </FormItem>

                <FormItem className="flex flex-col gap-1.5">
                  <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Branch</FormLabel>
                  <Controller name="branchId" control={control} render={({ field }) => (
                    <Dropdown className="w-full" trigger={(isOpen) => (
                      <button type="button" className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium flex items-center justify-between hover:border-accent-green transition-colors text-foreground">
                        <span className="truncate">{branches.find((b: any) => b.id === field.value)?.name || '— None —'}</span>
                        <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </button>
                    )} sections={[{ items: [
                      { label: '— None —', onClick: () => field.onChange('') },
                      ...branches.map((b: any) => ({ label: b.name, onClick: () => field.onChange(b.id) })),
                    ], emptyMessage: 'No branches' }]} />
                  )} />
                </FormItem>

                <FormField control={control} name="costCenter" render={({ field }) => (
                  <FormItem className="flex flex-col gap-1.5">
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Cost Center</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={control} name="grade" render={({ field }) => (
                  <FormItem className="flex flex-col gap-1.5">
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Grade</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormItem className="flex flex-col gap-1.5">
                  <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Employment Type <span className="text-red-400">*</span></FormLabel>
                  <Controller name="employmentType" control={control} render={({ field }) => (
                    <Dropdown className="w-full" trigger={(isOpen) => (
                      <button type="button" className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium flex items-center justify-between hover:border-accent-green transition-colors text-foreground">
                        <span>{({PERMANENT:'Permanent',CONTRACT:'Contract',TEMPORARY:'Temporary',PART_TIME:'Part Time'} as Record<string,string>)[field.value] ?? field.value}</span>
                        <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </button>
                    )} sections={[{ items: [
                      { label: 'Permanent',  onClick: () => field.onChange('PERMANENT') },
                      { label: 'Contract',   onClick: () => field.onChange('CONTRACT') },
                      { label: 'Temporary',  onClick: () => field.onChange('TEMPORARY') },
                      { label: 'Part Time',  onClick: () => field.onChange('PART_TIME') },
                    ]}]} />
                  )} />
                  {errors.employmentType && <p className="text-xs text-destructive mt-1">{errors.employmentType.message}</p>}
                </FormItem>

                <FormField control={control} name="leaveEntitlement" render={({ field }) => (
                  <FormItem className="flex flex-col gap-1.5">
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Leave Entitlement (days)</FormLabel>
                    <FormControl><Input {...field} type="number" step="0.5" value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Discharge Date */}
                <Controller name="dischargeDate" control={control} render={({ field }) => (
                  <FormItem className="flex flex-col gap-1.5">
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Discharge Date</FormLabel>
                    <FormControl>
                      <input
                        type="date"
                        value={formatDateInput(field.value as Date | undefined)}
                        onChange={(e) => field.onChange(e.target.value ? parseDate(e.target.value) : undefined)}
                        className="flex h-10 w-full rounded-xl border border-border bg-muted px-4 py-2 text-sm font-medium outline-none transition-all focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                      />
                    </FormControl>
                    {errors.dischargeDate && <p className="text-xs text-destructive mt-1">{errors.dischargeDate.message as string}</p>}
                  </FormItem>
                )} />

                <FormField control={control} name="dischargeReason" render={({ field }) => (
                  <FormItem className={cn('flex flex-col gap-1.5', 'col-span-2')}>
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Discharge Reason</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </Section>
          )}

          {/* ── Pay Tab ── */}
          {activeTab === 'PAY' && (
            <Section title="Pay Details & Bank Splitting">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <FormItem className="flex flex-col gap-1.5">
                  <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Payment Method <span className="text-red-400">*</span></FormLabel>
                  <Controller name="paymentMethod" control={control} render={({ field }) => (
                    <Dropdown className="w-full" trigger={(isOpen) => (
                      <button type="button" className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium flex items-center justify-between hover:border-accent-green transition-colors text-foreground">
                        <span>{({BANK:'Bank',CASH:'Cash'} as Record<string,string>)[field.value] ?? field.value}</span>
                        <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </button>
                    )} sections={[{ items: [
                      { label: 'Bank', onClick: () => field.onChange('BANK') },
                      { label: 'Cash', onClick: () => field.onChange('CASH') },
                    ]}]} />
                  )} />
                </FormItem>

                <FormItem className="flex flex-col gap-1.5">
                  <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Payment Basis <span className="text-red-400">*</span></FormLabel>
                  <Controller name="paymentBasis" control={control} render={({ field }) => (
                    <Dropdown className="w-full" trigger={(isOpen) => (
                      <button type="button" className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium flex items-center justify-between hover:border-accent-green transition-colors text-foreground">
                        <span>{({MONTHLY:'Monthly',DAILY:'Daily',HOURLY:'Hourly'} as Record<string,string>)[field.value] ?? field.value}</span>
                        <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </button>
                    )} sections={[{ items: [
                      { label: 'Monthly', onClick: () => field.onChange('MONTHLY') },
                      { label: 'Daily',   onClick: () => field.onChange('DAILY') },
                      { label: 'Hourly',  onClick: () => field.onChange('HOURLY') },
                    ]}]} />
                  )} />
                </FormItem>

                <FormItem className="flex flex-col gap-1.5">
                  <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Rate Source <span className="text-red-400">*</span></FormLabel>
                  <Controller name="rateSource" control={control} render={({ field }) => (
                    <Dropdown className="w-full" trigger={(isOpen) => (
                      <button type="button" className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium flex items-center justify-between hover:border-accent-green transition-colors text-foreground">
                        <span>{({MANUAL:'Manual',NEC_GRADE:'NEC Grade'} as Record<string,string>)[field.value] ?? field.value}</span>
                        <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </button>
                    )} sections={[{ items: [
                      { label: 'Manual',    onClick: () => field.onChange('MANUAL') },
                      { label: 'NEC Grade', onClick: () => field.onChange('NEC_GRADE') },
                    ]}]} />
                  )} />
                </FormItem>

                {rateSource === 'NEC_GRADE' && (
                  <FormItem className="flex flex-col gap-1.5">
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">NEC Grade</FormLabel>
                    <Controller name="necGradeId" control={control} render={({ field }) => (
                      <Dropdown className="w-full" trigger={(isOpen) => (
                        <button type="button" className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium flex items-center justify-between hover:border-accent-green transition-colors text-foreground">
                          <span className="truncate">{necGrades.find((g: any) => g.id === field.value) ? `${necGrades.find((g: any) => g.id === field.value).gradeCode}${necGrades.find((g: any) => g.id === field.value).description ? ` — ${necGrades.find((g: any) => g.id === field.value).description}` : ''}` : '— Select grade —'}</span>
                          <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        </button>
                      )} sections={[{ items: [
                        { label: '— Select grade —', onClick: () => field.onChange('') },
                        ...necGrades.map((g: any) => ({ label: `${g.gradeCode}${g.description ? ` — ${g.description}` : ''} (${g.tableName})`, onClick: () => field.onChange(g.id) })),
                      ], emptyMessage: 'No grades available' }]} />
                    )} />
                  </FormItem>
                )}

                <FormField control={control} name="baseRate" render={({ field }) => (
                  <FormItem className="flex flex-col gap-1.5">
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Base Rate <span className="text-red-400">*</span></FormLabel>
                    <FormControl><Input {...field} type="number" step="0.01" min="0" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormItem className="flex flex-col gap-1.5">
                  <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Currency <span className="text-red-400">*</span></FormLabel>
                  <Controller name="currency" control={control} render={({ field }) => (
                    <Dropdown className="w-full" trigger={(isOpen) => (
                      <button type="button" className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium flex items-center justify-between hover:border-accent-green transition-colors text-foreground">
                        <span>{field.value}</span>
                        <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </button>
                    )} sections={[{ items: [
                      { label: 'USD', onClick: () => field.onChange('USD') },
                      { label: 'ZiG', onClick: () => field.onChange('ZiG') },
                    ]}]} />
                  )} />
                </FormItem>

                <FormField control={control} name="hoursPerPeriod" render={({ field }) => (
                  <FormItem className="flex flex-col gap-1.5">
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Hours per Period</FormLabel>
                    <FormControl><Input {...field} type="number" step="0.5" value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={control} name="daysPerPeriod" render={({ field }) => (
                  <FormItem className="flex flex-col gap-1.5">
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Days per Period</FormLabel>
                    <FormControl><Input {...field} type="number" step="0.5" value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
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
                    <Controller name="splitZigMode" control={control} render={({ field }) => (
                      <Dropdown className="w-full" trigger={(isOpen) => (
                        <button type="button" className="w-full px-4 py-3 bg-background border border-emerald-200 dark:border-emerald-800 rounded-xl text-sm font-medium flex items-center justify-between hover:border-emerald-400 transition-colors text-foreground">
                          <span>{({NONE:'None (100% USD)',PERCENTAGE:'Percentage of USD Basic',FIXED:'Fixed ZiG Amount'} as Record<string,string>)[field.value] ?? field.value}</span>
                          <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        </button>
                      )} sections={[{ items: [
                        { label: 'None (100% USD)',          onClick: () => field.onChange('NONE') },
                        { label: 'Percentage of USD Basic',  onClick: () => field.onChange('PERCENTAGE') },
                        { label: 'Fixed ZiG Amount',         onClick: () => field.onChange('FIXED') },
                      ]}]} />
                    )} />
                  </div>
                  {splitZigMode !== 'NONE' && (
                    <FormField control={control} name="splitZigValue" render={({ field }) => (
                      <FormItem className="flex flex-col gap-1.5">
                        <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
                          {splitZigMode === 'PERCENTAGE' ? 'ZiG Portion (%)' : 'ZiG Amount'}
                        </FormLabel>
                        <FormControl>
                          <input
                            type="number"
                            step="0.01"
                            value={field.value ?? ''}
                            onChange={e => field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))}
                            className="w-full px-4 py-3 bg-background border border-emerald-200 dark:border-emerald-800 rounded-xl text-sm font-bold text-emerald-700 dark:text-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  )}
                </div>
                <p className="mt-4 text-[10px] text-emerald-600/70 leading-relaxed font-medium">
                  {splitZigMode === 'PERCENTAGE' && "The ZiG basic will be calculated as a percentage of the USD base rate. The remainder stays as USD basic."}
                  {splitZigMode === 'FIXED' && "The ZiG basic is fixed and separate. The employee receives both the full USD basic and the fixed ZiG amount."}
                  {splitZigMode === 'NONE' && "The employee is paid entirely in the primary currency selected above."}
                </p>
              </div>

              {/* Bank Accounts */}
              {paymentMethod === 'BANK' && (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between border-b pb-2 mb-2">
                    <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Bank Accounts & Splitting</h4>
                    <button
                      type="button"
                      onClick={() => appendAccount({ accountName: '', accountNumber: '', bankName: '', bankBranch: '', branchCode: '', splitType: 'FIXED', splitValue: 0, priority: bankAccountFields.length, currency: 'USD' })}
                      className="text-[10px] font-bold text-accent-green hover:underline uppercase flex items-center gap-1"
                    >
                      <Plus size={12} /> Add Split Account
                    </button>
                  </div>

                  <datalist id="zw-banks">
                    {ZIMBABWE_BANKS.map(b => <option key={b} value={b} />)}
                  </datalist>

                  {bankAccountFields.map((accountField, index) => {
                    const splitType = watch(`bankAccounts.${index}.splitType`);
                    return (
                      <div key={accountField.id} className="bg-muted/50 p-4 rounded-2xl border border-border relative group transition-all hover:bg-muted">
                        {bankAccountFields.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeAccount(index)}
                            className="absolute -right-2 -top-2 bg-card border border-red-200 dark:border-red-800 shadow-sm rounded-full p-1 text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-all opacity-0 group-hover:opacity-100"
                          >
                            <X size={14} />
                          </button>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Bank Name</label>
                            <input
                              list="zw-banks"
                              {...register(`bankAccounts.${index}.bankName`)}
                              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-medium text-foreground focus:ring-2 focus:ring-accent-green/10 focus:border-accent-green outline-none transition-all"
                              placeholder="Search or type bank name"
                            />
                            {errors.bankAccounts?.[index]?.bankName && (
                              <p className="text-xs text-destructive">{errors.bankAccounts[index]?.bankName?.message}</p>
                            )}
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Account Number</label>
                            <input
                              {...register(`bankAccounts.${index}.accountNumber`)}
                              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-medium text-foreground focus:ring-2 focus:ring-accent-green/10 focus:border-accent-green outline-none transition-all"
                              placeholder="000000000"
                            />
                            {errors.bankAccounts?.[index]?.accountNumber && (
                              <p className="text-xs text-destructive">{errors.bankAccounts[index]?.accountNumber?.message}</p>
                            )}
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Account Name</label>
                            <input
                              {...register(`bankAccounts.${index}.accountName`)}
                              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-medium text-foreground focus:ring-2 focus:ring-accent-green/10 focus:border-accent-green outline-none transition-all"
                              placeholder="Holder Name"
                            />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Split Mode</label>
                            <Controller control={control} name={`bankAccounts.${index}.splitType`} render={({ field }) => (
                              <Dropdown className="w-full" trigger={(isOpen) => (
                                <button type="button" className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-bold text-foreground flex items-center justify-between hover:border-accent-green transition-colors">
                                  <span>{({'REMAINDER':'Remainder','FIXED':'Fixed Amount','PERCENTAGE':'Percentage (%)'} as Record<string,string>)[field.value] ?? field.value}</span>
                                  <ChevronDown size={13} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                                </button>
                              )} sections={[{ items: [
                                { label: 'Remainder',      onClick: () => field.onChange('REMAINDER') },
                                { label: 'Fixed Amount',   onClick: () => field.onChange('FIXED') },
                                { label: 'Percentage (%)', onClick: () => field.onChange('PERCENTAGE') },
                              ]}]} />
                            )} />
                            <p className="text-[10px] text-muted-foreground leading-snug">
                              {splitType === 'REMAINDER' && 'Receives everything left after other splits.'}
                              {splitType === 'FIXED' && 'A fixed currency amount is paid to this account.'}
                              {splitType === 'PERCENTAGE' && 'A percentage of net pay is paid to this account.'}
                            </p>
                          </div>
                          {splitType !== 'REMAINDER' && (
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Split Value</label>
                              <input
                                type="number"
                                step="0.01"
                                {...register(`bankAccounts.${index}.splitValue`)}
                                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-bold text-accent-green focus:ring-2 focus:ring-accent-green/10 focus:border-accent-green outline-none transition-all"
                              />
                            </div>
                          )}
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Account Currency</label>
                            <Controller control={control} name={`bankAccounts.${index}.currency`} render={({ field }) => (
                              <Dropdown className="w-full" trigger={(isOpen) => (
                                <button type="button" className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-medium text-foreground flex items-center justify-between hover:border-accent-green transition-colors">
                                  <span>{field.value}</span>
                                  <ChevronDown size={13} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                                </button>
                              )} sections={[{ items: [
                                { label: 'USD', onClick: () => field.onChange('USD') },
                                { label: 'ZiG', onClick: () => field.onChange('ZiG') },
                              ]}]} />
                            )} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>
          )}

          {/* ── Tax Tab ── */}
          {activeTab === 'TAX' && (
            <Section title="Tax Details">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField control={control} name="taxDirectivePerc" render={({ field }) => (
                  <FormItem className="flex flex-col gap-1.5">
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Tax Directive %</FormLabel>
                    <FormControl><Input {...field} type="number" step="0.01" min="0" max="100" value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={control} name="taxDirectiveAmt" render={({ field }) => (
                  <FormItem className="flex flex-col gap-1.5">
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Tax Directive Amount</FormLabel>
                    <FormControl><Input {...field} type="number" step="0.01" min="0" value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormItem className="flex flex-col gap-1.5">
                  <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Tax Method <span className="text-red-400">*</span></FormLabel>
                  <Controller name="taxMethod" control={control} render={({ field }) => (
                    <Dropdown className="w-full" trigger={(isOpen) => (
                      <button type="button" className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium flex items-center justify-between hover:border-accent-green transition-colors text-foreground">
                        <span>{({NON_FDS:'Non-FDS',FDS_AVERAGE:'FDS Average',FDS_FORECASTING:'FDS Forecasting'} as Record<string,string>)[field.value] ?? field.value}</span>
                        <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </button>
                    )} sections={[{ items: [
                      { label: 'Non-FDS',         onClick: () => field.onChange('NON_FDS') },
                      { label: 'FDS Average',     onClick: () => field.onChange('FDS_AVERAGE') },
                      { label: 'FDS Forecasting', onClick: () => field.onChange('FDS_FORECASTING') },
                    ]}]} />
                  )} />
                  <p className="text-[10px] text-muted-foreground leading-snug">
                    {taxMethod === 'NON_FDS' && 'Standard PAYE — tax calculated monthly.'}
                    {taxMethod === 'FDS_AVERAGE' && 'Fixed-date scheme (YTD average).'}
                    {taxMethod === 'FDS_FORECASTING' && 'Fixed-date scheme (Annual projection).'}
                  </p>
                </FormItem>

                <FormItem className="flex flex-col gap-1.5">
                  <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Tax Table <span className="text-red-400">*</span></FormLabel>
                  <Controller name="taxTable" control={control} render={({ field }) => (
                    <Dropdown className="w-full" trigger={(isOpen) => (
                      <button type="button" className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium flex items-center justify-between hover:border-accent-green transition-colors text-foreground">
                        <span className="truncate">{taxTables.find((t: any) => t.name === field.value) ? `${field.value} (${taxTables.find((t: any) => t.name === field.value).currency})` : (field.value || '— Select tax table —')}</span>
                        <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </button>
                    )} sections={[{ items: [
                      { label: '— Select tax table —', onClick: () => field.onChange('') },
                      ...taxTables.map((t: any) => ({ label: `${t.name} (${t.currency})${t.isActive ? ' ★' : ''}`, onClick: () => field.onChange(t.name) })),
                    ], emptyMessage: 'No tax tables available' }]} />
                  )} />
                  {errors.taxTable && <p className="text-xs text-destructive mt-1">{errors.taxTable.message}</p>}
                </FormItem>

                <FormItem className="flex flex-col gap-1.5">
                  <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Accumulative Setting <span className="text-red-400">*</span></FormLabel>
                  <Controller name="accumulativeSetting" control={control} render={({ field }) => (
                    <Dropdown className="w-full" trigger={(isOpen) => (
                      <button type="button" className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium flex items-center justify-between hover:border-accent-green transition-colors text-foreground">
                        <span>{({NO:'No',YES:'Yes'} as Record<string,string>)[field.value] ?? field.value}</span>
                        <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </button>
                    )} sections={[{ items: [
                      { label: 'No',  onClick: () => field.onChange('NO') },
                      { label: 'Yes', onClick: () => field.onChange('YES') },
                    ]}]} />
                  )} />
                </FormItem>

                <FormField control={control} name="taxCredits" render={({ field }) => (
                  <FormItem className="flex flex-col gap-1.5">
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Tax Credits</FormLabel>
                    <FormControl><Input {...field} type="number" step="0.01" min="0" value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={control} name="tin" render={({ field }) => (
                  <FormItem className="flex flex-col gap-1.5">
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">TIN (Tax Identification Number)</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={control} name="motorVehicleBenefit" render={({ field }) => (
                  <FormItem className="flex flex-col gap-1.5">
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Motor Vehicle Benefit</FormLabel>
                    <FormControl><Input {...field} type="number" step="0.01" min="0" value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={control} name="motorVehicleType" render={({ field }) => (
                  <FormItem className="flex flex-col gap-1.5">
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Motor Vehicle Type</FormLabel>
                    <FormControl><Input {...field} placeholder="e.g. Saloon" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </Section>
          )}

          {/* ── Leave / Stats Tab ── */}
          {activeTab === 'LEAVE' && (
            <Section title="Leave Details">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField control={control} name="annualLeaveAccrued" render={({ field }) => (
                  <FormItem className="flex flex-col gap-1.5">
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Annual Leave Accrued (days)</FormLabel>
                    <FormControl><Input {...field} type="number" step="0.5" min="0" value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={control} name="annualLeaveTaken" render={({ field }) => (
                  <FormItem className="flex flex-col gap-1.5">
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Annual Leave Taken (days)</FormLabel>
                    <FormControl><Input {...field} type="number" step="0.5" min="0" value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </Section>
          )}

          {/* ── Documents Tab ── */}
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

          {/* ── Audit Tab ── */}
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
      </Form>

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
