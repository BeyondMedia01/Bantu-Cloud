import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Save, X, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';

import { EmployeeAPI, BranchAPI, DepartmentAPI, TaxTableAPI, SystemSettingsAPI } from '../api/client';
import { getActiveCompanyId } from '../lib/companyContext';

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

// ── Zod Schema ───────────────────────────────────────────────────────────────

const bankAccountSchema = z.object({
  accountName: z.string().optional(),
  accountNumber: z.string().regex(/^\d+$/, 'Must contain only digits').min(1, 'Required'),
  bankName: z.string().min(1, 'Required'),
  bankBranch: z.string().optional(),
  branchCode: z.string().optional(),
  splitType: z.enum(['REMAINDER', 'FIXED', 'PERCENTAGE']),
  splitValue: z.coerce.number().min(0),
  priority: z.number(),
  currency: z.enum(['USD', 'ZiG']),
});

const schema = z.object({
  // Personal
  employeeCode: z.string().min(1, 'Required'),
  title: z.string().optional(),
  firstName: z.string().min(1, 'Required'),
  lastName: z.string().min(1, 'Required'),
  maidenName: z.string().optional(),
  nationality: z.string().min(1, 'Required'),
  nationalId: z.string().optional(),
  passportNumber: z.string().optional(),
  email: z.string().email('Invalid email').or(z.literal('')).optional(),
  phone: z.string().optional(),
  dateOfBirth: z.date(),
  gender: z.string().min(1, 'Required'),
  maritalStatus: z.string().min(1, 'Required'),
  homeAddress: z.string().optional(),
  postalAddress: z.string().optional(),
  nextOfKinName: z.string().optional(),
  nextOfKinContact: z.string().optional(),
  socialSecurityNum: z.string().optional(),
  // Work
  startDate: z.date(),
  occupation: z.string().optional(),
  position: z.string().min(1, 'Required'),
  departmentId: z.string().optional(),
  branchId: z.string().optional(),
  costCenter: z.string().optional(),
  grade: z.string().optional(),
  employmentType: z.enum(['PERMANENT', 'CONTRACT', 'TEMPORARY', 'PART_TIME']),
  leaveEntitlement: z.coerce.number().optional(),
  dischargeDate: z.date().optional(),
  dischargeReason: z.string().optional(),
  // Pay
  paymentMethod: z.enum(['BANK', 'CASH']),
  paymentBasis: z.enum(['MONTHLY', 'DAILY', 'HOURLY']),
  rateSource: z.enum(['MANUAL', 'NEC_GRADE']),
  baseRate: z.coerce.number().min(0, 'Must be ≥ 0'),
  currency: z.enum(['USD', 'ZiG']),
  hoursPerPeriod: z.coerce.number().optional(),
  daysPerPeriod: z.coerce.number().optional(),
  bankAccounts: z.array(bankAccountSchema),
  // Tax
  taxDirectivePerc: z.coerce.number().min(0).max(100).optional(),
  taxDirectiveAmt: z.coerce.number().min(0).optional(),
  taxMethod: z.enum(['NON_FDS', 'FDS_AVERAGE', 'FDS_FORECASTING']),
  taxTable: z.string().min(1, 'Required'),
  accumulativeSetting: z.enum(['YES', 'NO']),
  taxCredits: z.coerce.number().min(0).optional(),
  tin: z.string().optional(),
  motorVehicleBenefit: z.coerce.number().min(0).optional(),
  motorVehicleType: z.string().optional(),
  // Leave
  annualLeaveAccrued: z.coerce.number().min(0).optional(),
  annualLeaveTaken: z.coerce.number().min(0).optional(),
  // Split basic salary
  splitZigMode: z.enum(['NONE', 'FIXED', 'PERCENTAGE']),
  splitZigValue: z.coerce.number().optional(),
}).superRefine((data, ctx) => {
  if (data.nationality === 'Zimbabwean' && !data.nationalId) {
    ctx.addIssue({ code: 'custom', message: 'Required for Zimbabwean nationals', path: ['nationalId'] });
  }
  if (data.paymentMethod === 'BANK' && data.bankAccounts.length === 0) {
    ctx.addIssue({ code: 'custom', message: 'At least one bank account required', path: ['bankAccounts'] });
  }
});

