import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<string, string> = {
  ACTIVE:           'bg-success-bg text-success border-success-border',
  INACTIVE:         'bg-muted text-muted-foreground/80 border-border',
  DISCHARGED:       'bg-destructive-bg text-destructive border-destructive/30',
  SUSPENDED:        'bg-warning-bg text-warning border-warning-border',
  APPROVED:         'bg-success-bg text-success border-success-border',
  PENDING:          'bg-warning-bg text-warning border-warning-border',
  REJECTED:         'bg-destructive-bg text-destructive border-destructive/30',
  CANCELLED:        'bg-muted text-muted-foreground/80 border-border',
  PAID:             'bg-success-bg text-success border-success-border',
  UNPAID:           'bg-destructive-bg text-destructive border-destructive/30',
  DRAFT:            'bg-muted text-muted-foreground/80 border-border',
  PROCESSING:       'bg-info-bg text-info border-info-border',
  COMPLETED:        'bg-success-bg text-success border-success-border',
  FAILED:           'bg-destructive-bg text-destructive border-destructive/30',
  DEFAULTED:        'bg-destructive-bg text-destructive border-destructive/30',
  OPEN:             'bg-info-bg text-info border-info-border',
  CLOSED:           'bg-muted text-muted-foreground/80 border-border',
  SHORTLISTED:      'bg-warning-bg text-warning border-warning-border',
  DUE:              'bg-warning-bg text-warning border-warning-border',
  PROCESSED:        'bg-success-bg text-success border-success-border',
  OVERDUE:          'bg-destructive-bg text-destructive border-destructive/30',
  PAID_OFF:         'bg-success-bg text-success border-success-border',
  AVAILABLE:        'bg-success-bg text-success border-success-border',
  ASSIGNED:         'bg-info-bg text-info border-info-border',
  MAINTENANCE:      'bg-warning-bg text-warning border-warning-border',
  RETIRED:          'bg-muted text-muted-foreground/80 border-border',
  LOST:             'bg-destructive-bg text-destructive border-destructive/30',
  FILLED:           'bg-info-bg text-info border-info-border',
  PUBLISHED:        'bg-success-bg text-success border-success-border',
  NEW:              'bg-info-bg text-info border-info-border',
  SCREENING:        'bg-warning-bg text-warning border-warning-border',
  INTERVIEWING:     'bg-info-bg text-info border-info-border',
  OFFERED:          'bg-success-bg text-success border-success-border',
  HIRED:            'bg-success-bg text-success border-success-border',
  WITHDRAWN:        'bg-muted text-muted-foreground/80 border-border',
  IN_PROGRESS:      'bg-info-bg text-info border-info-border',
  NOT_STARTED:      'bg-muted text-muted-foreground/80 border-border',
  PENDING_APPROVAL: 'bg-warning-bg text-warning border-warning-border',
  ERROR:            'bg-destructive-bg text-destructive border-destructive/30',
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
