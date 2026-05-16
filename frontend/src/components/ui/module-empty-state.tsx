import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// ── SVG illustrations ─────────────────────────────────────────────────────────
// Each illustration uses CSS variables so they respect light/dark mode.

function OrgChartIllustration() {
  return (
    <svg width="120" height="88" viewBox="0 0 120 88" fill="none" aria-hidden="true">
      {/* Root node */}
      <rect x="40" y="4" width="40" height="22" rx="5" fill="var(--color-brand)" opacity="0.25" />
      <rect x="40" y="4" width="40" height="22" rx="5" stroke="var(--color-brand)" strokeWidth="1.5" strokeDasharray="4 2" />
      <circle cx="60" cy="15" r="4" fill="var(--color-brand)" opacity="0.6" />
      {/* Connector lines */}
      <line x1="60" y1="26" x2="60" y2="38" stroke="var(--color-border)" strokeWidth="1.5" />
      <line x1="20" y1="38" x2="100" y2="38" stroke="var(--color-border)" strokeWidth="1.5" />
      <line x1="20" y1="38" x2="20" y2="46" stroke="var(--color-border)" strokeWidth="1.5" />
      <line x1="60" y1="38" x2="60" y2="46" stroke="var(--color-border)" strokeWidth="1.5" />
      <line x1="100" y1="38" x2="100" y2="46" stroke="var(--color-border)" strokeWidth="1.5" />
      {/* Child nodes — dotted (empty) */}
      {[0, 40, 80].map((x) => (
        <rect key={x} x={x} y="46" width="40" height="20" rx="4" fill="var(--color-muted)" stroke="var(--color-border)" strokeWidth="1.5" strokeDasharray="3 2" />
      ))}
      {/* Leaf connectors */}
      <line x1="20" y1="66" x2="20" y2="76" stroke="var(--color-border)" strokeWidth="1" />
      <line x1="60" y1="66" x2="60" y2="76" stroke="var(--color-border)" strokeWidth="1" />
      <line x1="100" y1="66" x2="100" y2="76" stroke="var(--color-border)" strokeWidth="1" />
      {[0, 40, 80].map((x) => (
        <rect key={x} x={x + 4} y="76" width="32" height="10" rx="3" fill="var(--color-muted)" opacity="0.5" />
      ))}
    </svg>
  );
}

function CalendarEmptyIllustration() {
  return (
    <svg width="100" height="88" viewBox="0 0 100 88" fill="none" aria-hidden="true">
      {/* Calendar body */}
      <rect x="8" y="16" width="84" height="68" rx="8" fill="var(--color-card)" stroke="var(--color-border)" strokeWidth="1.5" />
      {/* Header bar */}
      <rect x="8" y="16" width="84" height="22" rx="8" fill="var(--color-brand)" opacity="0.15" />
      <rect x="8" y="30" width="84" height="8" fill="var(--color-brand)" opacity="0.15" />
      {/* Calendar pins */}
      <rect x="28" y="8" width="6" height="14" rx="3" fill="var(--color-brand)" opacity="0.5" />
      <rect x="66" y="8" width="6" height="14" rx="3" fill="var(--color-brand)" opacity="0.5" />
      {/* Grid dots (empty days) */}
      {[0,1,2,3,4,5,6].map(col =>
        [0,1,2,3].map(row => (
          <circle key={`${col}-${row}`}
            cx={18 + col * 11}
            cy={52 + row * 10}
            r="3"
            fill="var(--color-muted)"
            opacity={col === 3 && row === 1 ? "0" : "1"}
          />
        ))
      )}
      {/* One highlighted day — pending */}
      <circle cx="51" cy="62" r="5" fill="var(--color-brand)" opacity="0.3" />
      <circle cx="51" cy="62" r="3" fill="var(--color-brand)" opacity="0.7" />
    </svg>
  );
}

