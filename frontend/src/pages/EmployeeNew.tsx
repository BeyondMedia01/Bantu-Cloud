import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { employeeSchema, type EmployeeFormValues } from '@/lib/schemas/employee.schema';
import { ArrowLeft, Save, X, Plus, ChevronDown } from 'lucide-react';
import { Dropdown } from '@/components/ui/dropdown';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';

import CardTypeBadge from '@/components/common/CardTypeBadge';
import { EmployeeAPI, BranchAPI, DepartmentAPI, TaxTableAPI, SystemSettingsAPI } from '../api/client';
import { getActiveCompanyId } from '../lib/companyContext';
import { useToast } from '../context/ToastContext';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

// ── Constants ───────────────────────────────────────────────────────────────

const ZIMBABWE_BANKS = [
  'Agribank (Agricultural Bank of Zimbabwe)', 'BancABC Zimbabwe',
  'CABS (Central Africa Building Society)', 'CBZ Bank', 'Ecobank Zimbabwe',
  'FBC Bank', 'First Capital Bank', 'MetBank', 'NMB Bank',
  "POSB (People's Own Savings Bank)", 'Stanbic Bank Zimbabwe',
  'Standard Chartered Bank Zimbabwe', 'Steward Bank', 'ZB Bank',
];

const AFRICAN_NATIONALITIES = [
  'Zimbabwean', 'South African', 'Zambian', 'Botswana', 'Malawian',
  'Mozambican', 'Namibian', 'Kenyan', 'Nigerian', 'Ghanaian', 'Other',
];

const TITLES = ['Mr', 'Mrs', 'Miss', 'Ms', 'Dr', 'Prof', 'Rev'];

// Schema and types imported from shared module
type FormValues = EmployeeFormValues;

// ── Tab definitions ───────────────────────────────────────────────────────────

const TABS = [
  { id: 'PERSONAL', label: 'Personal', fields: ['employeeCode','title','firstName','lastName','maidenName','nationality','nationalId','passportNumber','email','phone','dateOfBirth','gender','maritalStatus','homeAddress','postalAddress','nextOfKinName','nextOfKinContact','socialSecurityNum'] },
  { id: 'WORK',     label: 'Work',     fields: ['startDate','occupation','position','departmentId','branchId','costCenter','grade','employmentType','leaveEntitlement','dischargeDate','dischargeReason'] },
  { id: 'PAY',      label: 'Pay',      fields: ['paymentMethod','paymentBasis','rateSource','baseRate','currency','hoursPerPeriod','daysPerPeriod','bankAccounts'] },
  { id: 'TAX',      label: 'Tax',      fields: ['taxDirectivePerc','taxDirectiveAmt','taxMethod','taxTable','accumulativeSetting','taxCredits','tin','motorVehicleBenefit','motorVehicleType'] },
  { id: 'LEAVE',    label: 'Stats',    fields: ['annualLeaveAccrued','annualLeaveTaken'] },
] as const;

type TabId = typeof TABS[number]['id'];

// ── DatePicker helper ─────────────────────────────────────────────────────────

function DatePicker({ value, onChange, placeholder }: { value?: Date; onChange: (d?: Date) => void; placeholder?: string }) {
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          'flex h-10 w-full items-center justify-start rounded-xl border border-border bg-muted px-4 py-2 text-sm font-medium outline-none transition-all hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-accent-green/20',
          !value && 'text-muted-foreground',
        )}
      >
        <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
        {value ? format(value, 'dd MMM yyyy') : <span>{placeholder ?? 'Pick a date'}</span>}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={onChange}
          captionLayout="dropdown"
          startMonth={new Date(1950, 0)}
          endMonth={new Date(new Date().getFullYear() + 5, 11)}
        />
      </PopoverContent>
    </Popover>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

