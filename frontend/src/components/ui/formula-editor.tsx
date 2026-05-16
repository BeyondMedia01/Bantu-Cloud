import React, { useCallback, useMemo, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import {
  autocompletion,
  type CompletionContext,
  type Completion,
} from '@codemirror/autocomplete';
import { EditorView } from '@codemirror/view';
import { Play, CheckCircle2, AlertCircle, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Built-in payroll variables ────────────────────────────────────────────────

const PAYROLL_VARS: Completion[] = [
  { label: 'baseSalary',   type: 'variable', info: 'Employee base/basic salary for the period',               boost: 10 },
  { label: 'gross',        type: 'variable', info: 'Total gross pay (baseSalary + all earnings)',              boost: 9  },
  { label: 'hoursWorked',  type: 'variable', info: 'Total hours worked in the period',                         boost: 8  },
  { label: 'overtime',     type: 'variable', info: 'Overtime hours worked (above standard shift)',             boost: 8  },
  { label: 'grade',        type: 'variable', info: 'Employee grade code (string, e.g. "A", "B1", "C")',       boost: 7  },
  { label: 'daysWorked',   type: 'variable', info: 'Calendar days worked in the period',                      boost: 6  },
  { label: 'nssa',         type: 'variable', info: 'NSSA employee contribution already deducted',              boost: 5  },
  { label: 'paye',         type: 'variable', info: 'PAYE tax calculated for this period',                     boost: 5  },
  { label: 'currency',     type: 'variable', info: '"USD" or "ZIG" — employee\'s pay currency',               boost: 4  },
];

const PAYROLL_FUNCTIONS: Completion[] = [
  { label: 'max',   type: 'function', info: 'max(a, b) — Returns the larger of two values'  },
  { label: 'min',   type: 'function', info: 'min(a, b) — Returns the smaller of two values' },
  { label: 'round', type: 'function', info: 'round(n, decimals) — Round to decimal places'  },
  { label: 'abs',   type: 'function', info: 'abs(n) — Absolute value'                       },
  { label: 'floor', type: 'function', info: 'floor(n) — Round down'                         },
  { label: 'ceil',  type: 'function', info: 'ceil(n) — Round up'                            },
];

function payrollCompletions(context: CompletionContext) {
  const word = context.matchBefore(/\w*/);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  return {
    from: word.from,
    options: [...PAYROLL_VARS, ...PAYROLL_FUNCTIONS],
    validFor: /^\w*$/,
  };
}

// ── Formula evaluator (safe sandbox) ─────────────────────────────────────────

interface EvalResult {
  value: number | null;
  error: string | null;
}

function evalFormula(formula: string, vars: Record<string, number | string>): EvalResult {
  try {
    const keys = Object.keys(vars);
    const vals = Object.values(vars);
    // eslint-disable-next-line no-new-func
    const fn = new Function(...keys, `"use strict"; return (${formula});`);
    const result = fn(...vals);
    if (typeof result !== 'number' || !isFinite(result)) {
      return { value: null, error: 'Formula must return a number' };
    }
    return { value: result, error: null };
  } catch (e: any) {
    return { value: null, error: e.message ?? 'Syntax error' };
  }
}

// ── Sample values for test run ────────────────────────────────────────────────

const DEFAULT_SAMPLE: Record<string, number | string> = {
  baseSalary:  1000,
  gross:       1200,
  hoursWorked: 176,
  overtime:    8,
  grade:       'A',
  daysWorked:  22,
  nssa:        45,
  paye:        120,
  currency:    'USD',
};

// ── Component ─────────────────────────────────────────────────────────────────

interface FormulaEditorProps {
  value: string;
  onChange: (v: string) => void;
  error?: string;
  disabled?: boolean;
  className?: string;
}

export function FormulaEditor({ value, onChange, error, disabled, className }: FormulaEditorProps) {
  const [testResult, setTestResult] = useState<EvalResult | null>(null);
  const [sampleValues, setSampleValues] = useState(DEFAULT_SAMPLE);
  const [showSamples, setShowSamples] = useState(false);
  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );

  // Re-check dark mode when the component re-renders
  React.useEffect(() => {
    const obs = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  const extensions = useMemo(() => [
    javascript(),
    autocompletion({ override: [payrollCompletions] }),
    EditorView.lineWrapping,
    EditorView.theme({
      '&': { fontSize: '13px', fontFamily: "'IBM Plex Mono', 'Menlo', monospace" },
      '.cm-content': { padding: '10px 0' },
      '.cm-line': { padding: '0 12px' },
      '.cm-focused': { outline: 'none' },
      '.cm-editor': { borderRadius: '0.5rem' },
    }),
  ], []);

  const handleTest = useCallback(() => {
    if (!value.trim()) return;
    const result = evalFormula(value, sampleValues);
    setTestResult(result);
  }, [value, sampleValues]);

  const handleBlur = useCallback(() => {
    if (value.trim()) handleTest();
  }, [value, handleTest]);

  return (
    <div className={cn('flex flex-col gap-2', className)}>

      {/* Editor */}
      <div
        className={cn(
          'rounded-lg border overflow-hidden transition-colors',
          error ? 'border-destructive ring-1 ring-destructive/30' : 'border-input focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/50',
          disabled && 'opacity-50 pointer-events-none',
        )}
      >
        <CodeMirror
          value={value}
          onChange={onChange}
          onBlur={handleBlur}
          extensions={extensions}
          theme={isDark ? oneDark : 'light'}
          basicSetup={{
            lineNumbers: false,
            foldGutter: false,
            highlightActiveLine: false,
            autocompletion: true,
          }}
          placeholder="e.g. max(0, baseSalary * 0.05 - 100)"
          minHeight="72px"
          maxHeight="160px"
          readOnly={disabled}
        />
      </div>

      {/* Variable reference chips */}
      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="text-[11px] text-muted-foreground font-medium">Variables:</span>
        {PAYROLL_VARS.slice(0, 5).map(v => (
          <button
            key={v.label}
            type="button"
            onClick={() => onChange(value + (value ? ' ' : '') + v.label)}
            title={String(v.info)}
            className="font-mono-financial text-[11px] px-2 py-0.5 bg-muted hover:bg-muted/80 text-foreground/80 rounded cursor-pointer transition-colors"
          >
            {v.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowSamples(s => !s)}
          className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          <HelpCircle size={11} /> {showSamples ? 'Hide' : 'Edit'} sample values
        </button>
      </div>

      {/* Editable sample values */}
      {showSamples && (
        <div className="p-3 bg-muted/50 border border-border rounded-lg">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Sample values for test run</p>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(sampleValues).filter(([, v]) => typeof v === 'number').map(([k, v]) => (
              <label key={k} className="flex flex-col gap-0.5">
                <span className="font-mono-financial text-[11px] text-muted-foreground">{k}</span>
                <input
                  type="number"
                  value={v as number}
                  onChange={e => setSampleValues(s => ({ ...s, [k]: parseFloat(e.target.value) || 0 }))}
                  className="text-xs px-2 py-1 bg-background border border-border rounded tabular-num focus:outline-none focus:ring-1 focus:ring-ring/50"
                />
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Test button + result */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleTest}
          disabled={!value.trim() || disabled}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-muted hover:bg-muted/80 rounded-lg transition-colors disabled:opacity-40"
        >
          <Play size={11} /> Test formula
        </button>

        {testResult && (
          <div className={cn(
            'flex items-center gap-1.5 text-xs font-medium',
            testResult.error ? 'text-destructive' : 'text-success',
          )}>
            {testResult.error
              ? <><AlertCircle size={13} /> {testResult.error}</>
              : <><CheckCircle2 size={13} /> Result: <span className="tabular-num font-semibold">{testResult.value?.toFixed(2)}</span></>
            }
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-destructive flex items-center gap-1" role="alert">
          <AlertCircle size={12} /> {error}
        </p>
      )}
    </div>
  );
}