function PayrollRunIllustration() {
  return (
    <svg width="110" height="88" viewBox="0 0 110 88" fill="none" aria-hidden="true">
      {/* Document stack */}
      <rect x="22" y="20" width="58" height="62" rx="6" fill="var(--color-muted)" stroke="var(--color-border)" strokeWidth="1.5" />
      <rect x="16" y="14" width="58" height="62" rx="6" fill="var(--color-card)" stroke="var(--color-border)" strokeWidth="1.5" />
      {/* Header line */}
      <rect x="24" y="24" width="42" height="5" rx="2.5" fill="var(--color-brand)" opacity="0.4" />
      {/* Amount lines */}
      <rect x="24" y="36" width="26" height="3.5" rx="1.75" fill="var(--color-muted)" />
      <rect x="58" y="36" width="8" height="3.5" rx="1.75" fill="var(--color-success)" opacity="0.6" />
      <rect x="24" y="44" width="22" height="3.5" rx="1.75" fill="var(--color-muted)" />
      <rect x="58" y="44" width="8" height="3.5" rx="1.75" fill="var(--color-destructive)" opacity="0.5" />
      <rect x="24" y="52" width="18" height="3.5" rx="1.75" fill="var(--color-muted)" />
      <rect x="58" y="52" width="8" height="3.5" rx="1.75" fill="var(--color-destructive)" opacity="0.5" />
      {/* Divider */}
      <line x1="24" y1="62" x2="74" y2="62" stroke="var(--color-border)" strokeWidth="1" />
      {/* Net pay — prominent */}
      <rect x="24" y="66" width="20" height="5" rx="2.5" fill="var(--color-muted)" />
      <rect x="54" y="65" width="14" height="6" rx="3" fill="var(--color-success)" opacity="0.5" />
    </svg>
  );
}

function LoanIllustration() {
  return (
    <svg width="100" height="88" viewBox="0 0 100 88" fill="none" aria-hidden="true">
      {/* Balance scale base */}
      <rect x="44" y="72" width="12" height="14" rx="2" fill="var(--color-muted)" />
      <rect x="32" y="68" width="36" height="6" rx="3" fill="var(--color-muted)" />
      {/* Beam */}
      <line x1="10" y1="36" x2="90" y2="36" stroke="var(--color-border)" strokeWidth="2" />
      <line x1="50" y1="36" x2="50" y2="68" stroke="var(--color-border)" strokeWidth="2" />
      {/* Left pan — coin stack (loan amount) */}
      {[0, 6, 12].map(y => (
        <ellipse key={y} cx="22" cy={58 - y} rx="14" ry="5" fill="var(--color-brand)" opacity={0.3 + y * 0.04} stroke="var(--color-brand)" strokeWidth="0.5" />
      ))}
      {/* Right pan — single smaller coins (repaid) */}
      {[0].map(y => (
        <ellipse key={y} cx="78" cy={56 - y} rx="10" ry="4" fill="var(--color-success)" opacity="0.4" stroke="var(--color-success)" strokeWidth="0.5" />
      ))}
      {/* Strings */}
      <line x1="10" y1="36" x2="22" y2="46" stroke="var(--color-border)" strokeWidth="1.5" />
      <line x1="90" y1="36" x2="78" y2="46" stroke="var(--color-border)" strokeWidth="1.5" />
    </svg>
  );
}

function ReportsIllustration() {
  return (
    <svg width="110" height="88" viewBox="0 0 110 88" fill="none" aria-hidden="true">
      {/* Bar chart bars */}
      <rect x="12" y="56" width="14" height="24" rx="3" fill="var(--color-brand)" opacity="0.25" />
      <rect x="32" y="40" width="14" height="40" rx="3" fill="var(--color-brand)" opacity="0.4" />
      <rect x="52" y="28" width="14" height="52" rx="3" fill="var(--color-brand)" opacity="0.55" />
      <rect x="72" y="48" width="14" height="32" rx="3" fill="var(--color-brand)" opacity="0.35" />
      <rect x="92" y="36" width="14" height="44" rx="3" fill="var(--color-brand)" opacity="0.5" />
      {/* Axis */}
      <line x1="8" y1="80" x2="108" y2="80" stroke="var(--color-border)" strokeWidth="1.5" />
      <line x1="8" y1="8" x2="8" y2="80" stroke="var(--color-border)" strokeWidth="1.5" />
      {/* Trend line overlay */}
      <polyline
        points="19,58 39,44 59,32 79,50 99,40"
        fill="none"
        stroke="var(--color-brand)"
        strokeWidth="2"
        strokeDasharray="4 2"
        opacity="0.8"
      />
    </svg>
  );
}

