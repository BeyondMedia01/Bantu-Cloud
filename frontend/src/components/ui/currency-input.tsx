import * as React from 'react';
import { cn } from '@/lib/utils';

type Currency = 'USD' | 'ZIG';

interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  currency: Currency;
  value: string | number;
  onChange: (value: string) => void;
  /** Show the converted equivalent below the field */
  showConversion?: boolean;
  /** Exchange rate (USD per 1 ZiG, or ZiG per 1 USD depending on direction) */
  conversionRate?: number;
  /** The other currency to show converted amount in */
  convertTo?: Currency;
  error?: string;
  label?: string;
}

const CURRENCY_CONFIG: Record<Currency, { symbol: string; label: string; className: string; placeholder: string }> = {
  USD: {
    symbol: 'USD',
    label: 'US Dollar',
    className: 'currency-usd',
    placeholder: '0.00',
  },
  ZIG: {
    symbol: 'ZiG',
    label: 'Zimbabwe Gold',
    className: 'currency-zig',
    placeholder: '0.00',
  },
};

function formatAmount(value: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function CurrencyInput({
  currency,
  value,
  onChange,
  showConversion = false,
  conversionRate,
  convertTo,
  error,
  label,
  className,
  disabled,
  ...props
}: CurrencyInputProps) {
  const config = CURRENCY_CONFIG[currency];
  const numericValue = typeof value === 'string' ? parseFloat(value) || 0 : value || 0;

  const convertedAmount = React.useMemo(() => {
    if (!showConversion || !conversionRate || !convertTo || !numericValue) return null;
    const converted = currency === 'USD'
      ? numericValue * conversionRate
      : numericValue / conversionRate;
    return { amount: converted, currency: convertTo };
  }, [numericValue, conversionRate, convertTo, showConversion, currency]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Allow digits, one decimal point, and leading minus
    const raw = e.target.value.replace(/[^0-9.]/g, '');
    onChange(raw);
  }

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {label && (
        <label className="text-sm font-medium text-foreground">
          {label}
        </label>
      )}

      <div
        className={cn(
          'flex items-center rounded-lg border bg-background transition-colors',
          'focus-within:ring-2 focus-within:ring-ring/50 focus-within:border-ring',
          error ? 'border-destructive focus-within:ring-destructive/30' : 'border-input',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        {/* Currency symbol badge */}
        <span
          className={cn(
            'flex items-center justify-center px-3 py-2 rounded-l-lg border-r text-xs font-semibold font-mono-financial select-none',
            currency === 'USD'
              ? 'bg-[var(--color-usd-bg)] text-[var(--color-usd)] border-[var(--color-usd-bg)]'
              : 'bg-[var(--color-zig-bg)] text-[var(--color-zig)] border-[var(--color-zig-bg)]',
          )}
          aria-label={config.label}
        >
          {config.symbol}
        </span>

        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={handleChange}
          disabled={disabled}
          placeholder={config.placeholder}
          className={cn(
            'flex-1 bg-transparent px-3 py-2 text-sm text-foreground tabular-num',
            'focus:outline-none',
            'placeholder:text-muted-foreground',
            disabled && 'cursor-not-allowed',
          )}
          aria-invalid={!!error}
          {...props}
        />
      </div>

      {/* Conversion hint */}
      {convertedAmount && (
        <p className={cn(
          'text-xs tabular-num',
          convertedAmount.currency === 'USD' ? 'currency-usd' : 'currency-zig',
        )}>
          ≈ {CURRENCY_CONFIG[convertedAmount.currency].symbol}{' '}
          {formatAmount(convertedAmount.amount)}
          {conversionRate && (
            <span className="text-muted-foreground ml-1">
              @ {currency === 'USD' ? conversionRate.toFixed(4) : (1 / conversionRate).toFixed(4)} rate
            </span>
          )}
        </p>
      )}

      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Dual-currency pair — USD and ZiG fields side by side */
interface DualCurrencyInputProps {
  usdValue: string;
  zigValue: string;
  onUsdChange: (v: string) => void;
  onZigChange: (v: string) => void;
  conversionRate?: number;
  usdError?: string;
  zigError?: string;
  disabled?: boolean;
  className?: string;
}

export function DualCurrencyInput({
  usdValue,
  zigValue,
  onUsdChange,
  onZigChange,
  conversionRate,
  usdError,
  zigError,
  disabled,
  className,
}: DualCurrencyInputProps) {
  return (
    <div className={cn('grid grid-cols-2 gap-3', className)}>
      <CurrencyInput
        currency="USD"
        value={usdValue}
        onChange={onUsdChange}
        showConversion={!!conversionRate}
        conversionRate={conversionRate}
        convertTo="ZIG"
        error={usdError}
        label="USD Amount"
        disabled={disabled}
      />
      <CurrencyInput
        currency="ZIG"
        value={zigValue}
        onChange={onZigChange}
        showConversion={!!conversionRate}
        conversionRate={conversionRate}
        convertTo="USD"
        error={zigError}
        label="ZiG Amount"
        disabled={disabled}
      />
    </div>
  );
}
