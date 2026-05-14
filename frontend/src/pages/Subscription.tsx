import React, { useEffect, useState } from 'react';
import {
  CheckCircle2, Loader, ExternalLink, AlertTriangle,
  Users, Calendar, CreditCard, Minus, Plus,
} from 'lucide-react';
import { SubscriptionAPI } from '../api/client';
import { useToast } from '../context/ToastContext';

// Pricing: $60 base + $1.00/employee/month. Quarterly = 15% off.
const BASE_FEE = 60;
const PER_EMPLOYEE = 1.0;
const QUARTERLY_DISCOUNT = 0.85;

function calcMonthly(cap: number) {
  return Math.round((BASE_FEE + cap * PER_EMPLOYEE) * 100) / 100;
}
function calcQuarterly(cap: number) {
  return Math.round(calcMonthly(cap) * 3 * QUARTERLY_DISCOUNT * 100) / 100;
}

const DEMO_SUB = {
  active: true,
  plan: 'STANDARD',
  billing: 'QUARTERLY',
  employeeCount: 47,
  employeeCap: 100,
  quarterlyPrice: 214,
  startDate: '2026-02-15',
  endDate: '2026-08-15',
  nextBillingDate: '2026-08-15',
  status: 'ACTIVE',
};

const fmt = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const daysLeft = (d: string) => Math.max(0, Math.round((new Date(d).getTime() - Date.now()) / 86400000));

