import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Trash2, Loader, Edit, ChevronDown, ChevronUp,
  CheckCircle2, X, AlertCircle, Zap, Eye, ShieldCheck, RefreshCw,
} from 'lucide-react';
import { TransactionCodeAPI } from '../../api/client';
import { Dropdown } from '@/components/ui/dropdown';
import ConfirmModal from '../../components/common/ConfirmModal';

// ─── constants ────────────────────────────────────────────────────────────────

const TX_TYPES = ['EARNING', 'DEDUCTION', 'BENEFIT'] as const;
const CALC_TYPES = [
  { value: 'fixed', label: 'Fixed Amount', desc: 'A specific dollar amount every period' },
  { value: 'percentage', label: 'Percentage of Basic', desc: 'A % of the employee\'s base salary' },
  { value: 'formula', label: 'Formula (advanced)', desc: 'Custom expression using payroll variables' },
] as const;

const CONDITION_TYPES = [
  { value: 'always', label: 'Always apply' },
  { value: 'salary_above', label: 'If salary above threshold' },
  { value: 'grade', label: 'If employee grade matches' },
  { value: 'hours_above', label: 'If hours above threshold' },
];

const TYPE_COLOR: Record<string, string> = {
  EARNING: 'bg-emerald-50 text-emerald-700',
  DEDUCTION: 'bg-red-50 text-red-700',
  BENEFIT: 'bg-blue-50 text-blue-700',
};

const CALC_BADGE: Record<string, string> = {
  fixed: 'bg-muted text-muted-foreground',
  percentage: 'bg-purple-50 text-purple-700',
  formula: 'bg-orange-50 text-orange-700',
};

// ─── helpers ──────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  code: '', name: '', type: 'EARNING' as string, description: '',
  taxable: true, pensionable: true, preTax: false,
  affectsPaye: true, affectsNssa: true, affectsAidsLevy: true,
  calculationType: 'fixed', defaultValue: '', formula: '',
  isActive: true,
  incomeCategory: null as string | null,
};

function livePreview(form: typeof EMPTY_FORM, sampleSalary = 1000): string {
  const val = parseFloat(form.defaultValue) || 0;
  if (form.calculationType === 'fixed') {
    return `${form.type === 'DEDUCTION' ? '−' : '+'}${form.code || 'CODE'} = ${form.code ? '' : 'e.g. '}$${val.toFixed(2)}`;
  }
  if (form.calculationType === 'percentage') {
    const amount = (sampleSalary * val) / 100;
    return `${form.type === 'DEDUCTION' ? '−' : '+'}${form.code || 'CODE'} = ${val}% × $${sampleSalary} = $${amount.toFixed(2)}`;
  }
  if (form.calculationType === 'formula') {
    return `${form.code || 'CODE'} = eval(${form.formula || 'baseSalary * rate'})`;
  }
  return '—';
}

// ─── 4-step wizard modal ─────────────────────────────────────────────────────

interface WizardProps {
  editData?: any;
  onClose: () => void;
  onSaved: () => void;
}

const STEPS = ['Basics', 'Tax Rules', 'Calculation', 'Preview & Rules'];

