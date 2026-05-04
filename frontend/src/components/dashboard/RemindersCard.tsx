import React from 'react';
import type { ReminderItem } from '../../api/client';

function initials(name: string): string {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

const AVATAR_COLORS = [
  'bg-rose-100 text-rose-600 dark:bg-rose-900 dark:text-rose-300',
  'bg-amber-100 text-amber-600 dark:bg-amber-900 dark:text-amber-300',
  'bg-violet-100 text-violet-600 dark:bg-violet-900 dark:text-violet-300',
  'bg-teal-100 text-teal-600 dark:bg-teal-900 dark:text-teal-300',
  'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300',
  'bg-emerald-100 text-emerald-600 dark:bg-emerald-900 dark:text-emerald-300',
];

interface RemindersCardProps {
  reminders: { birthdays: ReminderItem[]; anniversaries: ReminderItem[] };
  loading?: boolean;
  selectedDay: Date;
}

const RemindersCard: React.FC<RemindersCardProps> = React.memo(({ reminders, loading, selectedDay }) => {
  const all = [
    ...reminders.birthdays.map((b) => ({ ...b, kind: 'birthday' as const })),
    ...reminders.anniversaries.map((a) => ({ ...a, kind: 'anniversary' as const })),
  ].filter((item) => {
    const d = new Date(item.date);
    return d.getMonth() === selectedDay.getMonth() && d.getDate() === selectedDay.getDate();
  });

  const total = all.length;
  const formattedSelectedDay = selectedDay.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-[10px] uppercase tracking-widest text-muted-foreground">Events: {formattedSelectedDay}</h3>
        {total > 0 && (
          <span className="bg-navy text-white text-[10px] font-black px-1.5 py-0.5 rounded">
            {total}
          </span>
        )}
      </div>

      {loading ? (
        <div className="animate-pulse flex flex-col gap-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-border">
              <div className="w-10 h-10 rounded-full bg-muted shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-28 bg-muted rounded" />
                <div className="h-2 w-20 bg-muted/60 rounded" />
              </div>
              <div className="h-8 w-14 bg-muted rounded-lg shrink-0" />
            </div>
          ))}
        </div>
      ) : total === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <p className="text-xs text-muted-foreground font-medium italic">No events recorded for this date.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {all.map((item, i) => {
            const isBirthday = item.kind === 'birthday';
            const colorClass = AVATAR_COLORS[i % AVATAR_COLORS.length];

            return (
              <div key={`${item.kind}-${item.id}`} className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border border-border hover:border-accent-green/30 transition-colors">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-xs font-black ${colorClass}`}>
                  {initials(item.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-navy truncate">{item.name}</p>
                  <p className="text-[10px] text-muted-foreground font-medium truncate">
                    {item.position}
                    {!isBirthday && item.years && item.years > 0 && ` • ${item.years}yr`}
                  </p>
                </div>
                <div className="shrink-0 text-right opacity-80">
                  <p className="text-[14px]">{isBirthday ? '🎂' : '🎊'}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

RemindersCard.displayName = 'RemindersCard';

export default RemindersCard;
