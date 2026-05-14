import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<string, string> = {
  ACTIVE:     'bg-success-bg text-success border-success-border',
  INACTIVE:   'bg-muted text-muted-foreground/80 border-border',
  DISCHARGED: 'bg-destructive-bg text-destructive border-destructive/30',
  SUSPENDED:  'bg-warning-bg text-warning border-warning-border',
  APPROVED:   'bg-success-bg text-success border-success-border',
  PENDING:    'bg-warning-bg text-warning border-warning-border',
  REJECTED:   'bg-destructive-bg text-destructive border-destructive/30',
  CANCELLED:  'bg-muted text-muted-foreground/80 border-border',
  PAID:       'bg-success-bg text-success border-success-border',
  UNPAID:     'bg-destructive-bg text-destructive border-destructive/30',
  DRAFT:      'bg-muted text-muted-foreground/80 border-border',
  PROCESSING: 'bg-info-bg text-info border-info-border',
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const key = status?.toUpperCase() ?? '';
  const styles = STATUS_STYLES[key] ?? 'bg-muted text-muted-foreground/80 border-border';
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