const WizardModal: React.FC<WizardProps> = ({ editData, onClose, onSaved }) => {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<typeof EMPTY_FORM>(
    editData
      ? {
          code: editData.code,
          name: editData.name,
          type: editData.type,
          description: editData.description || '',
          taxable: editData.taxable,
          pensionable: editData.pensionable,
          preTax: editData.preTax,
          affectsPaye: editData.affectsPaye ?? true,
          affectsNssa: editData.affectsNssa ?? true,
          affectsAidsLevy: editData.affectsAidsLevy ?? true,
          calculationType: editData.calculationType || 'fixed',
          defaultValue: editData.defaultValue != null ? String(editData.defaultValue) : '',
          formula: editData.formula || '',
          isActive: editData.isActive ?? true,
          incomeCategory: editData.incomeCategory || null,
        }
      : { ...EMPTY_FORM }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [rules, setRules] = useState<any[]>(editData?.rules || []);
  const [ruleForm, setRuleForm] = useState({ conditionType: 'always', conditionValue: '', valueOverride: '', capAmount: '', description: '' });

  // Auto-configure flags when incomeCategory changes to a special category
  useEffect(() => {
    if (form.incomeCategory === 'MEDICAL_AID') {
      setForm(p => ({
        ...p,
        type: 'DEDUCTION',
        preTax: false,
        taxable: false,
        pensionable: false,
        affectsPaye: false,
        affectsNssa: false,
        affectsAidsLevy: false,
      }));
    } else if (form.incomeCategory === 'PENSION') {
      setForm(p => ({
        ...p,
        type: 'DEDUCTION',
        preTax: true,
        taxable: false,
      }));
    }
  }, [form.incomeCategory]);
  const [savingRule, setSavingRule] = useState(false);
  const [showRuleForm, setShowRuleForm] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        defaultValue: form.defaultValue !== '' ? parseFloat(form.defaultValue) : null,
        formula: form.formula || null,
      };
      if (editData) {
        await TransactionCodeAPI.update(editData.id, payload);
      } else {
        await TransactionCodeAPI.create(payload);
      }
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save');
      setSaving(false);
    }
  };

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editData) return;
    setSavingRule(true);
    try {
      const r = await TransactionCodeAPI.createRule(editData.id, {
        ...ruleForm,
        valueOverride: ruleForm.valueOverride !== '' ? parseFloat(ruleForm.valueOverride) : null,
        capAmount: ruleForm.capAmount !== '' ? parseFloat(ruleForm.capAmount) : null,
      });
      setRules((prev) => [...prev, r.data]);
      setRuleForm({ conditionType: 'always', conditionValue: '', valueOverride: '', capAmount: '', description: '' });
      setShowRuleForm(false);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to add rule');
    } finally {
      setSavingRule(false);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!editData) return;
    try {
      await TransactionCodeAPI.deleteRule(editData.id, ruleId);
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete rule');
    }
  };

  const canNext = () => {
    if (step === 1) return form.code.trim() && form.name.trim();
    if (step === 3) return form.calculationType !== 'formula' || form.formula.trim();
    return true;
  };

  const fieldClass = 'w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green';
  const checkRow = (label: string, key: string, hint?: string, locked?: boolean) => (
    <label className={`flex items-start gap-3 p-3 rounded-xl ${locked ? 'opacity-60 cursor-not-allowed' : 'hover:bg-muted cursor-pointer'}`}>
      <input
        type="checkbox"
        checked={(form as any)[key]}
        onChange={locked ? undefined : set(key)}
        disabled={locked}
        className="w-4 h-4 accent-accent-green mt-0.5 flex-shrink-0"
      />
      <div>
        <p className="text-sm font-medium text-navy">{label}{locked && <span className="ml-2 text-[10px] font-bold text-amber-600 uppercase tracking-wide">locked by category</span>}</p>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh] overflow-hidden">
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-bold text-lg">{editData ? 'Edit' : 'New'} Transaction Code</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground">
            <X size={18} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex px-6 pt-4 gap-0">
          {STEPS.map((label, i) => {
            const n = i + 1;
            const done = step > n;
            const active = step === n;
            return (
              <React.Fragment key={n}>
                <div className="flex flex-col items-center gap-1 flex-shrink-0">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    done ? 'bg-emerald-500 text-white' : active ? 'bg-accent-green text-white' : 'bg-muted text-muted-foreground'
                  }`}>
                    {done ? <CheckCircle2 size={13} /> : n}
                  </div>
                  <span className={`text-[9px] font-bold uppercase tracking-wider ${active ? 'text-accent-green' : 'text-muted-foreground'}`}>
                    {label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1 mt-3.5 ${step > n ? 'bg-emerald-400' : 'bg-border'}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <div className="flex items-center gap-2 p-3 mb-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
              <AlertCircle size={14} /> {error}
            </div>
          )}

          {/* Step 1: Basics */}
          {step === 1 && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Name *</label>
                <input value={form.name} onChange={set('name')} placeholder="e.g. Basic Salary" className={fieldClass} />
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Code *</label>
                <input
                  value={form.code}
                  onChange={set('code')}
                  placeholder="e.g. BASIC"
                  className={`${fieldClass} font-mono`}
                  disabled={!!editData}
                />
                <p className="text-xs text-muted-foreground mt-1">Auto-uppercased, no spaces. For ZIMRA compliance, medical aid codes should be numerical (e.g. 5401).</p>
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Category *</label>
                <div className="grid grid-cols-3 gap-2">
                  {TX_TYPES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, type: t }))}
                      className={`py-2.5 rounded-xl text-sm font-bold border transition-colors ${
                        form.type === t ? `${TYPE_COLOR[t]} border-current` : 'border-border text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Description</label>
                <input value={form.description} onChange={set('description')} placeholder="Optional" className={fieldClass} />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isActive} onChange={set('isActive')} className="w-4 h-4 accent-accent-green" />
                <span className="text-sm font-medium">Active (visible in payroll inputs)</span>
              </label>
            </div>
          )}

          {/* Step 2: Tax Rules */}
          {step === 2 && (
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground mb-3">Control how this code interacts with statutory calculations.</p>

              {/* Medical Aid info banner */}
              {form.incomeCategory === 'MEDICAL_AID' && (
                <div className="mb-3 p-3 rounded-xl bg-teal-50 border border-teal-200">
                  <p className="text-xs font-bold text-teal-700 mb-1">Medical Aid Provider Code</p>
                  <p className="text-xs text-teal-600">
                    Flags are locked to the correct ZIMRA configuration. A 50% PAYE tax credit will be
                    applied automatically on the contribution amount. You can create separate codes for
                    each provider — e.g. <strong>Cimas</strong>, <strong>Bonvie</strong>, <strong>First Mutual</strong> —
                    and assign the relevant one to each employee.
                  </p>
                </div>
              )}

              {/* Pension info banner */}
              {form.incomeCategory === 'PENSION' && (
                <div className="mb-3 p-3 rounded-xl bg-blue-50 border border-blue-200">
                  <p className="text-xs font-bold text-blue-700 mb-1">Pension / Retirement Fund Code</p>
                  <p className="text-xs text-blue-600">
                    Flags are locked. Contributions will be deducted pre-tax (reducing PAYE taxable income)
                    up to the ZIMRA annual cap of $5,400 / 12 = $450 per month.
                  </p>
                </div>
              )}

              {(() => {
                const isMedAid = form.incomeCategory === 'MEDICAL_AID';
                const isPension = form.incomeCategory === 'PENSION';
                const locked = isMedAid || isPension;
                return (
                  <>
                    {checkRow('Affects PAYE', 'affectsPaye', 'Amount is included in taxable income for PAYE calculation', isMedAid)}
                    {checkRow('Affects NSSA', 'affectsNssa', 'Amount is included in pensionable earnings for NSSA contribution', isMedAid)}
                    {checkRow('Affects AIDS Levy', 'affectsAidsLevy', 'Included in the AIDS Levy (3% of PAYE) base', isMedAid)}
                    <div className="border-t border-border my-2" />
                    {checkRow('Taxable', 'taxable', 'General taxable flag used by the payroll engine', locked)}
                    {checkRow('Pensionable', 'pensionable', 'Included in NSSA/pension contribution basis', isMedAid)}
                    {form.type === 'DEDUCTION' &&
                      checkRow('Pre-Tax Deduction', 'preTax', 'Deducted from gross before PAYE is calculated (e.g. approved pension schemes)', locked)}
                  </>
                );
              })()}

              <div className="mt-4">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Formal Tax Rule (ZIMRA)</label>
                <Dropdown className="w-full" trigger={(isOpen) => {
                  const cats: Record<string,string> = { '': 'None / Standard', BASIC_SALARY: 'Basic Salary', BONUS: 'Bonus', PENSION: 'Pension (Exempt)', MEDICAL_AID: 'Medical Aid (50% Tax Credit)', ALLOWANCE: 'Allowance', OVERTIME: 'Overtime', COMMISSION: 'Commission', BENEFIT: 'Benefit' };
                  return (
                    <button type="button" className="w-full flex items-center justify-between px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium text-foreground hover:border-accent-green transition-colors">
                      <span>{cats[form.incomeCategory || ''] || 'None / Standard'}</span>
                      <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                  );
                }} sections={[{ items: [
                  { label: 'None / Standard', onClick: () => setForm(p => ({ ...p, incomeCategory: null })) },
                  { label: 'Basic Salary', onClick: () => setForm(p => ({ ...p, incomeCategory: 'BASIC_SALARY' })) },
                  { label: 'Bonus', onClick: () => setForm(p => ({ ...p, incomeCategory: 'BONUS' })) },
                  { label: 'Pension (Exempt)', onClick: () => setForm(p => ({ ...p, incomeCategory: 'PENSION' })) },
                  { label: 'Medical Aid (50% Tax Credit)', onClick: () => setForm(p => ({ ...p, incomeCategory: 'MEDICAL_AID' })) },
                  { label: 'Allowance', onClick: () => setForm(p => ({ ...p, incomeCategory: 'ALLOWANCE' })) },
                  { label: 'Overtime', onClick: () => setForm(p => ({ ...p, incomeCategory: 'OVERTIME' })) },
                  { label: 'Commission', onClick: () => setForm(p => ({ ...p, incomeCategory: 'COMMISSION' })) },
                  { label: 'Benefit', onClick: () => setForm(p => ({ ...p, incomeCategory: 'BENEFIT' })) },
                ]}]} />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Select "Medical Aid" for any provider (Cimas, Bonvie, First Mutual, etc.) — flags are auto-configured.
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Calculation */}
          {step === 3 && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                {CALC_TYPES.map((ct) => (
                  <label
                    key={ct.value}
                    className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors ${
                      form.calculationType === ct.value ? 'border-accent-green bg-blue-50 dark:bg-blue-950/40' : 'border-border hover:bg-muted'
                    }`}
                  >
                    <input
                      type="radio"
                      name="calcType"
                      value={ct.value}
                      checked={form.calculationType === ct.value}
                      onChange={() => setForm((p) => ({ ...p, calculationType: ct.value }))}
                      className="mt-0.5 accent-green-600"
                    />
                    <div>
                      <p className="text-sm font-bold text-navy">{ct.label}</p>
                      <p className="text-xs text-muted-foreground">{ct.desc}</p>
                    </div>
                  </label>
                ))}
              </div>

              {form.calculationType === 'fixed' && (
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Default Amount</label>
                  <input type="number" min="0" step="0.01" value={form.defaultValue} onChange={set('defaultValue')} placeholder="0.00" className={fieldClass} />
                  <p className="text-xs text-muted-foreground mt-1">Can be overridden per employee in Payroll Inputs</p>
                </div>
              )}

              {form.calculationType === 'percentage' && (
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Percentage of Basic (%)</label>
                  <input type="number" min="0" max="100" step="0.01" value={form.defaultValue} onChange={set('defaultValue')} placeholder="e.g. 10" className={fieldClass} />
                </div>
              )}

              {form.calculationType === 'formula' && (
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Formula Expression *</label>
                  <textarea
                    value={form.formula}
                    onChange={set('formula')}
                    rows={3}
                    placeholder="e.g. baseSalary * 0.05 + overtime * 1.5"
                    className={`${fieldClass} font-mono resize-none`}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Variables: <code className="bg-muted px-1 rounded font-mono">baseSalary</code>{' '}
                    <code className="bg-muted px-1 rounded font-mono">overtime</code>{' '}
                    <code className="bg-muted px-1 rounded font-mono">hoursWorked</code>
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Preview & Rules */}
          {step === 4 && (
            <div className="flex flex-col gap-5">
              {/* Live preview */}
              <div className="p-4 bg-navy/5 border border-navy/10 rounded-xl">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Eye size={12} /> Live Preview (sample salary: $1,000)
                </p>
                <p className="font-mono text-sm font-bold text-navy">{livePreview(form, 1000)}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                  {form.affectsPaye && <span className="px-2 py-0.5 bg-red-50 text-red-600 rounded-full font-bold">Affects PAYE</span>}
                  {form.affectsNssa && <span className="px-2 py-0.5 bg-orange-50 text-orange-600 rounded-full font-bold">Affects NSSA</span>}
                  {form.preTax && <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full font-bold">Pre-Tax</span>}
                  {!form.taxable && <span className="px-2 py-0.5 bg-muted text-muted-foreground rounded-full font-bold">Non-Taxable</span>}
                </div>
              </div>

              {/* Rules — only editable after the TC exists */}
              {editData ? (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Zap size={12} /> Conditional Rules ({rules.length})
                    </p>
                    <button
                      onClick={() => setShowRuleForm((v) => !v)}
                      className="text-xs font-bold text-accent-green hover:underline flex items-center gap-1"
                    >
                      <Plus size={11} /> Add Rule
                    </button>
                  </div>

                  {showRuleForm && (
                    <form onSubmit={handleAddRule} className="mb-3 p-4 bg-muted/50 border border-border rounded-xl flex flex-col gap-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Condition</label>
                          <Dropdown className="w-full" trigger={(isOpen) => {
                            const ct = CONDITION_TYPES.find(c => c.value === ruleForm.conditionType);
                            return (
                              <button type="button" className="w-full flex items-center justify-between px-3 py-2 bg-background border border-border rounded-lg text-xs font-medium text-foreground hover:border-accent-green transition-colors">
                                <span>{ct?.label || ruleForm.conditionType}</span>
                                <ChevronDown size={12} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                              </button>
                            );
                          }} sections={[{ items: CONDITION_TYPES.map(c => ({ label: c.label, onClick: () => setRuleForm((p) => ({ ...p, conditionType: c.value })) })) }]} />
                        </div>
                        {ruleForm.conditionType !== 'always' && (
                          <div>
                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Condition Value</label>
                            <input value={ruleForm.conditionValue} onChange={(e) => setRuleForm((p) => ({ ...p, conditionValue: e.target.value }))}
                              placeholder="e.g. 700 or A" className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs font-medium text-foreground focus:outline-none" />
                          </div>
                        )}
                        <div>
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Override Value / Rate</label>
                          <input type="number" step="0.01" value={ruleForm.valueOverride} onChange={(e) => setRuleForm((p) => ({ ...p, valueOverride: e.target.value }))}
                            placeholder="e.g. 1.5 or 700" className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs font-medium text-foreground focus:outline-none" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Cap Amount</label>
                          <input type="number" step="0.01" value={ruleForm.capAmount} onChange={(e) => setRuleForm((p) => ({ ...p, capAmount: e.target.value }))}
                            placeholder="e.g. 700 (NSSA cap)" className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs font-medium text-foreground focus:outline-none" />
                        </div>
                      </div>
                      <input value={ruleForm.description} onChange={(e) => setRuleForm((p) => ({ ...p, description: e.target.value }))}
                        placeholder="Description (optional)" className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs font-medium text-foreground focus:outline-none" />
                      <div className="flex gap-2">
                        <button type="submit" disabled={savingRule} className="px-4 py-1.5 bg-brand text-navy rounded-full text-xs font-bold hover:opacity-90 disabled:opacity-60">
                          {savingRule ? 'Saving…' : 'Add Rule'}
                        </button>
                        <button type="button" onClick={() => setShowRuleForm(false)} className="px-4 py-1.5 border border-border rounded-full text-xs font-bold text-muted-foreground hover:bg-muted">
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}

                  {rules.length > 0 ? (
                    <div className="flex flex-col gap-1.5">
                      {rules.map((rule: any) => (
                        <div key={rule.id} className="flex items-start justify-between gap-2 px-3 py-2.5 bg-muted/50 border border-border rounded-xl">
                          <div>
                            <p className="text-xs font-bold text-navy">
                              {CONDITION_TYPES.find((c) => c.value === rule.conditionType)?.label ?? rule.conditionType}
                              {rule.conditionValue && ` = ${rule.conditionValue}`}
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {rule.valueOverride != null && `Override: ${rule.valueOverride}`}
                              {rule.capAmount != null && ` · Cap: ${rule.capAmount}`}
                              {rule.description && ` · ${rule.description}`}
                            </p>
                          </div>
                          <button onClick={() => handleDeleteRule(rule.id)} className="p-1 text-muted-foreground/40 hover:text-red-400 flex-shrink-0">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground py-2">No rules — this code applies its default calculation unconditionally.</p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground p-3 bg-muted/50 rounded-xl">
                  Save this code first, then re-open it to add conditional rules (e.g. NSSA cap, grade-based OT rates).
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer navigation */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border">
          <button
            onClick={() => step > 1 ? setStep(step - 1) : onClose()}
            className="px-4 py-2 rounded-full border border-border font-bold text-sm text-muted-foreground hover:bg-muted"
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </button>
          <div className="flex items-center gap-2">
            {step < 4 ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={!canNext()}
                className="flex items-center gap-1.5 bg-brand text-navy px-4 py-2 rounded-full font-bold text-sm shadow hover:opacity-90 disabled:opacity-50"
              >
                Next →
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 bg-brand text-navy px-4 py-2 rounded-full font-bold text-sm shadow hover:opacity-90 disabled:opacity-60"
              >
                <CheckCircle2 size={15} /> {saving ? 'Saving…' : editData ? 'Update Code' : 'Create Code'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── TaRMS audit panel ───────────────────────────────────────────────────────

const SEVERITY_STYLE: Record<string, string> = {
  error:   'bg-red-50 border-red-200 text-red-700',
  warning: 'bg-amber-50 border-amber-200 text-amber-700',
  info:    'bg-blue-50 border-blue-200 text-blue-600',
  ok:      'bg-emerald-50 border-emerald-200 text-emerald-700',
};

const SEVERITY_BADGE: Record<string, string> = {
  error:   'bg-red-100 text-red-700',
  warning: 'bg-amber-100 text-amber-700',
  info:    'bg-blue-100 text-blue-600',
  ok:      'bg-emerald-100 text-emerald-700',
};

const SEVERITY_LABEL: Record<string, string> = {
  error: 'Error', warning: 'Warning', info: 'Info', ok: 'OK',
};

const TYPE_COLOR_SMALL: Record<string, string> = {
  EARNING:   'bg-emerald-100 text-emerald-700',
  DEDUCTION: 'bg-red-100 text-red-700',
  BENEFIT:   'bg-blue-100 text-blue-700',
};

interface TarmsResult {
  id: string; code: string; name: string; type: string;
  incomeCategory: string | null; taxable: boolean;
  tarmsField: string; severity: string;
  issues: { severity: string; message: string }[];
}

interface TarmsAuditPanelProps { onClose: () => void; }

const TarmsAuditPanel: React.FC<TarmsAuditPanelProps> = ({ onClose }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ summary: any; codes: TarmsResult[] } | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<string>('');
  const [error, setError] = useState('');

  const run = () => {
    setLoading(true);
    setError('');
    TransactionCodeAPI.tarmsCheck()
      .then((r: any) => setData(r.data))
      .catch(() => setError('Failed to run TaRMS audit'))
      .finally(() => setLoading(false));
  };

  useEffect(run, []);

  const filtered = data
    ? (filterSeverity ? data.codes.filter((c) => c.severity === filterSeverity) : data.codes)
    : [];

  const FILTERS = ['', 'error', 'warning', 'info', 'ok'] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/30 p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Panel header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-accent-green" />
            <h2 className="font-bold text-lg">TaRMS Field Allocation Audit</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={run}
              disabled={loading}
              className="p-1.5 text-muted-foreground hover:text-navy hover:bg-muted rounded-lg disabled:opacity-40"
              title="Re-run audit"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Summary bar */}
        {data && (
          <div className="flex gap-3 px-6 py-3 border-b border-border bg-muted/40">
            {(['error', 'warning', 'info', 'ok'] as const).map((s) => (
              <div key={s} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold ${SEVERITY_STYLE[s]}`}>
                <span className="capitalize">{SEVERITY_LABEL[s]}</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[11px] ${SEVERITY_BADGE[s]}`}>
                  {s === 'error'   ? data.summary.errors   :
                   s === 'warning' ? data.summary.warnings :
                   s === 'info'    ? data.summary.info     : data.summary.ok}
                </span>
              </div>
            ))}
            <p className="ml-auto text-xs text-muted-foreground self-center">{data.summary.total} active codes</p>
          </div>
        )}

        {/* Severity filter pills */}
        {data && (
          <div className="flex gap-2 px-6 py-3 border-b border-border">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilterSeverity(f)}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                  filterSeverity === f ? 'bg-accent-green text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {f ? SEVERITY_LABEL[f] : 'All'}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading && (
            <div className="flex items-center justify-center h-40 text-muted-foreground">
              <Loader size={22} className="animate-spin" />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
              <AlertCircle size={14} /> {error}
            </div>
          )}

          {!loading && data && filtered.length === 0 && (
            <p className="text-center text-muted-foreground text-sm py-10">No codes match the selected filter.</p>
          )}

          {!loading && data && (
            <div className="flex flex-col gap-3">
              {filtered.map((c) => (
                <div
                  key={c.id}
                  className={`rounded-xl border p-4 ${SEVERITY_STYLE[c.severity]}`}
                >
                  {/* Code header */}
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-black text-sm text-navy">{c.code}</span>
                      <span className="text-sm font-medium text-foreground/80">{c.name}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${TYPE_COLOR_SMALL[c.type]}`}>{c.type}</span>
                      {c.incomeCategory && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                          {c.incomeCategory}
                        </span>
                      )}
                    </div>
                    <span className={`flex-shrink-0 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${SEVERITY_BADGE[c.severity]}`}>
                      {SEVERITY_LABEL[c.severity]}
                    </span>
                  </div>

                  {/* TaRMS field mapping */}
                  <div className="flex items-center gap-1.5 mb-2.5 text-xs font-medium text-foreground/80">
                    <span className="text-muted-foreground">TaRMS column →</span>
                    <span className="font-bold text-navy">{c.tarmsField}</span>
                  </div>

                  {/* Issues */}
                  {c.issues.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      {c.issues.map((issue, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                          <span>{issue.message}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {c.severity === 'ok' && (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                      <CheckCircle2 size={12} />
                      <span>Correctly mapped to TaRMS.</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer note */}
        <div className="px-6 py-3 border-t border-border bg-muted/40">
          <p className="text-[11px] text-muted-foreground">
            Audit checks active transaction codes only. Salary, NSSA, Medical Aid Credit, NEC, and Pension columns are sourced from payslip statutory fields — not transaction codes.
          </p>
        </div>
      </div>
    </div>
  );
};

// ─── main page ────────────────────────────────────────────────────────────────

const Transactions: React.FC = () => {
  const navigate = useNavigate();
  const [codes, setCodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [filterType, setFilterType] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [showTarmsAudit, setShowTarmsAudit] = useState(false);

  const load = () => {
    setLoading(true);
    TransactionCodeAPI.getAll()
      .then((r) => setCodes(r.data))
      .catch(() => setError('Failed to load transaction codes'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleDelete = (id: string) => setDeleteTarget(id);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await TransactionCodeAPI.delete(deleteTarget);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Cannot delete — it may be in use');
    } finally {
      setDeleteTarget(null);
    }
  };

  const openEdit = (tc: any) => {
    setEditTarget(tc);
    setShowWizard(true);
  };

  const openCreate = () => {
    setEditTarget(null);
    setShowWizard(true);
  };

  const filtered = filterType ? codes.filter((c) => c.type === filterType) : codes;

  const grouped = TX_TYPES.reduce<Record<string, any[]>>((acc, t) => {
    acc[t] = filtered.filter((c) => c.type === t);
    return acc;
  }, { EARNING: [], DEDUCTION: [], BENEFIT: [] });

  return (
    <div>
      {deleteTarget && (
        <ConfirmModal
          title="Delete Transaction Code"
          message="Are you sure you want to delete this transaction code? This cannot be undone."
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      {showTarmsAudit && <TarmsAuditPanel onClose={() => setShowTarmsAudit(false)} />}
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/utilities')} aria-label="Go back" className="p-2 hover:bg-muted rounded-xl">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold">Earnings & Deductions Library</h1>
            <p className="text-muted-foreground font-medium text-sm">Define calculation rules, tax flags, and conditional overrides</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTarmsAudit(true)}
            className="flex items-center gap-1.5 border border-border text-foreground/80 px-4 py-2.5 rounded-full text-sm font-bold hover:bg-muted"
            title="Check TaRMS field allocations for all transaction codes"
          >
            <ShieldCheck size={15} /> TaRMS Audit
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 bg-brand text-navy px-4 py-2 rounded-full text-sm font-bold shadow hover:opacity-90"
          >
            <Plus size={16} /> Create Code
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 mb-5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Type filter pills */}
      <div className="flex gap-2 mb-5">
        {['', ...TX_TYPES].map((t) => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${
              filterType === t ? 'bg-accent-green text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {t || 'All'} {t && `(${codes.filter((c) => c.type === t).length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground">
          <Loader size={24} className="animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {TX_TYPES.filter((t) => !filterType || t === filterType).map((type) => (
            grouped[type].length > 0 && (
              <div key={type} className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
                <div className={`px-5 py-3 border-b border-border flex items-center gap-2 ${
                  type === 'EARNING' ? 'bg-emerald-50/50' : type === 'DEDUCTION' ? 'bg-red-50/50' : 'bg-blue-50/50'
                }`}>
                  <span className={`text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded-full ${TYPE_COLOR[type]}`}>{type}</span>
                  <span className="text-xs text-muted-foreground font-medium">{grouped[type].length} code(s)</span>
                </div>
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      {['Code', 'Name', 'Calculation', 'Tax Flags', 'Rules', 'Active', ''].map((h) => (
                        <th key={h} className="px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {grouped[type].map((c: any) => (
                      <React.Fragment key={c.id}>
                        <tr
                          className="hover:bg-muted/30 cursor-pointer"
                          onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                        >
                          <td className="px-4 py-3">
                            <span className="font-mono font-black text-sm text-navy">{c.code}</span>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium">{c.name}</p>
                            {c.incomeCategory === 'MEDICAL_AID' && (
                              <p className="text-[10px] text-teal-600 font-semibold">Medical Aid Provider</p>
                            )}
                            {c.description && !c.incomeCategory && <p className="text-xs text-muted-foreground truncate max-w-[180px]">{c.description}</p>}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${CALC_BADGE[c.calculationType] || 'bg-muted text-muted-foreground'}`}>
                              {c.calculationType}
                            </span>
                            {c.defaultValue != null && (
                              <span className="ml-1.5 text-xs text-muted-foreground">
                                {c.calculationType === 'percentage' ? `${c.defaultValue}%` : `$${c.defaultValue}`}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1 flex-wrap">
                              {c.incomeCategory === 'MEDICAL_AID' && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 bg-teal-50 text-teal-700 rounded">MED AID</span>
                              )}
                              {c.incomeCategory === 'PENSION' && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">PENSION</span>
                              )}
                              {c.affectsPaye && <span className="text-[10px] font-bold px-1.5 py-0.5 bg-red-50 text-red-600 rounded">PAYE</span>}
                              {c.affectsNssa && <span className="text-[10px] font-bold px-1.5 py-0.5 bg-orange-50 text-orange-600 rounded">NSSA</span>}
                              {c.preTax && <span className="text-[10px] font-bold px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded">PRE-TAX</span>}
                              {!c.taxable && <span className="text-[10px] font-bold px-1.5 py-0.5 bg-muted text-muted-foreground rounded">EXEMPT</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {c.rules?.length > 0 ? (
                              <span className="text-xs font-bold text-purple-600 flex items-center gap-1">
                                <Zap size={11} /> {c.rules.length}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground/40">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.isActive ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}>
                              {c.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={(e) => { e.stopPropagation(); openEdit(c); }}
                                className="p-1.5 text-muted-foreground hover:text-navy hover:bg-muted rounded-lg"
                                title="Edit"
                              >
                                <Edit size={14} />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}
                                className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg"
                                title="Delete"
                              >
                                <Trash2 size={14} />
                              </button>
                              {expanded === c.id ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
                            </div>
                          </td>
                        </tr>

                        {/* Expanded detail row */}
                        {expanded === c.id && (
                          <tr>
                            <td colSpan={7} className="px-5 pb-4 bg-muted/30">
                              <div className="pt-3 grid grid-cols-2 gap-4 text-xs">
                                <div>
                                  <p className="font-bold text-muted-foreground uppercase tracking-wider mb-1">Calculation</p>
                                  <p className="font-mono text-foreground/80">{livePreview(c)}</p>
                                  {c.formula && <p className="font-mono text-muted-foreground mt-1">{c.formula}</p>}
                                </div>
                                <div>
                                  <p className="font-bold text-muted-foreground uppercase tracking-wider mb-1">Statutory Flags</p>
                                  <div className="flex flex-col gap-0.5 text-foreground/80">
                                    {c.incomeCategory === 'MEDICAL_AID' && (
                                      <span className="text-teal-700 font-bold text-xs mb-1">⚕ Medical Aid — 50% PAYE credit applied</span>
                                    )}
                                    {c.incomeCategory === 'PENSION' && (
                                      <span className="text-blue-700 font-bold text-xs mb-1">🏦 Pension — pre-tax, capped at $450/month</span>
                                    )}
                                    <span>{c.taxable ? '✓' : '✗'} Taxable</span>
                                    <span>{c.pensionable ? '✓' : '✗'} Pensionable</span>
                                    <span>{c.affectsPaye ? '✓' : '✗'} Affects PAYE</span>
                                    <span>{c.affectsNssa ? '✓' : '✗'} Affects NSSA</span>
                                    <span>{c.affectsAidsLevy ? '✓' : '✗'} Affects AIDS Levy</span>
                                    {c.type === 'DEDUCTION' && <span>{c.preTax ? '✓' : '✗'} Pre-Tax</span>}
                                  </div>
                                </div>
                                {c.rules?.length > 0 && (
                                  <div className="col-span-2">
                                    <p className="font-bold text-muted-foreground uppercase tracking-wider mb-1">Conditional Rules</p>
                                    <div className="flex flex-col gap-1">
                                      {c.rules.map((r: any) => (
                                        <div key={r.id} className="px-3 py-2 bg-background border border-border rounded-lg">
                                          <span className="font-bold">{CONDITION_TYPES.find((ct) => ct.value === r.conditionType)?.label}</span>
                                          {r.conditionValue && <span> = {r.conditionValue}</span>}
                                          {r.valueOverride != null && <span className="text-purple-600"> → override: {r.valueOverride}</span>}
                                          {r.capAmount != null && <span className="text-orange-600"> · cap: {r.capAmount}</span>}
                                          {r.description && <span className="text-muted-foreground"> · {r.description}</span>}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ))}

          {filtered.length === 0 && (
            <div className="text-center py-16 bg-primary rounded-2xl border border-border">
              <p className="font-bold text-muted-foreground mb-1">No transaction codes yet</p>
              <p className="text-sm text-muted-foreground mb-5">Create codes to define earnings, deductions, and benefits</p>
              <button onClick={openCreate} className="inline-flex items-center gap-1.5 bg-brand text-navy px-4 py-2 rounded-full font-bold text-sm shadow hover:opacity-90">
                <Plus size={15} /> Create First Code
              </button>
            </div>
          )}
        </div>
      )}

      {showWizard && (
        <WizardModal
          editData={editTarget}
          onClose={() => { setShowWizard(false); setEditTarget(null); }}
          onSaved={() => { setShowWizard(false); setEditTarget(null); load(); }}
        />
      )}
    </div>
  );
};

export default Transactions;
