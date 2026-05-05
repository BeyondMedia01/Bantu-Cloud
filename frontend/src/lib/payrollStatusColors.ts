export const RUN_STATUS_CLASS: Record<string, string> = {
  DRAFT: 'bg-muted text-foreground/80',
  PENDING_APPROVAL: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  APPROVED: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  PROCESSING: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300',
  COMPLETED: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300',
  ERROR: 'bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-300',
};