const Subscription: React.FC = () => {
  const { showToast } = useToast();
  const [subscription, setSubscription] = useState<any>(DEMO_SUB);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [billing, setBilling] = useState<'monthly' | 'quarterly'>('quarterly');
  const [cap, setCap] = useState<number>(DEMO_SUB.employeeCap);

  useEffect(() => {
    SubscriptionAPI.get()
      .then((r) => {
        if (r.data?.plan) {
          setSubscription(r.data);
          setCap(r.data.employeeCap ?? 100);
          setBilling(r.data.billing === 'MONTHLY' ? 'monthly' : 'quarterly');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const monthly = calcMonthly(cap);
  const quarterly = calcQuarterly(cap);
  const displayPrice = billing === 'quarterly' ? quarterly : monthly;
  const perMonth = billing === 'quarterly' ? Math.round(quarterly / 3 * 100) / 100 : monthly;

  const currentCap = subscription?.employeeCap ?? 100;
  const capChanged = cap !== currentCap;
  const billingChanged = billing !== (subscription?.billing === 'MONTHLY' ? 'monthly' : 'quarterly');
  const hasChanges = capChanged || billingChanged;

  const handleUpdate = async () => {
    setSaving(true);
    try {
      await SubscriptionAPI.upgrade(subscription.plan);
      const r = await SubscriptionAPI.get();
      if (r.data?.plan) setSubscription(r.data);
      showToast('Subscription updated', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to update subscription', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handlePortal = async () => {
    try {
      const res = await SubscriptionAPI.portal();
      window.location.href = res.data.url;
    } catch (err: any) {
      showToast(err.message || 'Failed to open billing portal', 'error');
    }
  };

  const usagePct = cap > 0 ? Math.round(((subscription?.employeeCount ?? 0) / cap) * 100) : 0;
  const days = subscription?.endDate ? daysLeft(subscription.endDate) : 0;

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-muted-foreground">
      <Loader size={24} className="animate-spin" />
    </div>
  );

  return (
    <div className="flex flex-col gap-8 max-w-3xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Subscription & Billing</h1>
          <p className="text-muted-foreground text-sm font-medium">Manage your plan, employee cap, and billing cycle</p>
        </div>
        {subscription?.active && (
          <button onClick={handlePortal}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-full text-sm font-bold hover:bg-muted transition-colors shrink-0">
            <ExternalLink size={14} /> Payment History
          </button>
        )}
      </div>

      {/* Status alert if inactive */}
      {!subscription?.active && (
        <div className="p-5 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-3">
          <AlertTriangle size={20} className="text-amber-500 shrink-0" />
          <div>
            <p className="font-bold text-amber-800">No active subscription</p>
            <p className="text-sm text-amber-600">Configure your plan below and click Save to activate</p>
          </div>
        </div>
      )}

      {/* Current summary cards */}
      {subscription?.active && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-primary rounded-2xl border border-emerald-200 shadow-sm p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 size={16} className="shrink-0" />
              <span className="text-xs font-bold uppercase tracking-wider">Status</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-navy">Active</p>
              <p className="text-sm text-muted-foreground font-medium mt-0.5">
                {subscription.billing === 'QUARTERLY' ? 'Quarterly billing' : 'Monthly billing'}
              </p>
            </div>
          </div>

          <div className="bg-primary rounded-2xl border border-border shadow-sm p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users size={16} className="shrink-0" />
              <span className="text-xs font-bold uppercase tracking-wider">Employees</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-navy">
                {subscription.employeeCount}
                <span className="text-sm font-medium text-muted-foreground"> / {currentCap}</span>
              </p>
              <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${usagePct >= 90 ? 'bg-red-500' : usagePct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min(usagePct, 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground font-medium mt-1">{usagePct}% used</p>
            </div>
          </div>

          <div className="bg-primary rounded-2xl border border-border shadow-sm p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar size={16} className="shrink-0" />
              <span className="text-xs font-bold uppercase tracking-wider">Next Renewal</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-navy">{days}<span className="text-sm font-medium text-muted-foreground"> days</span></p>
              <p className="text-xs text-muted-foreground font-medium mt-0.5">Renews {fmt(subscription.endDate)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Plan configurator */}
      <div className="bg-primary rounded-2xl border border-border shadow-sm p-6 flex flex-col gap-6">
        <h2 className="text-sm font-bold text-navy uppercase tracking-wider">Adjust Your Plan</h2>

        {/* Billing cycle toggle */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Billing Cycle</label>
          <div className="flex items-center bg-muted rounded-full p-1 gap-1 w-fit">
            {(['monthly', 'quarterly'] as const).map(b => (
              <button key={b} onClick={() => setBilling(b)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${billing === b ? 'bg-primary shadow text-navy' : 'text-muted-foreground hover:text-navy'}`}>
                {b === 'monthly' ? 'Monthly' : 'Quarterly'}
                {b === 'quarterly' && <span className="ml-1.5 text-emerald-600">Save 15%</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Employee cap adjuster */}
        <div className="flex flex-col gap-3">
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Employee Cap</label>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setCap(c => Math.max(1, c - 5))}
              className="w-9 h-9 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors shrink-0">
              <Minus size={14} />
            </button>
            <input
              type="number"
              min={1}
              max={9999}
              value={cap}
              onChange={e => setCap(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-24 text-center text-2xl font-bold text-navy bg-transparent border-b-2 border-border focus:border-accent-green outline-none py-1"
            />
            <button
              onClick={() => setCap(c => c + 5)}
              className="w-9 h-9 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors shrink-0">
              <Plus size={14} />
            </button>
            <span className="text-sm text-muted-foreground font-medium">employees</span>
          </div>

          {/* Slider */}
          <input
            type="range"
            min={1}
            max={500}
            step={5}
            value={Math.min(cap, 500)}
            onChange={e => setCap(parseInt(e.target.value))}
            className="w-full accent-emerald-500"
          />
          <div className="flex justify-between text-xs text-muted-foreground font-medium">
            <span>1</span>
            <span>100</span>
            <span>250</span>
            <span>500+</span>
          </div>
        </div>

        {/* Price calculation */}
        <div className="bg-muted rounded-xl p-5 flex flex-col gap-3">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Price Estimate</p>
          <div className="flex items-end gap-3 flex-wrap">
            <p className="text-4xl font-bold text-navy">
              ${displayPrice.toFixed(2)}
              <span className="text-base font-medium text-muted-foreground">
                /{billing === 'quarterly' ? 'quarter' : 'month'}
              </span>
            </p>
            {billing === 'quarterly' && (
              <p className="text-sm text-muted-foreground font-medium mb-1.5">≈ ${perMonth.toFixed(2)}/month</p>
            )}
          </div>
          <div className="text-xs text-muted-foreground font-medium flex flex-col gap-0.5">
            <span>${BASE_FEE} platform fee + $1.00 × {cap} employees = ${calcMonthly(cap).toFixed(2)}/month</span>
            {billing === 'quarterly' && (
              <span className="text-emerald-600">${calcMonthly(cap).toFixed(2)} × 3 months − 15% = ${quarterly.toFixed(2)}/quarter</span>
            )}
          </div>
        </div>

        {/* Save button */}
        <div className="flex items-center justify-between gap-4">
          {cap < (subscription?.employeeCount ?? 0) && (
            <p className="text-xs text-amber-600 font-medium flex items-center gap-1.5">
              <AlertTriangle size={13} />
              Cap is below current employee count ({subscription?.employeeCount})
            </p>
          )}
          <div className="ml-auto flex items-center gap-3">
            {hasChanges && (
              <button
                onClick={() => { setCap(currentCap); setBilling(subscription?.billing === 'MONTHLY' ? 'monthly' : 'quarterly'); }}
                className="px-4 py-2 text-sm font-bold text-muted-foreground hover:text-navy transition-colors">
                Reset
              </button>
            )}
            <button
              onClick={handleUpdate}
              disabled={saving || !hasChanges}
              className="flex items-center gap-2 px-6 py-2.5 bg-brand text-navy rounded-full text-sm font-bold hover:opacity-90 transition-all shadow disabled:opacity-50 disabled:cursor-not-allowed">
              {saving ? <><Loader size={14} className="animate-spin" /> Saving…</> : <><CreditCard size={14} /> Save Changes</>}
            </button>
          </div>
        </div>
      </div>

      {/* Billing summary footer */}
      {subscription?.active && (
        <div className="bg-muted rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Billing Summary</p>
            <p className="text-sm font-medium text-foreground">
              Started {fmt(subscription.startDate)} · Next renewal {fmt(subscription.endDate)} · {days} days remaining
            </p>
          </div>
          <button onClick={handlePortal}
            className="flex items-center gap-2 px-4 py-2 bg-primary border border-border rounded-full text-sm font-bold hover:bg-muted transition-colors shrink-0">
            <ExternalLink size={14} /> Payment History
          </button>
        </div>
      )}
    </div>
  );
};

export default Subscription;
