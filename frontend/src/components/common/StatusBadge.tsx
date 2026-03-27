import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<string, string> = {
  ACTIVE:     'bg-emerald-50 text-emerald-700 border-emerald-100',
  INACTIVE:   'bg-slate-50 text-slate-600 border-slate-100',
  DISCHARGED: 'bg-red-50 text-red-700 border-red-100',
  SUSPENDED:  'bg-amber-50 text-amber-700 border-amber-100',
  APPROVED:   'bg-emerald-50 text-emerald-700 border-emerald-100',
  PENDING:    'bg-amber-50 text-amber-700 border-amber-100',
  REJECTED:   'bg-red-50 text-red-700 border-red-100',
  CANCELLED:  'bg-slate-50 text-slate-600 border-slate-100',
  PAID:       'bg-emerald-50 text-emerald-700 border-emerald-100',
  UNPAID:     'bg-red-50 text-red-700 border-red-100',
  DRAFT:      'bg-slate-50 text-slate-600 border-slate-100',
  PROCESSING: 'bg-blue-50 text-blue-700 border-blue-100',
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const key = status?.toUpperCase() ?? '';
  const styles = STATUS_STYLES[key] ?? 'bg-slate-50 text-slate-600 border-slate-100';
  const label = status
    ? status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()
    : '—';

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border',
        styles,
        className,
      )}
      aria-label={`Status: ${label}`}
    >
      {label}
    </span>
  );
}
