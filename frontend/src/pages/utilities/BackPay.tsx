import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, CheckCircle2, RefreshCw, Zap,
  ChevronDown, ChevronUp, Users, CalendarDays, Banknote, AlertCircle,
} from 'lucide-react';
import { UtilitiesAPI, EmployeeAPI } from '../../api/client';
import { Dropdown } from '@/components/ui/dropdown';

// ─── types ───────────────────────────────────────────────────────────────────

interface EmployeeRate {
  employeeId: string;
  oldRate: string;
  newRate: string;
}

interface RunBreakdown {
  runId: string;
  runDate: string;
  shortfall: number;
}

interface PreviewResult {
  employeeId: string;
  name: string;
  employeeCode: string;
  oldRate: number;
  newRate: number;
  runBreakdown: RunBreakdown[];
  affectedRunCount: number;
  totalGross: number;
  taxEstimate: number;
  netEstimate: number;
  note?: string;
}

interface PreviewData {
  affectedRuns: { id: string; runDate: string }[];
  results: PreviewResult[];
  summary: { totalEmployees: number; totalRuns: number; totalGross: number; currency: string };
}

interface CommitInput {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  totalShortfall: number;
  affectedRunCount: number;
  currency: string;
  period: string;
  notes: string;
}

interface CommitData {
  transactionCodeName: string;
  inputs: CommitInput[];
  period: string;
  message: string;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number, cur = 'USD') =>
  `${cur} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });

const STEP_LABELS = ['Parameters', 'Employees', 'Preview', 'Done'];

// ─── step indicator ──────────────────────────────────────────────────────────

const StepBar: React.FC<{ step: number }> = ({ step }) => (
  <div className="flex items-center gap-0 mb-8">
    {STEP_LABELS.map((label, i) => {
      const n = i + 1;
      const done = step > n;
      const active = step === n;
      return (
        <React.Fragment key={n}>
          <div className="flex flex-col items-center gap-1">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold
                ${done ? 'bg-emerald-500 text-white' : active ? 'bg-accent-blue text-white' : 'bg-slate-100 text-slate-400'}`}
            >
              {done ? <CheckCircle2 size={14} /> : n}
            </div>
            <span className={`text-[10px] font-bold uppercase tracking-wider ${active ? 'text-accent-blue' : 'text-slate-400'}`}>
              {label}
            </span>
          </div>
          {i < STEP_LABELS.length - 1 && (
            <div className={`flex-1 h-0.5 mx-2 mb-4 ${step > n ? 'bg-emerald-400' : 'bg-slate-200'}`} />
          )}
        </React.Fragment>
      );
    })}
  </div>
);

// ─── main component ──────────────────────────────────────────────────────────

