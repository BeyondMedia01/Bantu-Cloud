import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReminderItem, PublicHoliday } from '../../api/client';

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

interface MiniCalendarProps {
  reminders: { birthdays: ReminderItem[]; anniversaries: ReminderItem[] };
  holidays?: PublicHoliday[];
  selectedDay: Date;
  onDateSelect: (date: Date) => void;
}

const MiniCalendar: React.FC<MiniCalendarProps> = React.memo(({ reminders, holidays = [], selectedDay, onDateSelect }) => {
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(selectedDay.getFullYear(), selectedDay.getMonth(), 1));

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Collect event dates (birthday + anniversary)
  const eventDays = new Set<number>();
  [...reminders.birthdays, ...reminders.anniversaries].forEach((r) => {
    const d = new Date(r.date);
    if (d.getMonth() === month && d.getFullYear() === year) eventDays.add(d.getDate());
  });

  // Collect holiday dates — stored as UTC so use UTC accessors
  const holidayMap = new Map<number, string>();
  holidays.forEach((h) => {
    const d = new Date(h.date);
    if (d.getUTCMonth() === month && d.getUTCFullYear() === year) {
      holidayMap.set(d.getUTCDate(), h.name);
    }
  });

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const isToday = (day: number) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  return (
    <div className="p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} aria-label="Previous month" className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center">
          <ChevronLeft size={16} />
        </button>
        <p className="text-sm font-bold text-navy">
          {viewDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
        </p>
        <button onClick={nextMonth} aria-label="Next month" className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center">
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map((d) => (
          <p key={d} className="text-center text-[10px] font-bold text-muted-foreground uppercase tracking-wider py-1">{d}</p>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, i) => {
          if (!day) return <div key={`e-${i}`} />;
          const isToday_ = isToday(day);
          const isSelected = day === selectedDay.getDate() && month === selectedDay.getMonth() && year === selectedDay.getFullYear();
          const hasEvent = eventDays.has(day);
          const holidayName = holidayMap.get(day);

          return (
            <div
              key={day}
              className="group flex flex-col items-center py-0.5"
              onClick={() => onDateSelect(new Date(year, month, day))}
            >
              <div
                aria-label={holidayName ?? undefined}
                className={`cursor-pointer w-8 h-8 flex flex-col items-center justify-center rounded-xl text-xs font-bold transition-all
                  ${isSelected
                    ? 'bg-brand text-navy shadow-md transform scale-105'
                    : isToday_
                      ? 'bg-brand/20 border-2 border-brand text-navy'
                      : holidayName
                        ? 'bg-orange-50 text-orange-700 hover:bg-orange-100 dark:bg-orange-950 dark:text-orange-300 dark:hover:bg-orange-900'
                        : 'text-foreground hover:bg-muted'}`}
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

      {/* Legend */}
      {(holidayMap.size > 0 || eventDays.size > 0) && (
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border">
          {holidayMap.size > 0 && (
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-orange-400" />
              <span className="text-[10px] text-muted-foreground font-bold">Holiday</span>
            </div>
          )}
          {eventDays.size > 0 && (
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-brand" />
              <span className="text-[10px] text-muted-foreground font-bold">Birthday/Anniv.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

MiniCalendar.displayName = 'MiniCalendar';

export default MiniCalendar;
