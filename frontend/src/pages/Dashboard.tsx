import React, { useEffect, useState } from 'react';
import {
  AreaChart, Area, XAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie,
} from 'recharts';
import { Plus, ArrowUpRight, Clock, CheckCircle2, UserX, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  ReportsAPI, DashboardAPI, PublicHolidaysAPI, CurrencyRateAPI,
  type DashboardSummary, type CurrencyRate, type ReminderItem, type PublicHoliday,
} from '../api/client';
import { getActiveCompanyId } from '../lib/companyContext';
import { useToast } from '../context/ToastContext';
import IntelligenceWidget from '../components/IntelligenceWidget';
import MiniCalendar from '../components/dashboard/MiniCalendar';
import RemindersCard from '../components/dashboard/RemindersCard';
import FilingDeadlinesCard from '../components/dashboard/FilingDeadlinesCard';

const fmtDate = (d: string | undefined) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const RUN_STATUS_STYLES: Record<string, string> = {
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
  const { showToast } = useToast();

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [reminders, setReminders] = useState<{ birthdays: ReminderItem[]; anniversaries: ReminderItem[] }>({ birthdays: [], anniversaries: [] });
  const [trend, setTrend] = useState<{ name: string; netPay: number; grossPay: number; headcount: number }[]>([]);
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
  const [exchangeRate, setExchangeRate] = useState<CurrencyRate | null>(null);
  const [exchangeRateLoading, setExchangeRateLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());

  useEffect(() => {
    let mounted = true;
    const cid = getActiveCompanyId();
    if (!cid) { setLoading(false); return; }

    // Fire all three main requests together; show warning if any fail
    Promise.allSettled([
      ReportsAPI.summary().then((res) => { if (mounted) setSummary(res.data); }),
      DashboardAPI.reminders().then((res) => { if (mounted) setReminders(res.data); }),
      ReportsAPI.payrollTrend().then((res) => { if (mounted) setTrend(res.data); }),
    ]).then((results) => {
      if (!mounted) return;
      const failed = results.filter((r) => r.status === 'rejected');
      if (failed.length > 0) {
        showToast('Some dashboard data failed to load. Please refresh.', 'warning');
      }
    }).finally(() => { if (mounted) setLoading(false); });

    // Load independently — dashboard still renders without these
    const thisYear = new Date().getFullYear();
    Promise.all([
      PublicHolidaysAPI.getAll(thisYear),
      PublicHolidaysAPI.getAll(thisYear + 1),
    ])
      .then(([r1, r2]) => { if (mounted) setHolidays([...r1.data, ...r2.data]); })
      .catch(() => {});

    CurrencyRateAPI.getLatest()
      .then((res) => { if (mounted) setExchangeRate(res.data); })
      .catch(() => {})
      .finally(() => { if (mounted) setExchangeRateLoading(false); });

    return () => { mounted = false; };
  }, []); // [] is correct — company switches trigger a full page reload (window.location.reload)

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

  // Determine currency label from last completed run (default USD)
  const trendCurrency = summary?.lastRun?.currency ?? 'USD';
  const currencySymbol = trendCurrency === 'USD' ? '$' : trendCurrency + ' ';

  return (
    <div className="flex flex-col gap-8">
      {/* Intelligence Layer */}
      <IntelligenceWidget />

      {/* No company selected guard */}
      {!loading && !summary && (
        <div className="flex flex-col items-center justify-center py-24 bg-primary rounded-2xl border border-border text-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-2">
            <TrendingUp size={28} className="text-slate-400" />
          </div>
          <h3 className="text-lg font-bold text-navy">No company selected</h3>
          <p className="text-sm text-slate-400 font-medium max-w-xs">
            Select a company from the sidebar to load your dashboard metrics and payroll insights.
          </p>
        </div>
      )}

      {/* ZIMRA TIN missing alert */}
      {!loading && noTinCount > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <UserX size={18} className="text-amber-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-800">
              {noTinCount} employee{noTinCount > 1 ? 's' : ''} missing ZIMRA TIN
            </p>
            <p className="text-xs text-amber-600 font-medium">PAYE submissions require a TIN for every active employee.</p>
          </div>
          <button
            onClick={() => navigate('/employees')}
            className="shrink-0 bg-amber-600 text-white text-xs font-bold px-4 py-2 rounded-full hover:bg-amber-700 transition"
          >
            Review
          </button>
        </div>
      )}

      {/* Missing bank details alert */}
      {!loading && noBankCount > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <UserX size={18} className="text-amber-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-800">
              {noBankCount} employee{noBankCount > 1 ? 's' : ''} lack bank details for electronic payment
            </p>
            <p className="text-xs text-amber-600 font-medium">Account numbers are required to process EFT payroll runs.</p>
          </div>
          <button
            onClick={() => navigate('/employees')}
            className="shrink-0 bg-amber-600 text-white text-xs font-bold px-4 py-2 rounded-full hover:bg-amber-700 transition"
          >
            Update Profiles
          </button>
        </div>
      )}

      {/* Main grid: overview | filing deadlines | calendar */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">

        {/* Column 1: Overview & Payroll */}
        <div className="flex flex-col gap-4">
          <div className="bg-primary rounded-2xl border border-border p-5 shadow-sm">
            <div className="mb-4">
              <h3 className="font-bold text-sm uppercase tracking-wider text-slate-400">Overview</h3>
            </div>
            <div className="flex justify-center mb-4">
              <div className="w-24 h-24">
                {loading ? (
                  <div className="w-24 h-24 rounded-full border-8 border-slate-100 animate-pulse" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={30} outerRadius={44} paddingAngle={3} dataKey="value" />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
            {loading ? (
              <div className="animate-pulse flex flex-col gap-3 mb-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="h-3 w-24 bg-slate-100 rounded" />
                    <div className="h-3 w-8 bg-slate-100 rounded" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-2 mb-4">
                <SummaryItem label="Employees" value={summary?.employeeCount ?? 0} color="bg-navy" />
                <SummaryItem label="Pending Leave" value={summary?.pendingLeave ?? 0} color="bg-accent-blue" />
                <SummaryItem label="Active Loans" value={summary?.activeLoans ?? 0} color="bg-slate-200" />
              </div>
            )}
            <button
              onClick={() => navigate('/employees/new')}
              className="w-full bg-btn-primary text-navy py-2.5 rounded-full font-bold shadow hover:opacity-90 transition-opacity flex items-center justify-center gap-2 text-sm"
            >
              <Plus size={15} /> Add Employee
            </button>
          </div>

          {/* Current / Last Payroll Run */}
          {loading ? (
            <div className="p-4 rounded-2xl border border-border bg-primary shadow-sm animate-pulse">
              <div className="h-3 w-24 bg-slate-100 rounded mb-3" />
              <div className="h-4 w-32 bg-slate-100 rounded mb-2" />
              <div className="h-3 w-20 bg-slate-50 rounded" />
            </div>
          ) : currentRun ? (
            <button
              onClick={() => navigate('/payroll')}
              className="p-4 rounded-2xl border border-border bg-primary shadow-sm text-left hover:border-accent-blue/40 transition-colors w-full"
            >
              <div className="flex justify-between items-start mb-2">
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Current Run</p>
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${RUN_STATUS_STYLES[currentRun.status] ?? 'bg-slate-100 text-slate-600'}`}>
                  {currentRun.status.replace('_', ' ')}
                </span>
              </div>
              <p className="font-bold text-sm text-navy">{currentRun.name}</p>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                {fmtDate(currentRun.runDate)} · {currentRun.currency}
              </p>
            </button>
          ) : summary?.lastRun ? (
            <div className="p-4 rounded-2xl border border-border bg-primary shadow-sm">
              <div className="flex justify-between items-start mb-2">
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Last Payroll</p>
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-600">
                  <CheckCircle2 size={10} /> COMPLETED
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm">{fmtDate(summary.lastRun.runDate)}</span>
                <ArrowUpRight size={16} className="text-slate-300" />
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-2xl border border-accent-blue bg-blue-50/30 shadow-sm">
              <div className="flex justify-between items-start mb-2">
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Next Action</p>
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-100 text-accent-blue">
                  <Clock size={10} /> Pending
                </div>
              </div>
              <button onClick={() => navigate('/payroll/new')} className="text-sm font-bold text-accent-blue hover:underline">
                Start new payroll run →
              </button>
            </div>
          )}

          {/* ZiG/USD Exchange Rate */}
          <div className="p-4 rounded-2xl border border-border bg-primary shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={14} className="text-slate-400" />
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Exchange Rate</p>
            </div>
            {exchangeRateLoading ? (
              <div className="animate-pulse space-y-2">
                <div className="h-5 w-40 bg-slate-100 rounded" />
                <div className="h-3 w-24 bg-slate-50 rounded" />
              </div>
            ) : exchangeRate ? (
              <>
                <p className="text-lg font-bold text-navy">
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
              <button onClick={() => navigate('/currency-rates')} className="text-sm font-bold text-accent-blue hover:underline">
                Set USD/ZiG rate →
              </button>
            )}
          </div>
        </div>

        {/* Column 2-3: Filing Deadlines */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <FilingDeadlinesCard holidays={holidays} />
        </div>

        {/* Column 4: Calendar & Reminders */}
        <div className="flex flex-col gap-4">
          <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
            <MiniCalendar
              reminders={reminders}
              holidays={holidays}
              selectedDay={selectedDay}
              onDateSelect={setSelectedDay}
            />
          </div>
          
          <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
            <RemindersCard reminders={reminders} loading={loading} selectedDay={selectedDay} />
          </div>
        </div>

      </div>

      {/* Chart — Full Width at bottom */}
      <div className="bg-primary rounded-2xl border border-border p-8 shadow-sm flex flex-col gap-6">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-slate-500 font-bold text-sm uppercase tracking-wider mb-1">Net Pay Trend</p>
            {loading ? (
              <div className="animate-pulse space-y-2 mt-1">
                <div className="h-8 w-36 bg-slate-100 rounded-lg" />
                <div className="h-3 w-24 bg-slate-50 rounded" />
              </div>
            ) : (
              <>
                <p className="text-3xl font-bold text-navy">
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
          <button
            onClick={() => navigate('/payroll/new')}
            className="flex items-center gap-2 bg-btn-primary text-navy px-4 py-2 rounded-full text-sm font-bold hover:opacity-90"
          >
            <Plus size={16} /> Run Payroll
          </button>
        </div>

        <div className="h-[280px] w-full">
          {loading ? (
            <div className="h-full animate-pulse flex items-end gap-2 px-2 pb-2">
              {[40, 65, 50, 80, 60, 90, 70].map((h, i) => (
                <div key={i} className="flex-1 bg-slate-100 rounded-t-lg" style={{ height: `${h}%` }} />
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
              <button
                onClick={() => navigate('/payroll/new')}
                className="text-accent-blue text-sm font-bold hover:underline"
              >
                Run your first payroll →
              </button>
            </div>
          )}
        </div>
      </div>

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