const BackPay: React.FC = () => {
  const navigate = useNavigate();

  // wizard state
  const [step, setStep] = useState(1);

  // step 1
  const [effectiveDate, setEffectiveDate] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [rateMode, setRateMode] = useState<'uniform' | 'individual'>('uniform');
  const [uniformNewRate, setUniformNewRate] = useState('');

  // step 2
  const [employees, setEmployees] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [empRates, setEmpRates] = useState<Record<string, EmployeeRate>>({});
  const [expandedEmp, setExpandedEmp] = useState<string | null>(null);

  // step 3
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // step 4
  const [commit, setCommit] = useState<CommitData | null>(null);
  const [commitLoading, setCommitLoading] = useState(false);

  const [error, setError] = useState('');

  useEffect(() => {
    EmployeeAPI.getAll({ limit: '500' })
      .then((r) => setEmployees(r.data?.data || r.data || []))
      .catch(() => {});
  }, []);

  // ── helpers ────────────────────────────────────────────────────────────────

  const toggleEmployee = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
    if (!empRates[id]) {
      const emp = employees.find((e) => e.id === id);
      setEmpRates((prev) => ({
        ...prev,
        [id]: { employeeId: id, oldRate: String(emp?.baseRate ?? ''), newRate: '' },
      }));
    }
  };

  const updateEmpRate = (id: string, field: 'oldRate' | 'newRate', value: string) =>
    setEmpRates((prev) => ({ ...prev, [id]: { ...prev[id], employeeId: id, [field]: value } }));

  const buildPayload = () => {
    const base: any = { effectiveDate, employeeIds: selected, currency };
    if (rateMode === 'uniform') {
      base.uniformNewRate = parseFloat(uniformNewRate);
    } else {
      base.employeeRates = selected.map((id) => ({
        employeeId: id,
        oldRate: parseFloat(empRates[id]?.oldRate || '0'),
        newRate: parseFloat(empRates[id]?.newRate || '0'),
      }));
    }
    return base;
  };

  // ── navigation ─────────────────────────────────────────────────────────────

  const goStep1to2 = () => {
    if (!effectiveDate) return setError('Please select an effective date');
    if (rateMode === 'uniform' && !uniformNewRate) return setError('Please enter the new base rate');
    setError('');
    setStep(2);
  };

  const goStep2to3 = async () => {
    if (selected.length === 0) return setError('Select at least one employee');
    if (rateMode === 'individual') {
      const missing = selected.some((id) => !empRates[id]?.newRate);
      if (missing) return setError('Enter new rate for all selected employees');
    }
    setError('');
    setPreviewLoading(true);
    try {
      const res = await UtilitiesAPI.backPay(buildPayload());
      setPreview(res.data);
      setStep(3);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to calculate back pay');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleCommit = async () => {
    setError('');
    setCommitLoading(true);
    try {
      const res = await UtilitiesAPI.backPayCommit(buildPayload());
      setCommit(res.data);
      setStep(4);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to generate back-pay inputs');
    } finally {
      setCommitLoading(false);
    }
  };

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate('/utilities')} aria-label="Go back" className="p-2 hover:bg-slate-100 rounded-xl">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold">Retroactive Pay Wizard</h1>
          <p className="text-slate-500 font-medium text-sm">
            Calculate shortfalls from a past rate change and generate back-pay inputs for the current payroll run
          </p>
        </div>
      </div>

      <StepBar step={step} />

      {error && (
        <div className="flex items-center gap-2 p-3 mb-5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {/* ── Step 1: Parameters ──────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="bg-primary rounded-2xl border border-border p-6 shadow-sm flex flex-col gap-5">
          <h3 className="font-bold text-sm uppercase tracking-wider text-slate-400">Rate Change Parameters</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                Effective Date <span className="text-red-400">*</span>
              </label>
              <input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue"
              />
              <p className="text-xs text-slate-400 mt-1">All COMPLETED payroll runs on or after this date will be included</p>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Currency</label>
              <Dropdown className="w-full" trigger={(isOpen) => (
                <button type="button" className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 border border-border rounded-xl text-sm font-medium hover:border-accent-blue transition-colors">
                  <span>{currency}</span>
                  <ChevronDown size={14} className={`text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
              )} sections={[{ items: [
                { label: 'USD', onClick: () => setCurrency('USD') },
                { label: 'ZiG', onClick: () => setCurrency('ZiG') },
              ]}]} />
            </div>
          </div>

          {/* Rate mode */}
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Rate Mode</label>
            <div className="flex gap-3">
              {(['uniform', 'individual'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setRateMode(mode)}
                  className={`px-4 py-2 rounded-xl text-sm font-bold border transition-colors ${
                    rateMode === mode
                      ? 'bg-accent-blue text-white border-accent-blue'
                      : 'bg-slate-50 text-slate-500 border-border hover:border-accent-blue'
                  }`}
                >
                  {mode === 'uniform' ? 'Uniform rate for all' : 'Per-employee rates'}
                </button>
              ))}
            </div>
          </div>

          {rateMode === 'uniform' && (
            <div className="max-w-xs">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                New Base Rate ({currency}) <span className="text-red-400">*</span>
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={uniformNewRate}
                onChange={(e) => setUniformNewRate(e.target.value)}
                placeholder="e.g. 2000"
                className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue"
              />
              <p className="text-xs text-slate-400 mt-1">Old rate will be taken from each employee's current base rate</p>
            </div>
          )}

          {rateMode === 'individual' && (
            <p className="text-xs text-slate-400">
              You will enter old and new rates per employee on the next screen.
            </p>
          )}

          <div className="pt-2">
            <button
              onClick={goStep1to2}
              className="flex items-center gap-1.5 bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90"
            >
              Next: Select Employees <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Employee selection ──────────────────────────────────────── */}
      {step === 2 && (
        <div className="flex flex-col gap-5">
          <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-bold text-sm uppercase tracking-wider text-slate-400">
                <Users size={14} className="inline mr-1.5 mb-0.5" />
                Select Employees ({selected.length} selected)
              </h3>
              <button
                onClick={() => {
                  if (selected.length === employees.length) {
                    setSelected([]);
                  } else {
                    const all = employees.map((e) => e.id);
                    setSelected(all);
                    setEmpRates((prev) => {
                      const next = { ...prev };
                      for (const emp of employees) {
                        if (!next[emp.id]) {
                          next[emp.id] = { employeeId: emp.id, oldRate: String(emp.baseRate ?? ''), newRate: '' };
                        }
                      }
                      return next;
                    });
                  }
                }}
                className="text-xs font-bold text-accent-blue hover:underline"
              >
                {selected.length === employees.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-border">
              {employees.map((emp: any) => {
                const isSelected = selected.includes(emp.id);
                const rates = empRates[emp.id];
                const isExpanded = expandedEmp === emp.id;

                return (
                  <div key={emp.id}>
                    <label className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleEmployee(emp.id)}
                        className="w-4 h-4 accent-accent-blue flex-shrink-0"
                      />
                      <span className="font-medium text-sm flex-1">
                        {emp.firstName} {emp.lastName}
                      </span>
                      <span className="text-xs text-slate-400 font-semibold">{emp.employeeCode}</span>
                      {rateMode === 'individual' && isSelected && (
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); setExpandedEmp(isExpanded ? null : emp.id); }}
                          className="ml-2 text-accent-blue hover:text-navy"
                        >
                          {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        </button>
                      )}
                    </label>

                    {rateMode === 'individual' && isSelected && isExpanded && (
                      <div className="px-11 pb-3 flex gap-4 bg-blue-50/40">
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Old Rate</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={rates?.oldRate ?? ''}
                            onChange={(e) => updateEmpRate(emp.id, 'oldRate', e.target.value)}
                            className="w-28 px-3 py-2 bg-white border border-border rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/20"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">New Rate</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={rates?.newRate ?? ''}
                            onChange={(e) => updateEmpRate(emp.id, 'newRate', e.target.value)}
                            placeholder="Required"
                            className="w-28 px-3 py-2 bg-white border border-border rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/20"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => { setError(''); setStep(1); }} className="px-4 py-2 rounded-full font-bold border border-border hover:bg-slate-50 text-sm">
              Back
            </button>
            <button
              onClick={goStep2to3}
              disabled={previewLoading}
              className="flex items-center gap-1.5 bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 disabled:opacity-60 text-sm"
            >
              {previewLoading ? (
                <><RefreshCw size={15} className="animate-spin" /> Calculating…</>
              ) : (
                <>Preview Shortfalls <ArrowRight size={15} /></>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Preview ─────────────────────────────────────────────────── */}
      {step === 3 && preview && (
        <div className="flex flex-col gap-5">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-primary rounded-2xl border border-border p-4 shadow-sm text-center">
              <CalendarDays size={20} className="mx-auto mb-1 text-blue-500" />
              <p className="text-2xl font-bold text-navy">{preview.summary.totalRuns}</p>
              <p className="text-xs text-slate-400 font-semibold mt-0.5">Affected Runs</p>
            </div>
            <div className="bg-primary rounded-2xl border border-border p-4 shadow-sm text-center">
              <Users size={20} className="mx-auto mb-1 text-purple-500" />
              <p className="text-2xl font-bold text-navy">{preview.summary.totalEmployees}</p>
              <p className="text-xs text-slate-400 font-semibold mt-0.5">Employees Owed</p>
            </div>
            <div className="bg-primary rounded-2xl border border-border p-4 shadow-sm text-center">
              <Banknote size={20} className="mx-auto mb-1 text-emerald-500" />
              <p className="text-2xl font-bold text-navy">
                {preview.summary.totalGross.toFixed(2)}
              </p>
              <p className="text-xs text-slate-400 font-semibold mt-0.5">Total Gross ({preview.summary.currency})</p>
            </div>
          </div>

          {/* Affected run pills */}
          {preview.affectedRuns.length > 0 && (
            <div className="bg-primary rounded-2xl border border-border p-4 shadow-sm">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Affected Payroll Runs</p>
              <div className="flex flex-wrap gap-2">
                {preview.affectedRuns.map((r) => (
                  <span key={r.id} className="px-3 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded-full">
                    {fmtDate(r.runDate)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Per-employee table */}
          <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-slate-50">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Per-Employee Shortfall</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border">
                    {['Employee', 'Old Rate', 'New Rate', 'Runs', 'Gross Back Pay', 'Tax (est.)', 'Net (est.)'].map((h) => (
                      <th key={h} className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {preview.results.map((r) => (
                    <React.Fragment key={r.employeeId}>
                      <tr
                        className={`hover:bg-slate-50/50 transition-colors ${r.totalGross > 0 ? 'cursor-pointer' : ''}`}
                        onClick={() => r.totalGross > 0 && setExpandedEmp(expandedEmp === r.employeeId ? null : r.employeeId)}
                      >
                        <td className="px-4 py-3">
                          <p className="text-sm font-bold">{r.name}</p>
                          <p className="text-xs text-slate-400">{r.employeeCode}</p>
                        </td>
                        <td className="px-4 py-3 text-sm">{currency} {r.oldRate.toFixed(2)}</td>
                        <td className="px-4 py-3 text-sm font-bold text-emerald-700">{currency} {r.newRate.toFixed(2)}</td>
                        <td className="px-4 py-3 text-sm">{r.affectedRunCount}</td>
                        <td className="px-4 py-3 text-sm font-bold">
                          {r.totalGross > 0 ? fmt(r.totalGross, currency) : <span className="text-slate-400 text-xs">{r.note || '—'}</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-red-500">{r.totalGross > 0 ? fmt(r.taxEstimate, currency) : '—'}</td>
                        <td className="px-4 py-3 text-sm font-bold text-emerald-700">{r.totalGross > 0 ? fmt(r.netEstimate, currency) : '—'}</td>
                      </tr>
                      {expandedEmp === r.employeeId && r.runBreakdown.length > 0 && (
                        <tr>
                          <td colSpan={7} className="px-4 pb-3 bg-blue-50/40">
                            <div className="flex flex-wrap gap-2 pt-2">
                              {r.runBreakdown.map((rb) => (
                                <span key={rb.runId} className="text-xs px-2.5 py-1 bg-white border border-border rounded-lg font-medium text-slate-600">
                                  {fmtDate(rb.runDate)}: +{currency} {rb.shortfall.toFixed(2)}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 font-medium">
            Tax estimates are for reference only and are calculated on the lump-sum back-pay amount.
            Actual PAYE will be computed by the payroll engine when the run is processed.
          </div>

          <div className="flex gap-3">
            <button onClick={() => { setError(''); setStep(2); }} className="px-4 py-2 rounded-full font-bold border border-border hover:bg-slate-50 text-sm">
              Back
            </button>
            {preview.summary.totalEmployees > 0 && (
              <button
                onClick={handleCommit}
                disabled={commitLoading}
                className="flex items-center gap-1.5 bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 disabled:opacity-60 text-sm"
              >
                {commitLoading ? (
                  <><RefreshCw size={15} className="animate-spin" /> Generating…</>
                ) : (
                  <><Zap size={15} /> Generate Back-Pay Inputs</>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Step 4: Done ────────────────────────────────────────────────────── */}
      {step === 4 && commit && (
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-3 p-5 bg-emerald-50 border border-emerald-200 rounded-2xl">
            <CheckCircle2 size={28} className="text-emerald-500 flex-shrink-0" />
            <div>
              <p className="font-bold text-emerald-800">{commit.message}</p>
              <p className="text-sm text-emerald-700 mt-0.5">
                Transaction code <span className="font-bold">{commit.transactionCodeName}</span> applied for period{' '}
                <span className="font-bold">{commit.period}</span>
              </p>
            </div>
          </div>

          {commit.inputs.length > 0 && (
            <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-border bg-slate-50">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Created PayrollInputs</p>
              </div>
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border">
                    {['Employee', 'Runs', 'Back-Pay Amount', 'Period', 'Notes'].map((h) => (
                      <th key={h} className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {commit.inputs.map((inp) => (
                    <tr key={inp.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3">
                        <p className="text-sm font-bold">{inp.employeeName}</p>
                        <p className="text-xs text-slate-400">{inp.employeeCode}</p>
                      </td>
                      <td className="px-4 py-3 text-sm">{inp.affectedRunCount}</td>
                      <td className="px-4 py-3 text-sm font-bold text-emerald-700">
                        {fmt(inp.totalShortfall, inp.currency)}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium">{inp.period}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{inp.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 font-medium">
            These inputs will be picked up automatically when you run payroll for period <strong>{commit.period}</strong>.
            You can review or remove them in <strong>Utilities → Payroll Inputs</strong>.
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => { setStep(1); setEffectiveDate(''); setUniformNewRate(''); setSelected([]); setEmpRates({}); setPreview(null); setCommit(null); setError(''); }}
              className="px-4 py-2 rounded-full font-bold border border-border hover:bg-slate-50 text-sm"
            >
              Start Over
            </button>
            <button
              onClick={() => navigate('/utilities')}
              className="flex items-center gap-1.5 bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 text-sm"
            >
              Back to Utilities
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BackPay;
