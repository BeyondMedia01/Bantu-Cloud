import { cn } from '@/lib/utils';

// Context-aware status styles — same label can mean different things in different domains.
// e.g. APPROVED in a payroll run (authorized, not yet final) vs APPROVED leave (final positive).
// Pass `context` to disambiguate.
type StatusContext = 'payroll_run' | 'leave' | 'loan' | 'employee' | 'encashment' | 'default';

const STYLES_BY_CONTEXT: Record<StatusContext, Record<string, string>> = {
  payroll_run: {
    PREVIEW:   'run-status-preview border-transparent',
    SUBMITTED: 'run-status-submitted border-transparent',
    APPROVED:  'run-status-approved border-transparent',
    PROCESSED: 'run-status-processed border-transparent',
  },
  leave: {
    PENDING:   'bg-warning-bg text-warning border-warning-border',
    APPROVED:  'bg-success-bg text-success border-success-border',
    REJECTED:  'bg-destructive-bg text-destructive border-destructive/30',
    CANCELLED: 'bg-muted text-muted-foreground/80 border-border',
  },
  loan: {
    ACTIVE:      'bg-info-bg text-info border-info-border',
    PAID:        'bg-success-bg text-success border-success-border',
    PAID_OFF:    'bg-success-bg text-success border-success-border',
    WRITTEN_OFF: 'bg-muted text-muted-foreground/80 border-border',
    DEFAULTED:   'bg-destructive-bg text-destructive border-destructive/30',
  },
  employee: {
    ACTIVE:     'bg-success-bg text-success border-success-border',
    SUSPENDED:  'bg-warning-bg text-warning border-warning-border',
    TERMINATED: 'bg-destructive-bg text-destructive border-destructive/30',
  },
  encashment: {
    PENDING:   'bg-warning-bg text-warning border-warning-border',
    APPROVED:  'bg-info-bg text-info border-info-border',
    PROCESSED: 'bg-success-bg text-success border-success-border',
  },
  default: {
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
  },
};

// Human-readable labels for payroll run statuses
const STATUS_LABELS: Record<string, string> = {
  PREVIEW:   'Draft',
  SUBMITTED: 'Submitted',
  APPROVED:  'Approved',
  PROCESSED: 'Processed',
  PAID_OFF:  'Paid off',
  WRITTEN_OFF: 'Written off',
  IN_PROGRESS: 'In progress',
  NOT_STARTED: 'Not started',
  PENDING_APPROVAL: 'Pending approval',
};

interface StatusBadgeProps {
  status: string;
  context?: StatusContext;
  className?: string;
}

export function StatusBadge({ status, context = 'default', className }: StatusBadgeProps) {
  const key = status?.toUpperCase() ?? '';

  const contextStyles = STYLES_BY_CONTEXT[context] ?? {};
  const defaultStyles = STYLES_BY_CONTEXT.default;
  const styles = contextStyles[key] ?? defaultStyles[key] ?? 'bg-muted text-muted-foreground/80 border-border';

  const label = STATUS_LABELS[key] ?? (
    status
      ? status.charAt(0).toUpperCase() + status.slice(1).toLowerCase().replace(/_/g, ' ')
      : '—'
  );

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border tabular-num',
        styles,
        className,
      )}
      aria-label={`Status: ${label}`}
    >
      {label}
    </span>
  );
}
