import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { ReactNode } from 'react';

interface PageShellProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function PageShell({ title, subtitle, onBack, actions, children, className }: PageShellProps) {
  return (
    <div className={cn('max-w-3xl', className)}>
      <div className="flex items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          {onBack && (
            <Button variant="ghost" size="icon" onClick={onBack} aria-label="Go back">
              <ArrowLeft size={20} />
            </Button>
          )}
          <div>
            <h1 className="text-2xl font-bold text-navy">{title}</h1>
            {subtitle && <p className="text-muted-foreground font-medium text-sm">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
