import React, { useState } from 'react';
import {
  AreaChart, Area, XAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie,
} from 'recharts';
import {
  Plus, CheckCircle2, UserX, TrendingUp,
  Users, CalendarCheck, Landmark, AlertTriangle, ShieldCheck,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import IntelligenceWidget from '../components/IntelligenceWidget';
import UnifiedCalendarCard from '../components/dashboard/UnifiedCalendarCard';
import FilingDeadlinesCard from '../components/dashboard/FilingDeadlinesCard';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { useDashboardData } from '../hooks/useDashboardData';

const fmtDate = (d: string | undefined) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();

  const [selectedDay, setSelectedDay] = useState<Date>(new Date());

  const {
    summary,
    reminders,
    trend,
    holidays,
    exchangeRate,
    exchangeRateLoading,
    loading,
    hasCompany,
  } = useDashboardData();

  const pieData = summary
    ? [
        { name: 'Employees', value: Math.max(summary.employeeCount, 1), fill: 'var(--color-navy)' },
        { name: 'Pending Leave', value: Math.max(summary.pendingLeave, 0), fill: 'var(--color-brand)' },
        { name: 'Active Loans', value: Math.max(summary.activeLoans, 0), fill: 'var(--border)' },
      ]
    : [{ name: 'N/A', value: 1, fill: 'var(--border)' }];

  const currentRun = summary?.currentRun ?? null;
  const noTinCount = summary?.noTinCount ?? 0;
  const noBankCount = summary?.noBankCount ?? 0;
  const trendCurrency = summary?.lastRun?.currency ?? 'USD';
  const currencySymbol = trendCurrency === 'USD' ? '$' : trendCurrency + ' ';

  const totalEmployees = summary?.employeeCount ?? 0;
  const pendingLeave = summary?.pendingLeave ?? 0;
  const activeLoans = summary?.activeLoans ?? 0;
  const complianceIssues = noTinCount + noBankCount;
  const complianceClear = complianceIssues === 0;

  return (
    <div className="flex flex-col gap-8">
      <IntelligenceWidget />

      {!hasCompany && (
        <Card className="border-border">
          <CardContent className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
              <TrendingUp size={28} className="text-muted-foreground" />
            </div>
            <h3 className="text-lg font-bold text-navy">No company selected</h3>
            <p className="text-sm text-muted-foreground font-medium max-w-xs">
              Select a company from the sidebar to load your dashboard metrics and payroll insights.
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && noTinCount > 0 && (
        <div className="flex items-center gap-3 bg-warning-bg border border-warning-border rounded-2xl p-4">
          <UserX size={18} className="text-warning shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-warning">
              {noTinCount} employee{noTinCount > 1 ? 's' : ''} missing ZIMRA TIN
            </p>
            <p className="text-xs text-warning/80 font-medium">PAYE submissions require a TIN for every active employee.</p>
          </div>
          <Button size="sm" onClick={() => navigate('/employees')}
            className="shrink-0 bg-warning text-white hover:bg-warning/90 rounded-full text-xs font-bold">
            Review
          </Button>
        </div>
      )}

      {!loading && noBankCount > 0 && (
        <div className="flex items-center gap-3 bg-warning-bg border border-warning-border rounded-2xl p-4">
          <UserX size={18} className="text-warning shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-warning">
              {noBankCount} employee{noBankCount > 1 ? 's' : ''} lack bank details for electronic payment
            </p>
            <p className="text-xs text-warning/80 font-medium">Account numbers are required to process EFT payroll runs.</p>
          </div>
          <Button size="sm" onClick={() => navigate('/employees')}
            className="shrink-0 bg-warning text-white hover:bg-warning/90 rounded-full text-xs font-bold">
            Update Profiles
          </Button>
        </div>
      )}

      {/* ─── Apple Bento Grid ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 lg:grid-rows-3 gap-5 items-stretch">

        {/* ═══ [1,1] Overview (1x1) ═══ */}
        <div className="lg:col-start-1 lg:row-start-1">
          <div className="bg-primary rounded-2xl border border-border shadow-sm card-shimmer p-5 h-full flex flex-col gap-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Overview</p>

            <div className="relative flex justify-center">
              <div className="w-24 h-24">
                {loading ? (
                  <Skeleton className="w-24 h-24 rounded-full" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%" cy="50%"
                        innerRadius={30} outerRadius={44}
                        paddingAngle={3}
                        dataKey="value"
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
              {!loading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-lg font-black leading-none text-navy">{totalEmployees}</span>
                  <span className="text-[8px] text-muted-foreground font-bold uppercase tracking-wider mt-0.5">staff</span>
                </div>
              )}
            </div>

            <div className="flex justify-center gap-4">
              <div className="flex flex-col items-center gap-1">
                <div className="w-8 h-8 rounded-xl bg-navy/5 flex items-center justify-center">
                  <Users size={14} className="text-navy" />
                </div>
                <span className="text-[9px] font-bold text-muted-foreground">{totalEmployees}</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className="w-8 h-8 rounded-xl bg-brand/20 flex items-center justify-center">
                  <CalendarCheck size={14} className="text-navy" />
                </div>
                <span className="text-[9px] font-bold text-muted-foreground">{pendingLeave}</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center">
                  <Landmark size={14} className="text-muted-foreground" />
                </div>
                <span className="text-[9px] font-bold text-muted-foreground">{activeLoans}</span>
              </div>
            </div>

            <Separator className="my-1" />

            <button
              onClick={() => navigate('/employees/new')}
              className="w-full flex items-center justify-center gap-1.5 bg-brand text-navy px-4 py-2.5 rounded-full font-bold text-sm hover:opacity-90 transition-opacity"
            >
              <Plus size={14} /> Add Employee
            </button>
          </div>
        </div>

        {/* ═══ [1,2] Exchange Rate (1x1) ═══ */}
        <div className="lg:col-start-1 lg:row-start-2">
          <div className="bg-primary rounded-2xl border border-border shadow-sm card-shimmer p-5 h-full flex flex-col gap-3 relative overflow-hidden">
            <div className="flex items-center justify-between relative z-10">
              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">USD / ZiG Rate</p>
              {exchangeRate && (
                <span className="flex items-center gap-1.5 text-[9px] font-bold text-success">
                  <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                  Live
                </span>
              )}
            </div>

            {exchangeRateLoading ? (
              <div className="flex flex-col gap-2 relative z-10">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
            ) : exchangeRate ? (
              <>
                <div className="relative z-10">
                  <p className="text-2xl font-black leading-none tracking-tight">
                    {Number(exchangeRate.rate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    <span className="text-sm font-bold text-muted-foreground ml-1">{exchangeRate.toCurrency}</span>
                  </p>
                  <p className="text-[9px] text-muted-foreground font-medium mt-1">
                    per 1 {exchangeRate.fromCurrency} &middot; {fmtDate(exchangeRate.effectiveDate)}
                  </p>
                </div>

                {/* Ghost trend line */}
                <div className="absolute inset-0 opacity-[0.04] pointer-events-none">
                  <svg viewBox="0 0 200 100" className="w-full h-full" preserveAspectRatio="none">
                    <path
                      d="M0,80 Q25,70 50,60 T100,30 T150,35 T200,10"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="text-navy"
                    />
                  </svg>
                </div>
              </>
            ) : (
              <button onClick={() => navigate('/currency-rates')} className="text-sm font-bold text-accent-green hover:underline relative z-10 mt-1">
                Set USD/ZiG rate &rarr;
              </button>
            )}
          </div>
        </div>

        {/* ═══ [1,3] Smart Insight / Compliance Health (1x1) ═══ */}
        <div className="lg:col-start-1 lg:row-start-3">
          <div className="bg-primary rounded-2xl border border-border shadow-sm card-shimmer p-5 h-full flex flex-col gap-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Compliance</p>

            {loading ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-8 w-28" />
                <Skeleton className="h-3 w-36" />
              </div>
            ) : complianceClear ? (
              <>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-success-bg flex items-center justify-center">
                    <ShieldCheck size={20} className="text-success" />
                  </div>
                  <div>
                    <p className="text-xl font-black leading-none text-success">All Clear</p>
                    <p className="text-[9px] text-muted-foreground font-medium mt-0.5">No compliance issues found</p>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground font-medium mt-auto">
                  {totalEmployees} active employees &middot; all records valid
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-warning-bg flex items-center justify-center">
                    <AlertTriangle size={20} className="text-warning" />
                  </div>
                  <div>
                    <p className="text-xl font-black leading-none text-warning">{complianceIssues}</p>
                    <p className="text-[9px] text-muted-foreground font-medium mt-0.5">Issues to resolve</p>
                  </div>
                </div>
                <div className="flex flex-col gap-1 mt-auto">
                  {noTinCount > 0 && (
                    <button onClick={() => navigate('/employees')} className="text-left text-[10px] font-bold text-warning hover:underline">
                      {noTinCount} missing TIN{noTinCount > 1 ? 's' : ''} &rarr;
                    </button>
                  )}
                  {noBankCount > 0 && (
                    <button onClick={() => navigate('/employees')} className="text-left text-[10px] font-bold text-warning hover:underline">
                      {noBankCount} missing bank detail{noBankCount > 1 ? 's' : ''} &rarr;
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ═══ [2-3, 1-2] Filing Deadlines — The Anchor (2x2) ═══ */}
        <div className="lg:col-start-2 lg:col-span-2 lg:row-start-1 lg:row-span-2 flex flex-col">
          <FilingDeadlinesCard holidays={holidays} />
        </div>

        {/* ═══ [2, 3] Current Run Action (1x1) ═══ */}
        <div className="lg:col-start-2 lg:row-start-3">
          {loading ? (
            <div className="bg-primary rounded-2xl border border-border shadow-sm p-5 flex flex-col gap-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-3 w-20" />
            </div>
          ) : currentRun ? (
            <button
              onClick={() => navigate('/payroll')}
              className="w-full text-left bg-primary rounded-2xl border border-border shadow-sm card-shimmer p-5 hover:border-brand/40 transition-all flex flex-col gap-3 h-full group"
            >
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Current Run</p>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-success-bg text-success border border-success-border status-pill-glow">
                  <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                  {currentRun.status === 'DRAFT' ? 'In Progress' : currentRun.status}
                </span>
              </div>
              <p className="font-bold text-sm leading-snug text-navy">{currentRun.name}</p>
              <p className="text-[10px] text-muted-foreground font-medium">{fmtDate(currentRun.runDate)} &middot; {currentRun.currency}</p>
              <div className="mt-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] font-bold text-muted-foreground">Progress</span>
                  <span className="text-[9px] font-bold text-muted-foreground">75%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-brand transition-all" style={{ width: '75%' }} />
                </div>
              </div>
              <p className="text-xs font-bold text-brand mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                Continue payroll &rarr;
              </p>
            </button>
          ) : summary?.lastRun ? (
            <div className="bg-primary rounded-2xl border border-border shadow-sm card-shimmer p-5 flex flex-col gap-2 h-full">
              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Last Payroll</p>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-success shrink-0" />
                <p className="font-bold text-sm text-navy">{fmtDate(summary.lastRun.runDate)}</p>
              </div>
              <p className="text-[10px] text-muted-foreground font-medium">{summary.lastRun.status} &middot; {summary.lastRun.currency}</p>
              <button onClick={() => navigate('/payroll/new')} className="self-start text-xs font-bold text-accent-green hover:underline mt-auto pt-2">
                Start new run &rarr;
              </button>
            </div>
          ) : (
            <button
              onClick={() => navigate('/payroll/new')}
              className="w-full text-left bg-accent-green/5 rounded-2xl border border-accent-green/20 shadow-sm p-5 hover:border-accent-green/40 transition-all flex flex-col gap-2 h-full group"
            >
              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Next Action</p>
              <p className="font-bold text-sm text-accent-green">Start your first payroll run</p>
              <p className="text-xs text-accent-green/70 font-medium mt-auto opacity-0 group-hover:opacity-100 transition-opacity">
                Set up employees, salaries &amp; deductions &rarr;
              </p>
            </button>
          )}
        </div>

        {/* ═══ [4, 1-2] Unified Calendar (1x2) ═══ */}
        <div className="lg:col-start-4 lg:row-start-1 lg:row-span-2 flex flex-col h-full">
          <UnifiedCalendarCard
            reminders={reminders}
            holidays={holidays}
            selectedDay={selectedDay}
            onDateSelect={setSelectedDay}
            loading={loading}
          />
        </div>

      </div>

      {/* Net Pay Trend */}
      <Card>
        <CardContent className="p-8 flex flex-col gap-6">
          <div className="flex justify-between items-start gap-4">
            <div className="flex flex-col gap-3 min-w-0">
              <p className="text-muted-foreground font-bold text-sm uppercase tracking-wider">Net Pay Trend</p>
              {loading ? (
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-8 w-36" />
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-6 w-48" />
                </div>
              ) : trend.length > 0 ? (() => {
                const last = trend[trend.length - 1];
                const hasZig = (last.zigTotal ?? 0) > 0;
                const hasUsd = (last.usdTotal ?? 0) > 0;
                const bothCurrencies = hasZig && hasUsd;
                return (
                  <>
                    <div className="flex items-baseline gap-4 flex-wrap">
                      <div>
                        <p className="text-3xl font-bold">{currencySymbol}{last.netPay.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground font-medium mt-0.5">Net pay &middot; last run</p>
                      </div>
                      {last.ctc != null && (
                        <div className="pb-0.5">
                          <p className="text-xl font-bold text-foreground/70">{currencySymbol}{last.ctc.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground font-medium mt-0.5">Total CTC</p>
                        </div>
                      )}
                    </div>
                    {(bothCurrencies || hasZig || hasUsd) && (
                      <div className="flex items-center gap-2 flex-wrap">
                        {hasUsd && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-info-bg text-info border border-info-border text-xs font-bold">
                            USD ${(last.usdTotal ?? 0).toLocaleString()}
                          </span>
                        )}
                        {hasZig && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-warning-bg text-warning border border-warning-border text-xs font-bold">
                            ZiG {(last.zigTotal ?? 0).toLocaleString()}
                          </span>
                        )}
                        {bothCurrencies && (
                          <span className="text-xs text-muted-foreground font-medium">Bank transfer split</span>
                        )}
                      </div>
                    )}
                  </>
                );
              })() : (
                <>
                  <p className="text-3xl font-bold">
                    {summary?.employeeCount != null ? `${summary.employeeCount} Employees` : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground font-medium">No payroll runs yet</p>
                </>
              )}
            </div>
            <button
              onClick={() => navigate('/payroll/new')}
              className="flex items-center gap-1.5 bg-brand text-navy px-4 py-2 rounded-full font-bold text-sm hover:opacity-90 transition-opacity shrink-0"
            >
              <Plus size={14} /> Run Payroll
            </button>
          </div>

          <div className="h-[280px] w-full">
            {loading ? (
              <div className="h-full flex items-end gap-2 px-2 pb-2">
                {[40, 65, 50, 80, 60, 90, 70].map((h, i) => (
                  <Skeleton key={i} className="flex-1 rounded-t-lg rounded-b-none" style={{ height: `${h}%` }} />
                ))}
              </div>
            ) : trend.length >= 2 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-brand)" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="var(--color-brand)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorGross" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-navy)" stopOpacity={0.08} />
                      <stop offset="95%" stopColor="var(--color-navy)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 12, fontWeight: 600 }} dy={10} />
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: 'none', fontSize: 12 }}
                    formatter={(value, name) => [
                      `${currencySymbol}${Number(value).toLocaleString()}`,
                      name === 'netPay' ? 'Net Pay' : name === 'ctc' ? 'Total CTC' : 'Gross Pay',
                    ]}
                  />
                  <Area type="monotone" dataKey="ctc" stroke="var(--color-navy)" strokeWidth={1} strokeDasharray="4 2" fillOpacity={0} />
                  <Area type="monotone" dataKey="grossPay" stroke="var(--border)" strokeWidth={2} fillOpacity={1} fill="url(#colorGross)" />
                  <Area type="monotone" dataKey="netPay" stroke="var(--color-brand)" strokeWidth={3} fillOpacity={1} fill="url(#colorNet)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
                <p className="text-muted-foreground font-medium text-sm">No payroll history yet.</p>
                <button onClick={() => navigate('/payroll/new')} className="text-accent-green text-sm font-bold hover:underline">
                  Run your first payroll &rarr;
                </button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
