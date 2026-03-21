import React from 'react';
import { CalendarClock, AlertTriangle } from 'lucide-react';
import type { PublicHoliday } from '../../api/client';

interface Deadline {
  name: string;
  description: string;
  dueDate: Date;
  tag: 'ZIMRA' | 'NSSA' | 'NEC' | 'FINANCE';
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function nextWorkingDay(date: Date, holidayDates: Set<string>): Date {
  const d = new Date(date);
  while (d.getDay() === 0 || d.getDay() === 6 || holidayDates.has(dateKey(d))) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

function lastWorkingDay(year: number, month: number, holidayDates: Set<string>): Date {
  const d = new Date(year, month + 1, 0); // last day of month
  while (d.getDay() === 0 || d.getDay() === 6 || holidayDates.has(dateKey(d))) {
    d.setDate(d.getDate() - 1);
  }
  return d;
}

function getUpcomingDeadlines(holidays: PublicHoliday[] = []): Deadline[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Build holiday set — stored as UTC so use UTC accessors
  const holidayDates = new Set<string>(
    holidays.map((h) => {
      const d = new Date(h.date);
      return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
    }),
  );

  const deadlines: Deadline[] = [];

  // PAYE & AIDS Levy, NSSA, NEC for the next 3 months
  for (let offset = 0; offset <= 2; offset++) {
    const ref = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const y = ref.getFullYear();
    const m = ref.getMonth();
    const prevMonth = new Date(y, m - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
    const thisMonth = ref.toLocaleString('default', { month: 'long', year: 'numeric' });

    deadlines.push({
      name: 'PAYE & AIDS Levy',
      description: `${prevMonth} payroll`,
      dueDate: nextWorkingDay(new Date(y, m, 10), holidayDates),
      tag: 'ZIMRA',
    });

    deadlines.push({
      name: 'NSSA Contribution',
      description: `${thisMonth} contributions`,
      dueDate: lastWorkingDay(y, m, holidayDates),
      tag: 'NSSA',
    });

    deadlines.push({
      name: 'NEC Levy',
      description: `${prevMonth} contributions`,
      dueDate: nextWorkingDay(new Date(y, m, 15), holidayDates),
      tag: 'NEC',
    });
  }

  // Provisional Tax (QPD) — Finance team: 25th Mar/Jun/Sep/Dec
  const qpdMonths = [2, 5, 8, 11];
  for (const qm of qpdMonths) {
    const qYear =
      today.getMonth() > qm || (today.getMonth() === qm && today.getDate() > 25)
        ? today.getFullYear() + 1
        : today.getFullYear();
    deadlines.push({
      name: 'Provisional Tax (QPD)',
      description: 'Finance team · ZIMRA',
      dueDate: new Date(qYear, qm, 25),
      tag: 'FINANCE',
    });
  }

  return deadlines
    .filter((d) => d.dueDate >= today)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
    .slice(0, 8);
}

function daysUntil(date: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / 86400000);
}

const TAG_COLORS: Record<string, string> = {
  ZIMRA: 'bg-blue-100 text-blue-600',
  NSSA: 'bg-teal-100 text-teal-600',
  NEC: 'bg-purple-100 text-purple-600',
  FINANCE: 'bg-slate-100 text-slate-500',
};

interface FilingDeadlinesCardProps {
  holidays?: PublicHoliday[];
  compact?: boolean;
}

const FilingDeadlinesCard: React.FC<FilingDeadlinesCardProps> = React.memo(({ holidays = [], compact }) => {
  const deadlines = getUpcomingDeadlines(holidays);

  return (
    <div className="bg-primary rounded-2xl border border-border p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <CalendarClock size={18} className="text-slate-400" />
        <h3 className="font-bold text-sm uppercase tracking-wider text-slate-400">Filing Deadlines</h3>
      </div>

      <div className={compact ? 'grid grid-cols-2 lg:grid-cols-4 gap-3' : 'grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3'}>
        {deadlines.map((d, i) => {
          const days = daysUntil(d.dueDate);
          const urgent = days <= 7;
          const soon = days <= 14;
          const isFinance = d.tag === 'FINANCE';
          const borderColor = isFinance
            ? 'border-border opacity-60'
            : urgent ? 'border-red-200 bg-red-50/40'
            : soon ? 'border-amber-200 bg-amber-50/30'
            : 'border-border';
          const daysColor = urgent && !isFinance ? 'text-red-600' : soon && !isFinance ? 'text-amber-600' : 'text-slate-400';

          return (
            <div key={i} className={`rounded-xl border p-3 flex flex-col gap-2 ${borderColor}`}>
              <div className="flex items-center justify-between gap-1">
                <span className={`text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full ${TAG_COLORS[d.tag]}`}>
                  {d.tag}
                </span>
                {urgent && !isFinance && <AlertTriangle size={13} className="text-red-500 shrink-0" aria-label="Urgent" />}
              </div>
              <div>
                <p className="text-xs font-bold text-navy leading-tight">{d.name}</p>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5 leading-tight">{d.description}</p>
              </div>
              <div className="mt-auto">
                <p className="text-sm font-bold text-navy">{d.dueDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</p>
                <p className={`text-[10px] font-bold ${daysColor}`}>
                  {days === 0 ? 'Due today' : days === 1 ? 'Tomorrow' : `${days} days`}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

FilingDeadlinesCard.displayName = 'FilingDeadlinesCard';

export default FilingDeadlinesCard;
