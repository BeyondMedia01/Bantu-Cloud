import React from 'react';
import MiniCalendar from './MiniCalendar';
import RemindersCard from './RemindersCard';
import type { PublicHoliday } from '../../api/client';
import type { ReminderItem } from '../../api/client';

interface UnifiedCalendarCardProps {
  reminders: { birthdays: ReminderItem[]; anniversaries: ReminderItem[] };
  holidays: PublicHoliday[];
  selectedDay: Date;
  onDateSelect: (d: Date) => void;
  loading: boolean;
}

const UnifiedCalendarCard: React.FC<UnifiedCalendarCardProps> = ({
  reminders,
  holidays,
  selectedDay,
  onDateSelect,
  loading,
}) => (
  <div className="bg-primary rounded-2xl border border-border shadow-sm h-full flex flex-col overflow-hidden">
    <MiniCalendar
      reminders={reminders}
      holidays={holidays}
      selectedDay={selectedDay}
      onDateSelect={onDateSelect}
    />
    <div className="h-px bg-border mx-4" />
    <div className="flex-1 overflow-hidden">
      <RemindersCard reminders={reminders} loading={loading} selectedDay={selectedDay} />
    </div>
  </div>
);

export default UnifiedCalendarCard;
