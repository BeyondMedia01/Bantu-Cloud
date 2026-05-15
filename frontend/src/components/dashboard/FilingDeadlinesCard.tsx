import React, { useState, useCallback } from 'react';
import { CalendarClock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { PublicHoliday } from '../../api/client';
import { getActiveCompanyId } from '../../lib/companyContext';

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

  const seen = new Set<string>();
  return deadlines
    .filter((d) => d.dueDate >= today)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
    .filter((d) => {
      if (seen.has(d.name)) return false;
      seen.add(d.name);
      return true;
    })
    .slice(0, 8);
}

function daysUntil(date: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / 86400000);
}

const TAG_COLORS: Record<string, string> = {
  ZIMRA: 'bg-success-bg text-success',
  NSSA: 'bg-info-bg text-info',
  NEC: 'bg-warning-bg text-warning',
  FINANCE: 'bg-muted text-muted-foreground',
};

interface FilingDeadlinesCardProps {
  holidays?: PublicHoliday[];
}

function filedKey(companyId: string, name: string, dueDate: Date): string {
  return `filing-filed:${companyId}:${name}:${dueDate.toISOString().slice(0, 10)}`;
}

const FilingDeadlinesCard: React.FC<FilingDeadlinesCardProps> = React.memo(({ holidays = [] }) => {
  const deadlines = getUpcomingDeadlines(holidays);
  const companyId = getActiveCompanyId() ?? 'default';

  const [filed, setFiled] = useState<Set<string>>(() => {
    const keys = new Set<string>();
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith('filing-filed:')) keys.add(k);
      }
    } catch {}
    return keys;
  });

  const toggle = useCallback((d: { name: string; dueDate: Date }) => {
    const k = filedKey(companyId, d.name, d.dueDate);
    setFiled(prev => {
      const next = new Set(prev);
      if (next.has(k)) {
        try { localStorage.removeItem(k); } catch {}
        next.delete(k);
      } else {
        try { localStorage.setItem(k, '1'); } catch {}
        next.add(k);
      }
      return next;
    });
  }, [companyId]);

  return (
    <div className="bg-primary rounded-2xl border border-border p-6 shadow-sm h-full flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <CalendarClock size={18} className="text-muted-foreground" />
        <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Filing Deadlines</h3>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1 auto-rows-fr">
        {deadlines.map((d, i) => {
          const k = filedKey(companyId, d.name, d.dueDate);
          const isFiled = filed.has(k);
          const days = daysUntil(d.dueDate);
          const urgent = !isFiled && days <= 7;
          const soon = !isFiled && days <= 14;
          const isFinance = d.tag === 'FINANCE';
          const borderColor = isFiled
            ? 'border-success-border bg-success-bg/30'
            : isFinance ? 'border-border opacity-60'
            : urgent ? 'border-red-200 bg-red-50/40'
            : soon ? 'border-amber-200 bg-amber-50/30'
            : 'border-border';
          const daysColor = isFiled ? 'text-success' : urgent && !isFinance ? 'text-red-600' : soon && !isFinance ? 'text-amber-600' : 'text-muted-foreground';

          return (
            <div key={i} className={`rounded-xl border p-3 flex flex-col gap-2 h-full ${borderColor}`}>
              <div className="flex items-center justify-between gap-1">
                <span className={`text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full ${TAG_COLORS[d.tag]}`}>
                  {d.tag}
                </span>
                {isFiled
                  ? <CheckCircle2 size={13} className="text-success shrink-0" aria-label="Filed" />
                  : urgent && !isFinance && <AlertTriangle size={13} className="text-red-500 shrink-0" aria-label="Urgent" />
                }
              </div>
              <div>
                <p className={`text-xs font-bold leading-tight ${isFiled ? 'text-muted-foreground line-through' : 'text-navy'}`}>{d.name}</p>
                <p className="text-[10px] text-muted-foreground font-medium mt-0.5 leading-tight">{d.description}</p>
              </div>
              <div className="mt-auto flex items-end justify-between gap-1">
                <div>
                  <p className={`text-sm font-bold ${isFiled ? 'text-muted-foreground' : 'text-navy'}`}>{d.dueDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</p>
                  <p className={`text-[10px] font-bold ${daysColor}`}>
                    {isFiled ? 'Filed' : days === 0 ? 'Due today' : days === 1 ? 'Tomorrow' : `${days} days`}
                  </p>
                </div>
                <button
                  onClick={() => toggle(d)}
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors ${
                    isFiled
                      ? 'border-success-border text-success hover:bg-destructive-bg hover:text-destructive hover:border-destructive/30'
                      : 'border-border text-muted-foreground hover:border-success-border hover:text-success hover:bg-success-bg'
                  }`}
                  title={isFiled ? 'Undo' : 'Mark as filed'}
                >
                  {isFiled ? 'Undo' : 'File'}
                </button>
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
