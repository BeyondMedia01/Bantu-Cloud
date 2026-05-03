import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, AlertCircle, RefreshCw } from 'lucide-react';
import { PayrollAPI, CurrencyRateAPI } from '../api/client';
import { getActiveCompanyId } from '../lib/companyContext';

type CurrencyMode = 'USD' | 'ZiG' | 'DUAL';

const PayrollNew: React.FC = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    startDate: '',
    endDate: '',
    currencyMode: 'USD' as CurrencyMode,
    exchangeRate: '',
    notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [latestRate, setLatestRate] = useState<{ rate: number; source: string } | null>(null);

  useEffect(() => {
    CurrencyRateAPI.getLatest()
      .then((r: any) => setLatestRate({ rate: r.data.rate, source: r.data.source || 'RBZ' }))
      .catch(() => {});
  }, []);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setError('');
    setForm((f) => ({ ...f, [field]: e.target.value }));
  };

  const needsExchangeRate = form.currencyMode === 'DUAL';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const companyId = getActiveCompanyId();
    if (!companyId) return setError('No company selected');
    if (needsExchangeRate && (!form.exchangeRate || parseFloat(form.exchangeRate) <= 1)) {
      return setError('Enter a valid USD → ZiG exchange rate (must be greater than 1)');
    }
    setError('');
    setLoading(true);
    try {
      const payload: Record<string, any> = {
        startDate: form.startDate,
        endDate: form.endDate,
        notes: form.notes,
        companyId,
      };
      if (form.currencyMode === 'DUAL') {
        payload.dualCurrency = true;
        payload.currency = 'USD';
        payload.exchangeRate = form.exchangeRate;
      } else {
        payload.currency = form.currencyMode;
        // ZiG runs use ZiG tax brackets directly — no exchange rate involved.
        // USD runs default to 1.
        payload.exchangeRate = '1';
      }
      await PayrollAPI.create(payload);
      navigate('/payroll');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create payroll run');
    } finally {
      setLoading(false);
    }
  };

  const modeLabel: Record<CurrencyMode, string> = {
    USD: 'USD only — United States Dollar',
    ZiG: 'ZiG only — Zimbabwe Gold',
    DUAL: 'Dual Currency — USD + ZiG (separate calculations)',
  };

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate('/payroll')} aria-label="Go back" className="p-2 hover:bg-slate-100 rounded-xl">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold">New Payroll Run</h1>
          <p className="text-slate-500 font-medium text-sm">Calculate and process payroll for all active employees</p>
        </div>
      </div>

      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-100 rounded-xl mb-6">
        <AlertCircle size={16} className="text-accent-blue mt-0.5 shrink-0" />
        <p className="text-sm font-medium text-slate-600">
          This will calculate PAYE, AIDS Levy, and NSSA for all active employees.
          <strong> Dual Currency</strong> runs calculate PAYE independently in USD and ZiG using your tax tables for each currency.
        </p>
      </div>

      {error && <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>}

      <form onSubmit={handleSubmit} className="bg-primary rounded-2xl border border-border p-8 shadow-sm flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Period Start <span className="text-red-400">*</span></label>
            <input
              type="date"
              required
              value={form.startDate}
              onChange={set('startDate')}
              className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue font-medium text-sm"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Period End <span className="text-red-400">*</span></label>
            <input
              type="date"
              required
              value={form.endDate}
              onChange={set('endDate')}
              className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue font-medium text-sm"
            />
          </div>
        </div>

        {/* Currency mode */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Currency Mode</label>
          <div className="grid grid-cols-1 gap-2">
            {(['USD', 'ZiG', 'DUAL'] as CurrencyMode[]).map((mode) => (
              <label
                key={mode}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors ${
                  form.currencyMode === mode
                    ? 'border-accent-blue bg-blue-50'
                    : 'border-border bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <input
                  type="radio"
                  name="currencyMode"
                  value={mode}
                  checked={form.currencyMode === mode}
                  onChange={() => { setError(''); setForm((f) => ({ ...f, currencyMode: mode })); }}
                  className="accent-blue-600"
                />
                <span className="font-medium text-sm">{modeLabel[mode]}</span>
                {mode === 'DUAL' && (
                  <span className="ml-auto text-xs font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">New</span>
                )}
              </label>
            ))}
          </div>
        </div>

        {/* Exchange rate — shown for Dual currency only */}
        {needsExchangeRate && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                USD → ZiG Exchange Rate <span className="text-red-400">*</span>
              </label>
              {latestRate && (
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, exchangeRate: String(latestRate.rate) }))}
                  className="flex items-center gap-1 text-xs font-bold text-accent-blue hover:underline"
                >
                  <RefreshCw size={11} /> Use latest {latestRate.source} rate ({latestRate.rate})
                </button>
              )}
            </div>
            <input
              type="number"
              required
              min="1.0001"
              step="any"
              value={form.exchangeRate}
              onChange={set('exchangeRate')}
              placeholder={latestRate ? `e.g. ${latestRate.rate}` : 'e.g. 27.5'}
              className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue font-medium text-sm"
            />
            <p className="text-xs text-slate-400">How many ZiG equal 1 USD (e.g. 27.5 means 1 USD = 27.5 ZiG)</p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Notes (optional)</label>
          <textarea
            value={form.notes}
            onChange={set('notes')}
            rows={3}
            placeholder="e.g. March 2025 dual-currency payroll run"
            className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue font-medium text-sm resize-none"
          />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 bg-brand text-navy px-8 py-2 rounded-full font-bold shadow hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            <Play size={16} /> {loading ? 'Creating Run…' : 'Create Payroll Run'}
          </button>
          <button type="button" onClick={() => navigate('/payroll')} className="px-4 py-2.5 rounded-full border border-border font-bold text-slate-500 hover:bg-slate-50">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default PayrollNew;
