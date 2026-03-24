import React, { useState } from 'react';
import {
  AreaChart, Area, XAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie,
} from 'recharts';
import { Plus, ArrowUpRight, Clock, CheckCircle2, UserX, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../context/ToastContext';
import IntelligenceWidget from '../components/IntelligenceWidget';
import MiniCalendar from '../components/dashboard/MiniCalendar';
import RemindersCard from '../components/dashboard/RemindersCard';
import FilingDeadlinesCard from '../components/dashboard/FilingDeadlinesCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { useDashboardData } from '../hooks/useDashboardData';

const fmtDate = (d: string | undefined) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const RUN_STATUS_CLASS: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  PENDING_APPROVAL: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  PROCESSING: 'bg-purple-100 text-purple-700',
  COMPLETED: 'bg-emerald-100 text-emerald-600',
  ERROR: 'bg-red-100 text-red-600',
};

// ─── Dashboard ────────────────────────────────────────────────────────────────

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { showToast: _showToast } = useToast();
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
        { name: 'Employees', value: Math.max(summary.employeeCount, 1), fill: '#0F172A' },
        { name: 'Pending Leave', value: Math.max(summary.pendingLeave, 0), fill: '#3B82F6' },
        { name: 'Active Loans', value: Math.max(summary.activeLoans, 0), fill: '#E2E8F0' },
      ]
    : [{ name: 'N/A', value: 1, fill: '#E2E8F0' }];

  const currentRun = summary?.currentRun ?? null;
  const noTinCount = summary?.noTinCount ?? 0;
  const noBankCount = summary?.noBankCount ?? 0;
  const trendCurrency = summary?.lastRun?.currency ?? 'USD';
  const currencySymbol = trendCurrency === 'USD' ? '$' : trendCurrency + ' ';

  return (
    <div className="flex flex-col gap-8">
      <IntelligenceWidget />

      {/* No company selected */}
      {!hasCompany && (
        <Card className="border-border">
          <CardContent className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
              <TrendingUp size={28} className="text-slate-400" />
            </div>
            <h3 className="text-lg font-bold text-navy">No company selected</h3>
            <p className="text-sm text-slate-400 font-medium max-w-xs">
              Select a company from the sidebar to load your dashboard metrics and payroll insights.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Compliance alerts */}
      {!loading && noTinCount > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <UserX size={18} className="text-amber-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-800">
              {noTinCount} employee{noTinCount > 1 ? 's' : ''} missing ZIMRA TIN
            </p>
            <p className="text-xs text-amber-600 font-medium">PAYE submissions require a TIN for every active employee.</p>
          </div>
          <Button size="sm" onClick={() => navigate('/employees')}
            className="shrink-0 bg-amber-600 text-white hover:bg-amber-700 rounded-full text-xs font-bold">
            Review
          </Button>
        </div>
      )}

      {!loading && noBankCount > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <UserX size={18} className="text-amber-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-800">
              {noBankCount} employee{noBankCount > 1 ? 's' : ''} lack bank details for electronic payment
            </p>
            <p className="text-xs text-amber-600 font-medium">Account numbers are required to process EFT payroll runs.</p>
          </div>
          <Button size="sm" onClick={() => navigate('/employees')}
            className="shrink-0 bg-amber-600 text-white hover:bg-amber-700 rounded-full text-xs font-bold">
            Update Profiles
          </Button>
        </div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">

        {/* Column 1: Overview & Payroll */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-400">Overview</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex justify-center">
                <div className="w-24 h-24">
                  {loading ? (
                    <Skeleton className="w-24 h-24 rounded-full" />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={30} outerRadius={44} paddingAngle={3} dataKey="value" />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <Separator />

              {loading ? (
                <div className="flex flex-col gap-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-3 w-8" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <SummaryItem label="Employees" value={summary?.employeeCount ?? 0} color="bg-slate-900" />
                  <SummaryItem label="Pending Leave" value={summary?.pendingLeave ?? 0} color="bg-blue-500" />
                  <SummaryItem label="Active Loans" value={summary?.activeLoans ?? 0} color="bg-slate-200" />
                </div>
              )}

              <Button
                onClick={() => navigate('/employees/new')}
                className="w-full rounded-full font-bold bg-btn-primary text-navy hover:opacity-90"
              >
                <Plus size={15} /> Add Employee
              </Button>
            </CardContent>
          </Card>

          {/* Current / Last Payroll Run */}
          {loading ? (
            <Card>
              <CardContent className="pt-4 flex flex-col gap-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </CardContent>
            </Card>
          ) : currentRun ? (
            <Card className="cursor-pointer hover:border-blue-400/40 transition-colors" onClick={() => navigate('/payroll')}>
              <CardContent className="pt-4">
                <div className="flex justify-between items-start mb-2">
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Current Run</p>
                  <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${RUN_STATUS_CLASS[currentRun.status] ?? 'bg-slate-100 text-slate-600'}`}>
                    {currentRun.status.replace('_', ' ')}
                  </span>
                </div>
                <p className="font-bold text-sm">{currentRun.name}</p>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                  {fmtDate(currentRun.runDate)} · {currentRun.currency}
                </p>
              </CardContent>
            </Card>
          ) : summary?.lastRun ? (
            <Card>
              <CardContent className="pt-4">
                <div className="flex justify-between items-start mb-2">
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Last Payroll</p>
                  <Badge className="bg-emerald-100 text-emerald-600 text-[10px] font-bold gap-1 rounded-full border-0">
                    <CheckCircle2 size={10} /> COMPLETED
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm">{fmtDate(summary.lastRun.runDate)}</span>
                  <ArrowUpRight size={16} className="text-slate-300" />
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-blue-300 bg-blue-50/30">
              <CardContent className="pt-4">
                <div className="flex justify-between items-start mb-2">
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Next Action</p>
                  <Badge className="bg-blue-100 text-blue-600 text-[10px] font-bold gap-1 rounded-full border-0">
                    <Clock size={10} /> Pending
                  </Badge>
                </div>
                <button onClick={() => navigate('/payroll/new')} className="text-sm font-bold text-blue-500 hover:underline">
                  Start new payroll run →
                </button>
              </CardContent>
            </Card>
          )}

          {/* Exchange Rate */}
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                <TrendingUp size={14} /> Exchange Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              {exchangeRateLoading ? (
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
              ) : exchangeRate ? (
                <>
                  <p className="text-lg font-bold">
                    1 {exchangeRate.fromCurrency} ={' '}
                    {Number(exchangeRate.rate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                    {exchangeRate.toCurrency}
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                    {fmtDate(exchangeRate.effectiveDate)}
                    {exchangeRate.source === 'RBZ' ? ' · RBZ' : ''}
                  </p>
                </>
              ) : (
                <button onClick={() => navigate('/currency-rates')} className="text-sm font-bold text-blue-500 hover:underline">
                  Set USD/ZiG rate →
                </button>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Column 2-3: Filing Deadlines */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <FilingDeadlinesCard holidays={holidays} />
        </div>

        {/* Column 4: Calendar & Reminders */}
        <div className="flex flex-col gap-4">
          <Card className="overflow-hidden p-0">
            <MiniCalendar
              reminders={reminders}
              holidays={holidays}
              selectedDay={selectedDay}
              onDateSelect={setSelectedDay}
            />
          </Card>
          <Card className="overflow-hidden p-0">
            <RemindersCard reminders={reminders} loading={loading} selectedDay={selectedDay} />
          </Card>
        </div>
      </div>

      {/* Net Pay Trend */}
      <Card>
        <CardContent className="p-8 flex flex-col gap-6">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-slate-500 font-bold text-sm uppercase tracking-wider mb-1">Net Pay Trend</p>
              {loading ? (
                <div className="flex flex-col gap-2 mt-1">
                  <Skeleton className="h-8 w-36" />
                  <Skeleton className="h-3 w-24" />
                </div>
              ) : (
                <>
                  <p className="text-3xl font-bold">
                    {trend.length > 0
                      ? `${currencySymbol}${trend[trend.length - 1].netPay.toLocaleString()}`
                      : summary?.employeeCount != null ? `${summary.employeeCount} Employees` : '—'}
                  </p>
                  <p className="text-xs text-slate-400 font-medium mt-1">
                    {trend.length > 0 ? `Last completed run · ${trendCurrency}` : 'No payroll runs yet'}
                  </p>
                </>
              )}
            </div>
            <Button
              onClick={() => navigate('/payroll/new')}
              className="rounded-full font-bold bg-btn-primary text-navy hover:opacity-90"
            >
              <Plus size={16} /> Run Payroll
            </Button>
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
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorGross" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0F172A" stopOpacity={0.08} />
                      <stop offset="95%" stopColor="#0F172A" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 12, fontWeight: 600 }} dy={10} />
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: 12 }}
                    formatter={(value, name) => [
                      `${currencySymbol}${Number(value).toLocaleString()}`,
                      name === 'netPay' ? 'Net Pay' : 'Gross Pay',
                    ]}
                  />
                  <Area type="monotone" dataKey="grossPay" stroke="#CBD5E1" strokeWidth={2} fillOpacity={1} fill="url(#colorGross)" />
                  <Area type="monotone" dataKey="netPay" stroke="#3B82F6" strokeWidth={3} fillOpacity={1} fill="url(#colorNet)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
                <p className="text-slate-400 font-medium text-sm">No payroll history yet.</p>
                <button onClick={() => navigate('/payroll/new')} className="text-blue-500 text-sm font-bold hover:underline">
                  Run your first payroll →
                </button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ─── Summary Item ─────────────────────────────────────────────────────────────

const SummaryItem: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-xs text-slate-400 font-bold uppercase">{label}</span>
    </div>
    <span className="text-sm font-bold">{value}</span>
  </div>
);

export default Dashboard;