type FormValues = z.infer<typeof schema>;

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
          'flex h-10 w-full items-center justify-start rounded-xl border border-border bg-slate-50 px-4 py-2 text-sm font-medium outline-none transition-all hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-accent-blue/20',
          !value && 'text-slate-400',
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

  const { data: branches = [] } = useQuery({
    queryKey: ['branches', companyId],
    queryFn: () => BranchAPI.getAll({ companyId: companyId! }).then(r => r.data),
    enabled: !!companyId,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments', companyId],
    queryFn: () => DepartmentAPI.getAll({ companyId: companyId! }).then(r => r.data),
    enabled: !!companyId,
  });

  const { data: taxTables = [] } = useQuery({
    queryKey: ['taxTables'],
    queryFn: () => TaxTableAPI.getAll().then(r => r.data),
  });

  const { data: systemSettings = [] } = useQuery({
    queryKey: ['systemSettings'],
    queryFn: () => SystemSettingsAPI.getAll().then(r => r.data),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as any,
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

  // Set default tax table once system settings load
  useEffect(() => {
    if ((systemSettings as any[]).length > 0 && !form.getValues('taxTable')) {
      const defaultSetting = (systemSettings as any[])
        .filter((s: any) => s.settingName === 'DEFAULT_TAX_TABLE_USD' && s.isActive)
        .sort((a: any, b: any) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime())[0];
      if (defaultSetting) form.setValue('taxTable', defaultSetting.settingValue);
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

  const onSubmit = async (values: FormValues) => {
    setSubmitError('');
    try {
      await EmployeeAPI.create({
        ...values,
        dateOfBirth: values.dateOfBirth.toISOString(),
        startDate: values.startDate.toISOString(),
        dischargeDate: values.dischargeDate?.toISOString(),
        companyId: companyId ?? undefined,
        bankAccounts: values.paymentMethod === 'BANK' ? values.bankAccounts : [],
      } as any);
      navigate('/employees');
    } catch (err: any) {
      setSubmitError(err.response?.data?.message || 'Failed to create employee');
    }
  };

  const paymentMethod = form.watch('paymentMethod');
  const nationality = form.watch('nationality');
  const taxMethod = form.watch('taxMethod');

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate('/employees')} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold">New Employee</h1>
          <p className="text-slate-500 font-medium text-sm">Add a new employee to your company</p>
        </div>
      </div>

      {submitError && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium">{submitError}</div>
      )}

      {/* Tab bar */}
      <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl mb-8 w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`relative px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === t.id ? 'bg-white text-navy shadow-sm' : 'text-slate-500 hover:text-navy'
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
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-8">

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
                  {(field) => <Input {...field} placeholder={nationality === 'Zimbabwean' ? 'e.g. 63-123456A78' : 'National ID'} />}
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
                    <FormLabel className="text-xs font-bold text-slate-400 uppercase tracking-wider">
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
                    <FormLabel className="text-xs font-bold text-slate-400 uppercase tracking-wider">
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
                        {(departments as any[]).map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </FF>
                <FF name="branchId" label="Branch" form={form}>
                  {(field) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger><SelectValue placeholder="— None —" /></SelectTrigger>
                      <SelectContent>
                        {(branches as any[]).map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
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
                    <FormLabel className="text-xs font-bold text-slate-400 uppercase tracking-wider">Discharge Date</FormLabel>
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
              <div className="bg-emerald-50/30 border border-emerald-100/50 p-6 rounded-2xl mb-6">
                <h4 className="text-xs font-bold text-emerald-700 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                  ZiG Basic Salary Splitting (ZIMRA Apportionment)
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <FF name="splitZigMode" label="ZiG Portion Mode" form={form}>
                    {(field) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger className="bg-white border-emerald-100"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NONE">None (100% USD)</SelectItem>
                          <SelectItem value="PERCENTAGE">Percentage of USD Basic</SelectItem>
                          <SelectItem value="FIXED">Fixed ZiG Amount</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </FF>
                  {form.watch('splitZigMode') !== 'NONE' && (
                    <FF name="splitZigValue" label={form.watch('splitZigMode') === 'PERCENTAGE' ? 'ZiG Portion (%)' : 'ZiG Amount'} form={form} required>
                      {(field) => <Input {...field} type="number" step="0.01" className="bg-white border-emerald-100 font-bold text-emerald-700" />}
                    </FF>
                  )}
                </div>
                <p className="mt-4 text-[10px] text-emerald-600/70 leading-relaxed font-medium">
                  {form.watch('splitZigMode') === 'PERCENTAGE' && "The ZiG basic will be calculated as a percentage of the USD base rate. The remainder stays as USD basic."}
                  {form.watch('splitZigMode') === 'FIXED' && "The ZiG basic is fixed. The USD basic will be the total USD base rate minus the USD-equivalent of this ZiG amount."}
                  {form.watch('splitZigMode') === 'NONE' && "The employee is paid entirely in the primary currency selected above."}
                </p>
              </div>

              {paymentMethod === 'BANK' && (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between border-b pb-2 mb-2">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Bank Accounts & Splitting</h4>
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
                    return (
                      <div key={field.id} className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 relative group transition-all hover:bg-slate-50">
                        {bankAccountFields.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeAccount(index)}
                            className="absolute -right-2 -top-2 bg-white border border-red-100 shadow-sm rounded-full p-1 text-red-400 hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
                          >
                            <X size={14} />
                          </button>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Bank Name</label>
                            <input
                              list="zw-banks"
                              {...form.register(`bankAccounts.${index}.bankName`)}
                              className="w-full px-3 py-2 bg-white border border-border rounded-lg text-sm font-medium focus:ring-2 focus:ring-accent-blue/10 focus:border-accent-blue outline-none transition-all"
                              placeholder="Search or type bank name"
                            />
                            {errors.bankAccounts?.[index]?.bankName && (
                              <p className="text-xs text-red-500">{errors.bankAccounts[index]?.bankName?.message}</p>
                            )}
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Account Number</label>
                            <input
                              {...form.register(`bankAccounts.${index}.accountNumber`)}
                              className="w-full px-3 py-2 bg-white border border-border rounded-lg text-sm font-medium focus:ring-2 focus:ring-accent-blue/10 focus:border-accent-blue outline-none transition-all"
                              placeholder="000000000"
                            />
                            {errors.bankAccounts?.[index]?.accountNumber && (
                              <p className="text-xs text-red-500">{errors.bankAccounts[index]?.accountNumber?.message}</p>
                            )}
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Account Name</label>
                            <input
                              {...form.register(`bankAccounts.${index}.accountName`)}
                              className="w-full px-3 py-2 bg-white border border-border rounded-lg text-sm font-medium focus:ring-2 focus:ring-accent-blue/10 focus:border-accent-blue outline-none transition-all"
                              placeholder="Holder Name"
                            />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Split Mode</label>
                            <select
                              {...form.register(`bankAccounts.${index}.splitType`)}
                              className="w-full px-3 py-2 bg-white border border-border rounded-lg text-sm font-bold text-navy focus:ring-2 focus:ring-accent-blue/10 focus:border-accent-blue outline-none transition-all"
                            >
                              <option value="REMAINDER">Remainder</option>
                              <option value="FIXED">Fixed Amount</option>
                              <option value="PERCENTAGE">Percentage (%)</option>
                            </select>
                            <p className="text-[10px] text-slate-400 leading-snug">
                              {splitType === 'REMAINDER' && 'Receives everything left after other splits.'}
                              {splitType === 'FIXED' && 'A fixed currency amount is paid to this account.'}
                              {splitType === 'PERCENTAGE' && 'A percentage of net pay is paid to this account.'}
                            </p>
                          </div>
                          {splitType !== 'REMAINDER' && (
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Split Value</label>
                              <input
                                type="number"
                                step="0.01"
                                {...form.register(`bankAccounts.${index}.splitValue`)}
                                className="w-full px-3 py-2 bg-white border border-border rounded-lg text-sm font-bold text-accent-blue focus:ring-2 focus:ring-accent-blue/10 focus:border-accent-blue outline-none transition-all"
                              />
                            </div>
                          )}
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Account Currency</label>
                            <select
                              {...form.register(`bankAccounts.${index}.currency`)}
                              className="w-full px-3 py-2 bg-white border border-border rounded-lg text-sm font-medium focus:ring-2 focus:ring-accent-blue/10 focus:border-accent-blue outline-none transition-all"
                            >
                              <option value="USD">USD</option>
                              <option value="ZiG">ZiG</option>
                            </select>
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
                    <FormLabel className="text-xs font-bold text-slate-400 uppercase tracking-wider">
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
                    <p className="text-[10px] text-slate-400 leading-snug">
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
                        {(taxTables as any[]).map((t: any) => (
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
              className="flex items-center gap-2 bg-brand text-navy px-8 py-3 rounded-full font-bold shadow hover:opacity-90 transition-opacity disabled:opacity-60 h-auto"
            >
              <Save size={16} /> {form.formState.isSubmitting ? 'Saving…' : 'Save Employee'}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate('/employees')} className="px-6 py-3 rounded-full h-auto font-bold">
              Cancel
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
};

// ── Shared helpers ────────────────────────────────────────────────────────────

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <Card className="rounded-2xl border-border shadow-sm">
    <CardHeader className="pb-2">
      <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-400">{title}</CardTitle>
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
          <FormLabel className="text-xs font-bold text-slate-400 uppercase tracking-wider">
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
