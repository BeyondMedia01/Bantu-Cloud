import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CompanyAPI, TrialAPI } from '../api/client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompanyForm {
  name: string;
  industry: string;
  country: string;
  currency: string;
}

// ─── Progress Indicator ───────────────────────────────────────────────────────

const STEPS = ['Company Setup', "You're all set"];

function ProgressBar({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2 mb-10">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <React.Fragment key={label}>
            <div className="flex flex-col items-center gap-1">
              <div
                className={[
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors',
                  done
                    ? 'bg-brand border-brand text-navy'
                    : active
                    ? 'border-brand text-brand bg-transparent'
                    : 'border-border text-muted-foreground bg-transparent',
                ].join(' ')}
              >
                {done ? '✓' : i + 1}
              </div>
              <span
                className={[
                  'text-xs font-medium whitespace-nowrap',
                  active ? 'text-brand' : done ? 'text-foreground' : 'text-muted-foreground',
                ].join(' ')}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={[
                  'flex-1 h-0.5 mb-4 transition-colors',
                  done ? 'bg-brand' : 'bg-border',
                ].join(' ')}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Step 1: Company Setup ────────────────────────────────────────────────────

function StepCompany({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState<CompanyForm>({
    name: '',
    industry: '',
    country: 'Zimbabwe',
    currency: 'USD',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set =
    (field: keyof CompanyForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const companyId = sessionStorage.getItem('activeCompanyId');
      if (!companyId) throw new Error('No active company found. Please log in again.');
      // Update the company created during signup with the details collected here.
      // industry and country are not yet in the DB schema; only name is sent for now.
      await CompanyAPI.update(companyId, { name: form.name });
      await TrialAPI.advanceStep(1);
      onDone();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to update company');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <p className="text-muted-foreground text-sm font-medium">
        Tell us about your company to get started with payroll.
      </p>

      {error && (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-semibold">Company Name <span className="text-red-500">*</span></label>
        <input
          required
          value={form.name}
          onChange={set('name')}
          placeholder="e.g. Acme Zimbabwe (Pvt) Ltd"
          className="border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-brand/40"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-semibold">Industry</label>
        <input
          value={form.industry}
          onChange={set('industry')}
          placeholder="e.g. Manufacturing, Retail, Finance"
          className="border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-brand/40"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold">Country</label>
          <input
            value={form.country}
            onChange={set('country')}
            placeholder="e.g. Zimbabwe"
            className="border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-brand/40"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold">Currency</label>
          <select
            value={form.currency}
            onChange={set('currency')}
            className="border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-brand/40"
          >
            <option value="USD">USD</option>
            <option value="ZiG">ZiG</option>
          </select>
        </div>
      </div>

      <div className="pt-2">
        <button
          type="submit"
          disabled={loading}
          className="bg-brand text-navy px-6 py-2.5 rounded-full font-bold shadow hover:opacity-90 disabled:opacity-60 text-sm"
        >
          {loading ? 'Setting up…' : 'Continue →'}
        </button>
      </div>
    </form>
  );
}

// ─── Step 2: All Set ─────────────────────────────────────────────────────────

function StepDone() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleGo = async () => {
    setLoading(true);
    try {
      await TrialAPI.advanceStep(2);
    } catch {
      // non-critical; proceed regardless
    }
    navigate('/dashboard');
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <p className="text-muted-foreground text-sm font-medium leading-relaxed">
          Your company is set up. Here's what you can do next with Bantu:
        </p>
        <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 pl-1">
          <li>Run monthly payroll and generate payslips in seconds</li>
          <li>Track leave balances and approve requests</li>
          <li>Manage employee records, contracts, and documents</li>
          <li>View statutory reports for ZIMRA, NSSA, and NEC</li>
        </ul>
        <p className="text-sm text-muted-foreground">
          Your trial gives you full access for 30 days. No credit card required.
        </p>
      </div>

      <div className="pt-2">
        <button
          onClick={handleGo}
          disabled={loading}
          className="bg-brand text-navy px-6 py-2.5 rounded-full font-bold shadow hover:opacity-90 disabled:opacity-60 text-sm"
        >
          {loading ? 'Loading…' : 'Go to Dashboard →'}
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TrialOnboarding: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<number | null>(null); // null = loading
  const [fetchError, setFetchError] = useState('');

  useEffect(() => {
    TrialAPI.getStatus()
      .then((res) => {
        const onboardingStep = res.data?.trial?.onboardingStep ?? 0;
        if (onboardingStep >= 2) {
          navigate('/dashboard', { replace: true });
        } else {
          setStep(onboardingStep);
        }
      })
      .catch((err: any) => {
        setFetchError(err?.response?.data?.message || err?.message || 'Failed to load trial status');
        setStep(0); // degrade gracefully — still show wizard
      });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <header className="border-b border-border px-8 py-4 flex items-center">
        <span className="text-xl font-black tracking-tight text-foreground">Bantu</span>
      </header>

      {/* Content */}
      <main className="flex-1 flex items-start justify-center pt-12 px-4">
        <div className="w-full max-w-lg">
          <div className="mb-6">
            <h1 className="text-2xl font-bold mb-1">Welcome to Bantu</h1>
            <p className="text-muted-foreground text-sm font-medium">
              Let's get you up and running in just a few steps.
            </p>
          </div>

          {step === null ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (
            <>
              <ProgressBar current={step} />

              {fetchError && (
                <div role="alert" className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-xl text-sm text-yellow-700 font-medium">
                  {fetchError}
                </div>
              )}

              <div className="bg-card border border-border rounded-2xl p-8 shadow-sm">
                <h2 className="text-lg font-bold mb-5">{STEPS[step]}</h2>
                {step === 0 && <StepCompany onDone={() => setStep(1)} />}
                {step === 1 && <StepDone />}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default TrialOnboarding;