// ── Module config ─────────────────────────────────────────────────────────────

export type EmptyModule =
  | 'employees'
  | 'payroll'
  | 'leave'
  | 'loans'
  | 'reports'
  | 'attendance'
  | 'shifts'
  | 'expenses'
  | 'assets';

interface ModuleEmptyConfig {
  illustration: React.ReactNode;
  title: string;
  description: string;
}

const MODULE_CONFIG: Record<EmptyModule, ModuleEmptyConfig> = {
  employees: {
    illustration: <OrgChartIllustration />,
    title: 'No employees yet',
    description: 'Add your first employee or import from a CSV file to get started.',
  },
  payroll: {
    illustration: <PayrollRunIllustration />,
    title: 'No payroll runs',
    description: 'Create your first payroll run for the current period.',
  },
  leave: {
    illustration: <CalendarEmptyIllustration />,
    title: 'No leave requests',
    description: 'Leave requests will appear here once employees submit them.',
  },
  loans: {
    illustration: <LoanIllustration />,
    title: 'No active loans',
    description: 'Issue a loan to an employee and it will appear here with the repayment schedule.',
  },
  reports: {
    illustration: <ReportsIllustration />,
    title: 'No reports yet',
    description: 'Select a report type and date range to generate your first report.',
  },
  attendance: {
    illustration: <CalendarEmptyIllustration />,
    title: 'No attendance records',
    description: 'Attendance records appear once biometric devices sync or manual entries are made.',
  },
  shifts: {
    illustration: <CalendarEmptyIllustration />,
    title: 'No shifts defined',
    description: 'Define shift patterns before assigning them to employees.',
  },
  expenses: {
    illustration: <LoanIllustration />,
    title: 'No expense claims',
    description: 'Expense claims submitted by employees will appear here for approval.',
  },
  assets: {
    illustration: <OrgChartIllustration />,
    title: 'No assets tracked',
    description: 'Add company assets and assign them to employees.',
  },
};

// ── Component ─────────────────────────────────────────────────────────────────

interface ModuleEmptyStateProps {
  module: EmptyModule;
  /** Override the default title */
  title?: string;
  /** Override the default description */
  description?: string;
  /** Primary CTA */
  action?: { label: string; onClick: () => void };
  /** Secondary CTA (e.g. "Import CSV") */
  secondaryAction?: { label: string; onClick: () => void };
  className?: string;
}

export function ModuleEmptyState({
  module,
  title,
  description,
  action,
  secondaryAction,
  className,
}: ModuleEmptyStateProps) {
  const config = MODULE_CONFIG[module];

  return (
    <div className={cn(
      'flex flex-col items-center justify-center py-14 px-8 text-center gap-5',
      className,
    )}>
      {/* Illustration with subtle glow */}
      <div className="relative flex items-center justify-center">
        <div
          className="absolute inset-0 rounded-full blur-2xl opacity-20"
          style={{ background: 'var(--color-brand)', transform: 'scale(0.8)' }}
          aria-hidden="true"
        />
        <div className="relative">{config.illustration}</div>
      </div>

      {/* Text */}
      <div className="flex flex-col gap-1.5 max-w-xs">
        <h3 className="text-base font-semibold text-foreground">{title ?? config.title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{description ?? config.description}</p>
      </div>

      {/* Actions */}
      {(action || secondaryAction) && (
        <div className="flex items-center gap-2 flex-wrap justify-center">
          {action && (
            <Button variant="default" onClick={action.onClick} size="sm">
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button variant="outline" onClick={secondaryAction.onClick} size="sm">
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
