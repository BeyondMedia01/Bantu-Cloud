import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: string;
  trendDirection?: 'up' | 'down' | 'neutral';
  icon?: LucideIcon;
  className?: string;
}

const trendColors = {
  up: 'text-emerald-600 dark:text-emerald-400',
  down: 'text-destructive',
  neutral: 'text-muted-foreground',
};

export function StatCard({ label, value, trend, trendDirection = 'neutral', icon: Icon, className }: StatCardProps) {
  return (
    <Card className={className}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-bold text-navy">{value}</p>
            {trend && (
              <p className={cn('mt-1 text-xs font-medium', trendColors[trendDirection])}>
                {trend}
              </p>
            )}
          </div>
          {Icon && (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Icon size={20} className="text-muted-foreground" aria-hidden="true" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