const EmployeeNew: React.FC = () => {
  const navigate = useNavigate();
  const companyId = getActiveCompanyId();
  const { showToast } = useToast();

  const { data: branches = [], isLoading: branchesLoading } = useQuery({
    queryKey: ['branches', companyId],
    queryFn: () => BranchAPI.getAll({ companyId: companyId! }).then(r => r.data),
    enabled: !!companyId,
  });

  const { data: departments = [], isLoading: departmentsLoading } = useQuery({
    queryKey: ['departments', companyId],
    queryFn: () => DepartmentAPI.getAll({ companyId: companyId! }).then(r => r.data),
    enabled: !!companyId,
  });

  const { data: taxTables = [], isLoading: taxTablesLoading } = useQuery({
    queryKey: ['taxTables'],
    queryFn: () => TaxTableAPI.getAll().then(r => r.data),
  });

  const { data: systemSettings = [], isLoading: settingsLoading } = useQuery({
    queryKey: ['systemSettings'],
    queryFn: () => SystemSettingsAPI.getAll().then(r => r.data),
  });

  const dependenciesLoading = branchesLoading || departmentsLoading || taxTablesLoading || settingsLoading;

  const form = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(employeeSchema) as any,
    mode: 'onTouched',
    defaultValues: {
      employeeCode: '', title: '', firstName: '', lastName: '', maidenName: '',
      nationality: 'Zimbabwean', nationalId: '', passportNumber: '', email: '', phone: '',
      gender: '', maritalStatus: '', homeAddress: '', postalAddress: '',
      nextOfKinName: '', nextOfKinContact: '', socialSecurityNum: '',
      occupation: '', position: '', departmentId: '', branchId: '',
      costCenter: '', grade: '', employmentType: 'PERMANENT',
      paymentMethod: 'BANK', paymentBasis: 'MONTHLY', rateSource: 'MANUAL',
      currency: 'USD', taxMethod: 'NON_FDS', taxTable: '', accumulativeSetting: 'NO',
      bankAccounts: [{ accountName: '', accountNumber: '', bankName: '', bankBranch: '', branchCode: '', splitType: 'REMAINDER', splitValue: 0, priority: 0, currency: 'USD' }],
      splitZigMode: 'NONE',
      splitZigValue: 0,
    },
  });

  const isDirty = form.formState.isDirty;

  // Warn on browser tab/window close when form is dirty
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty && !form.formState.isSubmitSuccessful) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty, form.formState.isSubmitSuccessful]);

  // Set default tax table once system settings load
  useEffect(() => {
    if (systemSettings.length > 0 && !form.getValues('taxTable')) {
      const defaultSetting = systemSettings
        .filter((s) => s.settingName === 'DEFAULT_TAX_TABLE_USD' && s.isActive)
        .sort((a, b) => new Date(b.effectiveFrom ?? 0).getTime() - new Date(a.effectiveFrom ?? 0).getTime())[0];
      if (defaultSetting) form.setValue('taxTable', (defaultSetting.settingValue ?? '') as any);
    }
  }, [systemSettings]);

  const { fields: bankAccountFields, append: appendAccount, remove: removeAccount } = useFieldArray({
    control: form.control,
    name: 'bankAccounts',
  });

  const [activeTab, setActiveTab] = React.useState<TabId>('PERSONAL');
  const [submitError, setSubmitError] = React.useState('');

  const errors = form.formState.errors;

  const tabHasError = (tabId: TabId) => {
    const tab = TABS.find(t => t.id === tabId);
    if (!tab) return false;
    return tab.fields.some(f => f in errors);
  };

  const onError = (errors: any) => {
    // Find the first tab that has errors and switch to it
    for (const tab of TABS) {
      if (tab.fields.some(f => f in errors)) {
        setActiveTab(tab.id);
        break;
      }
    }
    // Scroll to the top of the form after a brief delay (so tab switch renders first)
    setTimeout(() => {
      const firstError = document.querySelector('[aria-invalid="true"], .text-destructive');
      if (firstError) {
        firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };

  const onSubmit = async (values: FormValues) => {
    setSubmitError('');
    try {
      const payload: Record<string, unknown> = {
        ...values,
        dateOfBirth: values.dateOfBirth?.toISOString(),
        startDate: values.startDate?.toISOString(),
        dischargeDate: values.dischargeDate?.toISOString(),
        companyId: companyId ?? undefined,
        bankAccounts: values.paymentMethod === 'BANK' ? values.bankAccounts : [],
      };
      await EmployeeAPI.create(payload as Parameters<typeof EmployeeAPI.create>[0]);
      showToast(`${values.firstName} ${values.lastName} added successfully`, 'success');
      navigate('/employees');
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to create employee');
    }
  };

  const paymentMethod = form.watch('paymentMethod');
  const nationality = form.watch('nationality');
  const taxMethod = form.watch('taxMethod');

  return (
    <>
    <div className="max-w-3xl">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate('/employees')} className="p-2 hover:bg-muted rounded-xl transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold">New Employee</h1>
          <p className="text-muted-foreground font-medium text-sm">Add a new employee to your company</p>
        </div>
      </div>

      {dependenciesLoading && (
        <div className="flex flex-col gap-4 animate-pulse">
          <div className="h-10 bg-muted rounded-2xl w-64" />
          <div className="rounded-2xl border border-border overflow-hidden">
            <div className="h-12 bg-muted border-b border-border" />
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-2">
                  <div className="h-3 bg-muted rounded w-24" />
                  <div className="h-10 bg-muted rounded-xl" />
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <div className="h-10 bg-muted rounded-full w-32" />
            <div className="h-10 bg-muted rounded-full w-24" />
          </div>
        </div>
      )}
      {!dependenciesLoading && (
        <>
          {submitError && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-600 dark:text-red-300 font-medium">{submitError}</div>
          )}

          {/* Tab bar */}
          <div className="flex gap-2 p-1 tab-pill-track rounded-2xl mb-8 w-fit">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`relative px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  activeTab === t.id ? 'tab-pill-active' : 'tab-pill-inactive'
                }`}
              >
                {t.label}
                {tabHasError(t.id) && (
                  <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-red-400" />
                )}
              </button>
            ))}
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit, onError)} className="flex flex-col gap-8">

          {/* ── Personal Details ── */}
          {activeTab === 'PERSONAL' && (
            <Section title="Personal Details">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FF name="employeeCode" label="Employee Code" required form={form}>
                  {(field) => <Input {...field} placeholder="e.g. EMP001" />}
                </FF>
                <FF name="title" label="Title" form={form}>
                  {(field) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger><SelectValue placeholder="— Select —" /></SelectTrigger>
                      <SelectContent>{TITLES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                </FF>
                <FF name="firstName" label="First Name" required form={form}>
                  {(field) => <Input {...field} />}
                </FF>
                <FF name="lastName" label="Last Name" required form={form}>
                  {(field) => <Input {...field} />}
                </FF>
                <FF name="maidenName" label="Maiden Name" form={form}>
                  {(field) => <Input {...field} />}
                </FF>
                <FF name="nationality" label="Nationality" required form={form}>
                  {(field) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger><SelectValue placeholder="— Select —" /></SelectTrigger>
                      <SelectContent>{AFRICAN_NATIONALITIES.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                </FF>
                <FF name="nationalId" label="National ID" required={nationality === 'Zimbabwean'} form={form}>
                  {(field) => <Input {...field} placeholder={nationality === 'Zimbabwean' ? '63-1234567 A 12' : 'National ID'} />}
                </FF>
                <FF name="passportNumber" label="Passport Number" form={form}>
                  {(field) => <Input {...field} />}
                </FF>
                <FF name="email" label="Email Address" form={form}>
                  {(field) => <Input {...field} type="email" placeholder="e.g. john@example.com" />}
                </FF>
                <FF name="phone" label="Phone Number" form={form}>
                  {(field) => <Input {...field} type="tel" placeholder="e.g. 0771234567" />}
                </FF>
                <FormField control={form.control} name="dateOfBirth" render={({ field }) => (
                  <FormItem className="flex flex-col gap-1.5">
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Date of Birth<span className="text-red-400 ml-1">*</span>
                    </FormLabel>
                    <FormControl>
                      <DatePicker value={field.value} onChange={field.onChange} placeholder="Pick date of birth" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FF name="gender" label="Gender" required form={form}>
                  {(field) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger><SelectValue placeholder="— Select —" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MALE">Male</SelectItem>
                        <SelectItem value="FEMALE">Female</SelectItem>
                        <SelectItem value="OTHER">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </FF>
                <FF name="maritalStatus" label="Marital Status" required form={form}>
                  {(field) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger><SelectValue placeholder="— Select —" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SINGLE">Single</SelectItem>
                        <SelectItem value="MARRIED">Married</SelectItem>
                        <SelectItem value="DIVORCED">Divorced</SelectItem>
                        <SelectItem value="WIDOWED">Widowed</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </FF>
                <FF name="homeAddress" label="Home Address" className="col-span-2" form={form}>
                  {(field) => <Input {...field} />}
                </FF>
                <FF name="postalAddress" label="Postal Address" className="col-span-2" form={form}>
                  {(field) => <Input {...field} />}
                </FF>
                <FF name="nextOfKinName" label="Next of Kin Name" form={form}>
                  {(field) => <Input {...field} />}
                </FF>
                <FF name="nextOfKinContact" label="Next of Kin Contact" form={form}>
                  {(field) => <Input {...field} />}
                </FF>
                <FF name="socialSecurityNum" label="Social Security Number" form={form}>
                  {(field) => <Input {...field} />}
                </FF>
              </div>
            </Section>
          )}

          {/* ── Work Details ── */}
          {activeTab === 'WORK' && (
            <Section title="Work Details">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField control={form.control} name="startDate" render={({ field }) => (
                  <FormItem className="flex flex-col gap-1.5">
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Start Date<span className="text-red-400 ml-1">*</span>
                    </FormLabel>
                    <FormControl>
                      <DatePicker value={field.value} onChange={field.onChange} placeholder="Pick start date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FF name="occupation" label="Occupation" form={form}>
                  {(field) => <Input {...field} placeholder="e.g. Software Engineer" />}
                </FF>
                <FF name="position" label="Position / Job Title" required form={form}>
                  {(field) => <Input {...field} />}
                </FF>
                <FF name="departmentId" label="Department" form={form}>
                  {(field) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger><SelectValue placeholder="— None —" /></SelectTrigger>
                      <SelectContent>
                        {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </FF>
                <FF name="branchId" label="Branch" form={form}>
                  {(field) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger><SelectValue placeholder="— None —" /></SelectTrigger>
                      <SelectContent>
                        {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </FF>
                <FF name="costCenter" label="Cost Center" form={form}>
                  {(field) => <Input {...field} />}
                </FF>
                <FF name="grade" label="Grade" form={form}>
                  {(field) => <Input {...field} placeholder="e.g. Grade 5" />}
                </FF>
                <FF name="employmentType" label="Employment Type" required form={form}>
                  {(field) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PERMANENT">Permanent</SelectItem>
                        <SelectItem value="CONTRACT">Contract</SelectItem>
                        <SelectItem value="TEMPORARY">Temporary</SelectItem>
                        <SelectItem value="PART_TIME">Part Time</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </FF>
                <FF name="leaveEntitlement" label="Leave Entitlement (days)" form={form}>
                  {(field) => <Input {...field} type="number" step="0.5" placeholder="e.g. 30" />}
                </FF>
                <FormField control={form.control} name="dischargeDate" render={({ field }) => (
                  <FormItem className="flex flex-col gap-1.5">
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Discharge Date</FormLabel>
                    <FormControl>
                      <DatePicker value={field.value} onChange={field.onChange} placeholder="Pick discharge date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FF name="dischargeReason" label="Discharge Reason" className="col-span-2" form={form}>
                  {(field) => <Input {...field} />}
                </FF>
              </div>
            </Section>
          )}

          {/* ── Pay Details ── */}
          {activeTab === 'PAY' && (
            <Section title="Pay Details & Bank Splitting">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <FF name="paymentMethod" label="Payment Method" required form={form}>
                  {(field) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BANK">Bank</SelectItem>
                        <SelectItem value="CASH">Cash</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </FF>
                <FF name="paymentBasis" label="Payment Basis" required form={form}>
                  {(field) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MONTHLY">Monthly</SelectItem>
                        <SelectItem value="DAILY">Daily</SelectItem>
                        <SelectItem value="HOURLY">Hourly</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </FF>
                <FF name="rateSource" label="Rate Source" required form={form}>
                  {(field) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MANUAL">Manual</SelectItem>
                        <SelectItem value="NEC_GRADE">NEC Grade</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </FF>
                <FF name="baseRate" label="Base Rate" required form={form}>
                  {(field) => <Input {...field} type="number" step="0.01" min="0" placeholder="0.00" />}
                </FF>
                <FF name="currency" label="Currency" required form={form}>
                  {(field) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="ZiG">ZiG</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </FF>
                <FF name="hoursPerPeriod" label="Hours per Period" form={form}>
                  {(field) => <Input {...field} type="number" step="0.5" placeholder="e.g. 176" />}
                </FF>
                <FF name="daysPerPeriod" label="Days per Period" form={form}>
                  {(field) => <Input {...field} type="number" step="0.5" placeholder="e.g. 22" />}
                </FF>
              </div>

              {/* ZiG Basic Salary Splitting */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <h4 className="text-sm font-bold text-foreground">ZiG Salary Apportionment</h4>
                  <span className="label-section bg-muted px-2 py-0.5 rounded-full">ZIMRA</span>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  How should the employee's basic salary be split between USD and ZiG?
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  {[
                    { value: 'NONE',       title: '100% USD',        desc: 'Paid entirely in USD. No ZiG component.' },
                    { value: 'PERCENTAGE', title: 'ZiG Percentage',  desc: 'A % of USD basic is converted to ZiG.' },
                    { value: 'FIXED',      title: 'Fixed ZiG Amount', desc: 'A fixed ZiG amount; remainder stays USD.' },
                  ].map(opt => {
                    const selected = form.watch('splitZigMode') === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => form.setValue('splitZigMode', opt.value as any, { shouldDirty: true })}
                        className={`text-left p-4 rounded-xl border-2 transition-all ${
                          selected
                            ? 'border-accent-green bg-emerald-50/50 dark:bg-emerald-950/20'
                            : 'border-border hover:border-accent-green/40 bg-card'
                        }`}
                      >
                        <p className={`text-sm font-bold mb-1 ${selected ? 'text-accent-green' : 'text-foreground'}`}>{opt.title}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">{opt.desc}</p>
                      </button>
                    );
                  })}
                </div>
                {form.watch('splitZigMode') !== 'NONE' && (
                  <FF
                    name="splitZigValue"
                    label={form.watch('splitZigMode') === 'PERCENTAGE' ? 'ZiG Portion (%)' : 'ZiG Fixed Amount'}
                    form={form}
                    required
                  >
                    {(field) => (
                      <Input
                        {...field}
                        type="number"
                        step="0.01"
                        className="max-w-xs border-accent-green/50 focus-visible:ring-accent-green/20"
                        placeholder={form.watch('splitZigMode') === 'PERCENTAGE' ? 'e.g. 40' : 'e.g. 500.00'}
                      />
                    )}
                  </FF>
                )}
              </div>

              {paymentMethod === 'BANK' && (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between border-b pb-2 mb-2">
                    <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Bank Accounts & Splitting</h4>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => appendAccount({ accountName: '', accountNumber: '', bankName: '', bankBranch: '', branchCode: '', splitType: 'FIXED', splitValue: 0, priority: bankAccountFields.length, currency: 'USD' })}
                      className="text-[10px] font-bold uppercase h-auto py-1"
                    >
                      <Plus size={12} className="mr-1" /> Add Split Account
                    </Button>
                  </div>

                  <datalist id="zw-banks">
                    {ZIMBABWE_BANKS.map(b => <option key={b} value={b} />)}
                  </datalist>

                  {bankAccountFields.map((field, index) => {
                    const splitType = form.watch(`bankAccounts.${index}.splitType`);
                    const accountNum = form.watch(`bankAccounts.${index}.accountNumber`) || '';
                    const hasAcctError = !!errors.bankAccounts?.[index]?.accountNumber;
                    return (
                      <div key={field.id} className="bg-muted/50 p-4 rounded-2xl border border-border">
                        <div className="flex items-center justify-between mb-3">
                          <span className="label-section">Account {index + 1}</span>
                          {bankAccountFields.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeAccount(index)}
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
                            >
                              <X size={12} /> Remove
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          <div className="flex flex-col gap-1.5">
                            <label className="label-section">Bank Name</label>
                            <input
                              list="zw-banks"
                              {...form.register(`bankAccounts.${index}.bankName`)}
                              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-medium text-foreground focus:ring-2 focus:ring-accent-green/10 focus:border-accent-green outline-none transition-all"
                              placeholder="Type to search banks…"
                            />
                            <p className="text-xs text-muted-foreground">Start typing to see suggestions</p>
                            {errors.bankAccounts?.[index]?.bankName && (
                              <p className="text-xs text-red-500">{errors.bankAccounts[index]?.bankName?.message}</p>
                            )}
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center justify-between">
                              <label className="label-section">Account Number</label>
                              <CardTypeBadge accountNumber={accountNum} />
                            </div>
                            <input
                              {...form.register(`bankAccounts.${index}.accountNumber`)}
                              className={`w-full px-3 py-2 bg-background border rounded-lg text-sm font-medium text-foreground focus:ring-2 focus:ring-accent-green/10 outline-none transition-all ${hasAcctError ? 'border-red-400 focus:border-red-400' : 'border-border focus:border-accent-green'}`}
                              placeholder="e.g. 1234567890"
                            />
                            {hasAcctError && (
                              <p className="text-xs text-red-500">{errors.bankAccounts![index]?.accountNumber?.message}</p>
                            )}
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label className="label-section">Account Name</label>
                            <input
                              {...form.register(`bankAccounts.${index}.accountName`)}
                              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-medium text-foreground focus:ring-2 focus:ring-accent-green/10 focus:border-accent-green outline-none transition-all"
                              placeholder="Holder Name"
                            />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label className="label-section">Split Mode</label>
                            <Controller control={form.control} name={`bankAccounts.${index}.splitType`} render={({ field }) => (
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
                            <p className="text-xs text-muted-foreground leading-snug">
                              {splitType === 'REMAINDER' && 'Receives everything left after other splits.'}
                              {splitType === 'FIXED' && 'A fixed currency amount is paid to this account.'}
                              {splitType === 'PERCENTAGE' && 'A percentage of net pay is paid to this account.'}
                            </p>
                          </div>
                          {splitType !== 'REMAINDER' && (
                            <div className="flex flex-col gap-1.5">
                              <label className="label-section">Split Value</label>
                              <input
                                type="number"
                                step="0.01"
                                {...form.register(`bankAccounts.${index}.splitValue`)}
                                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-bold text-accent-green focus:ring-2 focus:ring-accent-green/10 focus:border-accent-green outline-none transition-all"
                              />
                            </div>
                          )}
                          <div className="flex flex-col gap-1.5">
                            <label className="label-section">Account Currency</label>
                            <Controller control={form.control} name={`bankAccounts.${index}.currency`} render={({ field }) => (
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

          {/* ── Tax Details ── */}
          {activeTab === 'TAX' && (
            <Section title="Tax Details">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FF name="taxDirectivePerc" label="Tax Directive %" form={form}>
                  {(field) => <Input {...field} type="number" step="0.01" min="0" max="100" placeholder="0.00" />}
                </FF>
                <FF name="taxDirectiveAmt" label="Tax Directive Amount" form={form}>
                  {(field) => <Input {...field} type="number" step="0.01" min="0" placeholder="0.00" />}
                </FF>
                <FormField control={form.control} name="taxMethod" render={({ field }) => (
                  <FormItem className="flex flex-col gap-1.5">
                    <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Tax Method<span className="text-red-400 ml-1">*</span>
                    </FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="NON_FDS">Non-FDS</SelectItem>
                        <SelectItem value="FDS_AVERAGE">FDS Average</SelectItem>
                        <SelectItem value="FDS_FORECASTING">FDS Forecasting</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground leading-snug">
                      {taxMethod === 'NON_FDS' && 'Standard PAYE — tax calculated monthly.'}
                      {taxMethod === 'FDS_AVERAGE' && 'Fixed-date scheme (YTD average).'}
                      {taxMethod === 'FDS_FORECASTING' && 'Fixed-date scheme (Annual projection).'}
                    </p>
                    <FormMessage />
                  </FormItem>
                )} />
                <FF name="taxTable" label="Tax Table" required form={form}>
                  {(field) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger><SelectValue placeholder="— Select tax table —" /></SelectTrigger>
                      <SelectContent>
                        {taxTables.map((t) => (
                          <SelectItem key={t.id} value={t.name}>
                            {t.name} ({t.currency}){t.isActive ? ' ★' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FF>
                <FF name="accumulativeSetting" label="Accumulative Setting" required form={form}>
                  {(field) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NO">No</SelectItem>
                        <SelectItem value="YES">Yes</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </FF>
                <FF name="taxCredits" label="Tax Credits" form={form}>
                  {(field) => <Input {...field} type="number" step="0.01" min="0" placeholder="0.00" />}
                </FF>
                <FF name="tin" label="TIN (Tax Identification Number)" form={form}>
                  {(field) => <Input {...field} />}
                </FF>
                <FF name="motorVehicleBenefit" label="Motor Vehicle Benefit" form={form}>
                  {(field) => <Input {...field} type="number" step="0.01" min="0" placeholder="0.00" />}
                </FF>
                <FF name="motorVehicleType" label="Motor Vehicle Type" form={form}>
                  {(field) => <Input {...field} placeholder="e.g. Saloon" />}
                </FF>
              </div>
            </Section>
          )}

          {/* ── Leave / Stats ── */}
          {activeTab === 'LEAVE' && (
            <Section title="Leave Details">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FF name="annualLeaveAccrued" label="Annual Leave Accrued (days)" form={form}>
                  {(field) => <Input {...field} type="number" step="0.5" min="0" placeholder="0" />}
                </FF>
                <FF name="annualLeaveTaken" label="Annual Leave Taken (days)" form={form}>
                  {(field) => <Input {...field} type="number" step="0.5" min="0" placeholder="0" />}
                </FF>
              </div>
            </Section>
          )}

          <div className="flex items-center gap-3">
            <Button
              type="submit"
              disabled={form.formState.isSubmitting}
              className="flex items-center gap-1.5 bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 transition-opacity disabled:opacity-60 h-auto"
            >
              <Save size={16} /> {form.formState.isSubmitting ? 'Saving…' : 'Save Employee'}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate('/employees')} className="px-4 py-2 rounded-full h-auto font-bold">
              Cancel
            </Button>
          </div>
            </form>
          </Form>
        </>
      )}
    </div>
    </>
  );
};

// ── Shared helpers ────────────────────────────────────────────────────────────

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <Card className="rounded-2xl border-border shadow-sm">
    <CardHeader className="pb-2">
      <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{title}</CardTitle>
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
);

// Generic FormField wrapper for simple cases
function FF({
  name, label, required, className, form, children,
}: {
  name: string;
  label: string;
  required?: boolean;
  className?: string;
  form: any;
  children: (field: any) => React.ReactNode;
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className={cn('flex flex-col gap-1.5', className)}>
          <FormLabel className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            {label}{required && <span className="text-red-400 ml-1">*</span>}
          </FormLabel>
          <FormControl>{children(field) as React.ReactElement}</FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export default EmployeeNew;
