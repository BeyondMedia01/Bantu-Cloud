import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import type { ReminderItem, PublicHoliday } from '../../api/client';

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface MiniCalendarProps {
  reminders: { birthdays: ReminderItem[]; anniversaries: ReminderItem[] };
  holidays?: PublicHoliday[];
  selectedDay: Date;
  onDateSelect: (date: Date) => void;
}

type PickerMode = 'day' | 'month' | 'year';

const MiniCalendar: React.FC<MiniCalendarProps> = React.memo(({ reminders, holidays = [], selectedDay, onDateSelect }) => {
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(selectedDay.getFullYear(), selectedDay.getMonth(), 1));
  const [mode, setMode] = useState<PickerMode>('day');
  // year-range picker: show a 12-year grid starting from this base
  const [yearBase, setYearBase] = useState(() => Math.floor(viewDate.getFullYear() / 12) * 12);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const eventDays = new Set<number>();
  [...reminders.birthdays, ...reminders.anniversaries].forEach((r) => {
    const d = new Date(r.date);
    if (d.getMonth() === month && d.getFullYear() === year) eventDays.add(d.getDate());
  });

  const holidayMap = new Map<number, string>();
  holidays.forEach((h) => {
    const d = new Date(h.date);
    if (d.getUTCMonth() === month && d.getUTCFullYear() === year) holidayMap.set(d.getUTCDate(), h.name);
  });

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const isToday = (day: number) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  const goToToday = () => {
    setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));
    setMode('day');
  };

  const cycleMode = () => {
    if (mode === 'day') setMode('month');
    else if (mode === 'month') { setYearBase(Math.floor(year / 12) * 12); setMode('year'); }
    else setMode('day');
  };

  // ── Year picker ──────────────────────────────────────────────────────────────
  if (mode === 'year') {
    const years = Array.from({ length: 12 }, (_, i) => yearBase + i);
    return (
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setYearBase(y => y - 12)} aria-label="Previous years"
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-navy transition-colors">
            <ChevronLeft size={16} />
          </button>
          <button onClick={cycleMode} className="text-sm font-bold text-navy hover:text-accent-green transition-colors flex items-center gap-1">
            {yearBase}–{yearBase + 11} <ChevronUp size={14} />
          </button>
          <button onClick={() => setYearBase(y => y + 12)} aria-label="Next years"
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-navy transition-colors">
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {years.map((y) => (
            <button
              key={y}
              onClick={() => { setViewDate(new Date(y, month, 1)); setMode('month'); }}
              className={`py-2 rounded-xl text-xs font-bold transition-colors
                ${y === year ? 'bg-brand text-navy' : y === today.getFullYear() ? 'border-2 border-brand text-navy' : 'hover:bg-slate-100 text-slate-600'}`}
            >
              {y}
            </button>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-border flex justify-center">
          <button onClick={goToToday} className="text-xs font-bold text-accent-green hover:underline">Today</button>
        </div>
      </div>
    );
  }

  // ── Month picker ─────────────────────────────────────────────────────────────
  if (mode === 'month') {
    return (
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setViewDate(new Date(year - 1, month, 1))} aria-label="Previous year"
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-navy transition-colors">
            <ChevronLeft size={16} />
          </button>
          <button onClick={cycleMode} className="text-sm font-bold text-navy hover:text-accent-green transition-colors flex items-center gap-1">
            {year} <ChevronUp size={14} />
          </button>
          <button onClick={() => setViewDate(new Date(year + 1, month, 1))} aria-label="Next year"
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-navy transition-colors">
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {MONTHS.map((m, i) => (
            <button
              key={m}
              onClick={() => { setViewDate(new Date(year, i, 1)); setMode('day'); }}
              className={`py-2 rounded-xl text-xs font-bold transition-colors
                ${i === month && year === viewDate.getFullYear() ? 'bg-brand text-navy' : i === today.getMonth() && year === today.getFullYear() ? 'border-2 border-brand text-navy' : 'hover:bg-slate-100 text-slate-600'}`}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-border flex justify-center">
          <button onClick={goToToday} className="text-xs font-bold text-accent-green hover:underline">Today</button>
        </div>
      </div>
    );
  }

  // ── Day picker (default) ─────────────────────────────────────────────────────
  return (
    <div className="p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setViewDate(new Date(year, month - 1, 1))} aria-label="Previous month"
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-navy transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center">
          <ChevronLeft size={16} />
        </button>
        <button
          onClick={cycleMode}
          className="text-sm font-bold text-navy hover:text-accent-green transition-colors flex items-center gap-1"
          aria-label="Pick month and year"
        >
          {viewDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
          <ChevronUp size={14} />
        </button>
        <button onClick={() => setViewDate(new Date(year, month + 1, 1))} aria-label="Next month"
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-navy transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center">
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map((d, i) => (
          <p key={d} className={`text-center text-[10px] font-bold uppercase tracking-wider py-1 ${i === 0 || i === 6 ? 'text-slate-300' : 'text-slate-400'}`}>{d}</p>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, i) => {
          if (!day) return <div key={`e-${i}`} />;
          const col = (firstDay + day - 1) % 7;
          const isWeekend = col === 0 || col === 6;
          const isToday_ = isToday(day);
          const isSelected = day === selectedDay.getDate() && month === selectedDay.getMonth() && year === selectedDay.getFullYear();
          const hasEvent = eventDays.has(day);
          const holidayName = holidayMap.get(day);

          return (
            <div
              key={day}
              title={holidayName}
              className="flex flex-col items-center py-0.5 cursor-pointer"
              onClick={() => onDateSelect(new Date(year, month, day))}
            >
              <div className={`w-8 h-8 flex flex-col items-center justify-center rounded-full text-xs font-bold transition-all
                ${isSelected
                  ? 'bg-brand text-navy shadow-sm'
                  : isToday_
                    ? 'bg-brand/20 border-2 border-brand text-navy'
                    : holidayName
                      ? 'bg-orange-50 text-orange-700 hover:bg-orange-100'
                      : isWeekend
                        ? 'text-slate-300 hover:bg-slate-100'
                        : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {day}
                {(holidayName || hasEvent) && !isSelected && (
                  <div className="flex gap-0.5 mt-0.5">
                    {holidayName && <div className="w-1 h-1 rounded-full bg-orange-400" />}
                    {hasEvent && <div className="w-1 h-1 rounded-full bg-brand" />}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer — legend + today */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
        <div className="flex items-center gap-3">
          {holidayMap.size > 0 && (
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-orange-400" />
              <span className="text-[10px] text-slate-400 font-bold">Holiday</span>
            </div>
          )}
          {eventDays.size > 0 && (
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-brand" />
              <span className="text-[10px] text-slate-400 font-bold">Birthday/Anniv.</span>
            </div>
          )}
        </div>
        <button onClick={goToToday} className="text-[10px] font-bold text-accent-green hover:underline">
          Today
        </button>
      </div>
    </div>
  );
});

MiniCalendar.displayName = 'MiniCalendar';

export default MiniCalendar;
