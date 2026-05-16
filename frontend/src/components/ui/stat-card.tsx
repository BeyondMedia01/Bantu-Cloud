import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import type { LucideIcon } from 'lucide-react';

// ── Count-up hook ─────────────────────────────────────────────────────────────

function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

function useCountUp(target: number, duration = 900, enabled = true): number {
  const [current, setCurrent] = useState(0);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || target === 0) { setCurrent(target); return; }

    startTimeRef.current = null;

    const tick = (now: number) => {
      if (startTimeRef.current === null) startTimeRef.current = now;
      const elapsed = now - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      setCurrent(target * easeOutExpo(progress));
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration, enabled]);

  return current;
}

// ── Value parser ──────────────────────────────────────────────────────────────

// Extracts: prefix ($, USD, ZiG), numeric part, suffix, decimal places
function parseValue(value: string | number): {
  numeric: number;
  prefix: string;
  suffix: string;
  decimals: number;
  raw: string;
} {
  if (typeof value === 'number') {
    return { numeric: value, prefix: '', suffix: '', decimals: 0, raw: String(value) };
  }

  const str = String(value).trim();
  const match = str.match(/^([^0-9\-]*)([0-9,]+(?:\.[0-9]*)?)([^0-9]*)$/);
  if (!match) return { numeric: 0, prefix: '', suffix: '', decimals: 0, raw: str };

  const [, prefix, numStr, suffix] = match;
  const cleaned = numStr.replace(/,/g, '');
  const numeric = parseFloat(cleaned) || 0;
  const decimals = cleaned.includes('.') ? cleaned.split('.')[1].length : 0;

  return { numeric, prefix, suffix, decimals, raw: str };
}

function formatNumber(n: number, decimals: number): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: string;
  trendDirection?: 'up' | 'down' | 'neutral';
  icon?: LucideIcon;
  /** Disable count-up animation (e.g. for string values, loading states) */
  animate?: boolean;
  className?: string;
}

const trendColors = {
  up:      'text-success',
  down:    'text-destructive',
  neutral: 'text-muted-foreground',
};

export function StatCard({
  label,
  value,
  trend,
  trendDirection = 'neutral',
  icon: Icon,
  animate = true,
  className,
}: StatCardProps) {
  const parsed = React.useMemo(() => parseValue(value), [value]);

  // Only animate numeric values
  const shouldAnimate = animate && parsed.numeric > 0;
  const animated = useCountUp(parsed.numeric, 900, shouldAnimate);

  const displayValue = shouldAnimate
    ? `${parsed.prefix}${formatNumber(animated, parsed.decimals)}${parsed.suffix}`
    : parsed.raw;

  return (
    <Card className={className}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate">
              {label}
            </p>
            <p
              className="mt-1.5 stat-value-large leading-none tabular-num"
              aria-label={`${label}: ${parsed.raw}`}
            >
              {displayValue}
            </p>
            {trend && (
              <p className={cn('mt-1.5 text-xs font-medium', trendColors[trendDirection])}>
                {trend}
              </p>
            )}
          </div>
          {Icon && (
            <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
              <Icon size={18} className="text-muted-foreground" aria-hidden="true" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
