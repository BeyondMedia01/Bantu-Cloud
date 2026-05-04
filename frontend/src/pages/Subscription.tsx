import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader, ExternalLink, AlertTriangle } from 'lucide-react';
import { SubscriptionAPI } from '../api/client';
import { useToast } from '../context/ToastContext';

const PLANS = [
  { id: 'BASIC', name: 'Basic', price: '$29/mo', employees: 25, features: ['25 employees', 'Core payroll', 'Leave management', 'Email support'] },
  { id: 'STANDARD', name: 'Standard', price: '$79/mo', employees: 100, features: ['100 employees', 'All Basic features', 'Loans module', 'Reports & exports'] },
  { id: 'PREMIUM', name: 'Premium', price: '$149/mo', employees: 500, features: ['500 employees', 'All Standard features', 'Multi-company', 'API access'] },
  { id: 'ENTERPRISE', name: 'Enterprise', price: 'Custom', employees: -1, features: ['Unlimited employees', 'All Premium features', 'Dedicated support', 'Custom integrations'] },
];

const Subscription: React.FC = () => {
  const { showToast } = useToast();
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    SubscriptionAPI.get()
      .then((r) => setSubscription(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSelect = async (planId: string) => {
    setUpgrading(true);
    try {
      if (subscription?.active) {
        await SubscriptionAPI.upgrade(planId);
        const r = await SubscriptionAPI.get();
        setSubscription(r.data);
      } else {
        const res = await SubscriptionAPI.create(planId);
        window.location.href = res.data.url;
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to process subscription', 'error');
    } finally {
      setUpgrading(false);
    }
  };

  const handlePortal = async () => {
    try {
      const res = await SubscriptionAPI.portal();
      window.location.href = res.data.url;
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to open billing portal', 'error');
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-muted-foreground"><Loader size={24} className="animate-spin" /></div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Subscription</h1>
          <p className="text-muted-foreground text-sm font-medium">Manage your Bantu Payroll subscription</p>
        </div>
        {subscription?.active && (
          <button
            onClick={handlePortal}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-full text-sm font-bold hover:bg-muted"
          >
            <ExternalLink size={14} /> Billing Portal
          </button>
        )}
      </div>

      {/* Current plan banner */}
      {subscription?.active ? (
        <div className="mb-8 p-5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3">
          <CheckCircle2 size={20} className="text-emerald-500 shrink-0" />
          <div>
            <p className="font-bold text-emerald-800">Active: {subscription.plan} plan</p>
            <p className="text-sm text-emerald-600">
              {subscription.employeeCount} / {subscription.employeeCap ?? '∞'} employees used
              {subscription.endDate && ` · Renews ${new Date(subscription.endDate).toLocaleDateString()}`}
            </p>
          </div>
        </div>
      ) : (
        <div className="mb-8 p-5 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-3">
          <AlertTriangle size={20} className="text-amber-500 shrink-0" />
          <div>
            <p className="font-bold text-amber-800">No active subscription</p>
            <p className="text-sm text-amber-600">Choose a plan below to unlock all features</p>
          </div>
        </div>
      )}

      {/* Plan cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {PLANS.map((plan) => {
          const isCurrent = subscription?.plan === plan.id && subscription?.active;
          return (
            <div
              key={plan.id}
              className={`bg-primary rounded-2xl border p-6 shadow-sm flex flex-col gap-4 ${isCurrent ? 'border-accent-green ring-2 ring-accent-green/10' : 'border-border'}`}
            >
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">{plan.name}</p>
                <p className="text-2xl font-bold">{plan.price}</p>
                {plan.employees > 0 && (
                  <p className="text-xs text-muted-foreground font-medium mt-0.5">Up to {plan.employees} employees</p>
                )}
              </div>

              <ul className="flex flex-col gap-2 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm font-medium text-foreground/80">
                    <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              <button
                disabled={isCurrent || upgrading}
                onClick={() => handleSelect(plan.id)}
                className={`w-full py-3 rounded-full text-sm font-bold transition-all ${
                  isCurrent
                    ? 'bg-muted text-muted-foreground cursor-default'
                    : 'bg-brand text-navy hover:opacity-90 shadow'
                } disabled:opacity-60`}
              >
                {isCurrent ? 'Current Plan' : upgrading ? 'Processing…' : 'Select Plan'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Subscription;
