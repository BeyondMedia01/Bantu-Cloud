import { Inbox, SearchX, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { LucideIcon } from 'lucide-react';

type EmptyStateVariant = 'no-data' | 'no-results' | 'error';

const defaultIcons: Record<EmptyStateVariant, LucideIcon> = {
  'no-data': Inbox,
  'no-results': SearchX,
  'error': AlertTriangle,
};

interface EmptyStateProps {
  variant: EmptyStateVariant;
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}

export function EmptyState({ variant, icon, title, description, action, className }: EmptyStateProps) {
  const Icon = icon ?? defaultIcons[variant];
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 px-6 text-center', className)}>
      <Icon size={40} className="text-muted-foreground/50 dark:text-foreground/80 mb-4" aria-hidden="true" />
      <h3 className="text-sm font-semibold text-navy dark:text-slate-100 mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground dark:text-muted-foreground max-w-sm mb-6">{description}</p>
      {action && (
        <Button variant="default" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
