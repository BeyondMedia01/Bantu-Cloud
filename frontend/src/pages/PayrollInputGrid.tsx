import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Save, RefreshCw, List, X, CheckCircle2,
  AlertTriangle, LayoutGrid,
} from 'lucide-react';
import { PayrollInputAPI, EmployeeAPI, TransactionCodeAPI, PayrollAPI } from '../api/client';

// ─── types ───────────────────────────────────────────────────────────────────

interface TxCode {
  id: string;
  code: string;
  name: string;
  type: 'EARNING' | 'DEDUCTION' | 'BENEFIT';
  taxable: boolean;
}

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  baseRate?: number;
}

interface CellData {
  value: string;
  inputId?: string;
}

interface Summary {
  gross: number;
  paye: number;
  nssa: number;
  net: number;
  source: 'estimate' | 'server';
}

type Grid = Record<string, Record<string, CellData>>;

// ─── client-side PAYE estimator (2024 monthly bands, fallback only) ───────────

const USD_BANDS = [
  { lower: 0, upper: 100, rate: 0, fixed: 0 },
  { lower: 100, upper: 300, rate: 0.2, fixed: 0 },
  { lower: 300, upper: 1000, rate: 0.25, fixed: 40 },
  { lower: 1000, upper: 2000, rate: 0.3, fixed: 215 },
  { lower: 2000, upper: 3000, rate: 0.35, fixed: 515 },
  { lower: 3000, upper: Infinity, rate: 0.4, fixed: 865 },
];

const ZIG_BANDS = [
  { lower: 0, upper: 2800, rate: 0, fixed: 0 },
  { lower: 2800, upper: 8400, rate: 0.2, fixed: 0 },
  { lower: 8400, upper: 28000, rate: 0.25, fixed: 1120 },
  { lower: 28000, upper: 56000, rate: 0.3, fixed: 6020 },
  { lower: 56000, upper: 84000, rate: 0.35, fixed: 14420 },
  { lower: 84000, upper: Infinity, rate: 0.4, fixed: 24220 },
];

const NSSA_CEILING: Record<string, number> = { USD: 700, ZiG: 20000 };

function estimatePaye(gross: number, currency: string): Summary {
  const bands = currency === 'ZiG' ? ZIG_BANDS : USD_BANDS;
  const ceiling = NSSA_CEILING[currency] ?? 700;
  const nssa = Math.min(gross, ceiling) * 0.045;
  const taxable = Math.max(0, gross - nssa);
  const band = [...bands].reverse().find((b) => taxable > b.lower) ?? bands[0];
  const rawPaye = Math.max(0, band.fixed + (taxable - band.lower) * band.rate);
  const aidsLevy = rawPaye * 0.03;
  const totalPaye = rawPaye + aidsLevy;
  return {
    gross,
    paye: totalPaye,
    nssa,
    net: Math.max(0, gross - totalPaye - nssa),
    source: 'estimate',
  };
}

function computeSummary(grid: Grid, empId: string, activeCols: TxCode[], currency: string): Summary {
  let gross = 0;
  for (const tc of activeCols) {
    const val = parseFloat(grid[empId]?.[tc.id]?.value || '0') || 0;
    if (tc.type === 'EARNING' || tc.type === 'BENEFIT') gross += val;
    else if (tc.type === 'DEDUCTION') gross -= val;
  }
  return estimatePaye(Math.max(0, gross), currency);
}

// ─── component ───────────────────────────────────────────────────────────────

const PayrollInputGrid: React.FC = () => {
  const navigate = useNavigate();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [allTxCodes, setAllTxCodes] = useState<TxCode[]>([]);
  const [activeCols, setActiveCols] = useState<TxCode[]>([]);
  const [grid, setGrid] = useState<Grid>({});
  const [summaries, setSummaries] = useState<Record<string, Summary>>({});
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [currency, setCurrency] = useState('USD');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [error, setError] = useState('');
  const [dirtySet, setDirtySet] = useState<Set<string>>(new Set());
  const [warnings, setWarnings] = useState<Record<string, string>>({});
  const [showColPicker, setShowColPicker] = useState(false);
  const [focusedCell, setFocusedCell] = useState<{ empIdx: number; colIdx: number } | null>(null);

  // ── load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [empRes, tcRes, inputRes] = await Promise.all([
        EmployeeAPI.getAll({ limit: '500' }),
        TransactionCodeAPI.getAll(),
        PayrollInputAPI.getAll({ period }),
      ]);

      const emps: Employee[] = (empRes.data as any).data || empRes.data || [];
      const tcs: TxCode[] = (tcRes.data as any) || [];
      const inputs: any[] = (inputRes.data as any) || [];

      setEmployees(emps);
      setAllTxCodes(tcs);

      // Build grid from existing inputs
      const newGrid: Grid = {};
      for (const emp of emps) newGrid[emp.id] = {};

      const seenTcIds = new Set<string>();
      for (const inp of inputs) {
        if (!newGrid[inp.employeeId]) newGrid[inp.employeeId] = {};
        const amount = inp.employeeUSD || inp.employeeZiG || 0;
        newGrid[inp.employeeId][inp.transactionCodeId] = {
          value: amount ? String(amount) : '',
          inputId: inp.id,
        };
        seenTcIds.add(inp.transactionCodeId);
      }

      // Determine initial visible columns
      const cols: TxCode[] = [];
      const basicTc = tcs.find((t) => t.code === 'BASIC' || t.code === 'BASIC_SALARY');
      if (basicTc) cols.push(basicTc);
      for (const id of seenTcIds) {
        const tc = tcs.find((t) => t.id === id);
        if (tc && !cols.find((c) => c.id === id)) cols.push(tc);
      }
      if (cols.length === 0) {
        const fallback = tcs.find((t) => t.type === 'EARNING');
        if (fallback) cols.push(fallback);
      }

      setGrid(newGrid);
      setActiveCols(cols);
      setDirtySet(new Set());

      // Compute initial summaries
      const newSummaries: Record<string, Summary> = {};
      for (const emp of emps) {
        newSummaries[emp.id] = computeSummary(newGrid, emp.id, cols, currency);
      }
      setSummaries(newSummaries);
    } catch {
      setError('Failed to load payroll grid data');
    } finally {
      setLoading(false);
    }
  }, [period, currency]);

  useEffect(() => { load(); }, [load]);

  // ── cell change ───────────────────────────────────────────────────────────

  const handleCellChange = (empId: string, tcId: string, value: string) => {
    const newGrid = {
      ...grid,
      [empId]: { ...grid[empId], [tcId]: { ...grid[empId]?.[tcId], value } },
    };
    setGrid(newGrid);
    setDirtySet((prev) => new Set(prev).add(`${empId}:${tcId}`));
    setSummaries((prev) => ({ ...prev, [empId]: computeSummary(newGrid, empId, activeCols, currency) }));

    const num = parseFloat(value);
    const warnKey = `${empId}:${tcId}`;
    if (!isNaN(num) && num > 50000) {
      setWarnings((w) => ({ ...w, [warnKey]: 'Unusually high amount — please verify' }));
    } else {
      setWarnings((w) => { const n = { ...w }; delete n[warnKey]; return n; });
    }
  };

  // ── column management ─────────────────────────────────────────────────────

  const addColumn = (tc: TxCode) => {
    const newCols = [...activeCols, tc];
    setActiveCols(newCols);
    setShowColPicker(false);
    setSummaries((prev) => {
      const next = { ...prev };
      for (const emp of employees) {
        next[emp.id] = computeSummary(grid, emp.id, newCols, currency);
      }
      return next;
    });
  };

  const removeColumn = (tcId: string) => {
    const newCols = activeCols.filter((c) => c.id !== tcId);
    setActiveCols(newCols);
    setSummaries((prev) => {
      const next = { ...prev };
      for (const emp of employees) {
        next[emp.id] = computeSummary(grid, emp.id, newCols, currency);
      }
      return next;
    });
  };

  // ── save all ──────────────────────────────────────────────────────────────

  const handleSaveAll = async () => {
    setSaving(true);
    setError('');
    setSaveMsg('');
    const keys = [...dirtySet];
    const gridUpdates: Record<string, Record<string, CellData>> = {};
    let saved = 0;
    let failed = 0;

    for (const key of keys) {
      const [empId, tcId] = key.split(':');
      const cell = grid[empId]?.[tcId];
      if (!cell) continue;

      const amountNum = parseFloat(cell.value) || 0;
      const amountField = currency === 'ZiG' ? 'employeeZiG' : 'employeeUSD';

      try {
        if (cell.inputId) {
          if (amountNum === 0 || !cell.value) {
            await PayrollInputAPI.delete(cell.inputId);
            if (!gridUpdates[empId]) gridUpdates[empId] = {};
            gridUpdates[empId][tcId] = { value: '', inputId: undefined };
          } else {
            await PayrollInputAPI.update(cell.inputId, { [amountField]: amountNum, period });
            if (!gridUpdates[empId]) gridUpdates[empId] = {};
            gridUpdates[empId][tcId] = { value: cell.value, inputId: cell.inputId };
          }
        } else if (amountNum > 0) {
          const res = await PayrollInputAPI.create({
            employeeId: empId,
            transactionCodeId: tcId,
            [amountField]: amountNum,
            period,
          });
          if (!gridUpdates[empId]) gridUpdates[empId] = {};
          gridUpdates[empId][tcId] = { value: cell.value, inputId: res.data.id };
        }
        saved++;
      } catch {
        failed++;
      }
    }

    setGrid((prev) => {
      const next = { ...prev };
      for (const [eid, updates] of Object.entries(gridUpdates)) {
        next[eid] = { ...prev[eid], ...updates };
      }
      return next;
    });
    setDirtySet(new Set());
    setSaving(false);

    if (failed > 0) {
      setError(`Saved ${saved}, failed ${failed}`);
    } else {
      setSaveMsg(`${saved} input(s) saved for ${period}`);
      setTimeout(() => setSaveMsg(''), 4000);
    }
  };

  // ── server preview ────────────────────────────────────────────────────────

  const handleServerPreview = async () => {
    setPreviewing(true);
    setError('');
    try {
      const inputs: any[] = [];
      for (const emp of employees) {
        for (const tc of activeCols) {
          const val = parseFloat(grid[emp.id]?.[tc.id]?.value || '0') || 0;
          if (val !== 0) inputs.push({ employeeId: emp.id, transactionCodeId: tc.id, amount: val });
        }
      }
      if (!inputs.length) return;
      const res = await PayrollAPI.preview({ inputs, currency, period });
      setSummaries((prev) => {
        const next = { ...prev };
        for (const r of res.data) {
          next[r.employeeId] = { ...r, source: 'server' };
        }
        return next;
      });
    } catch {
      setError('Server preview failed — showing client estimates');
    } finally {
      setPreviewing(false);
    }
  };

  // ── Excel paste ───────────────────────────────────────────────────────────

  const handleGridPaste = (e: React.ClipboardEvent) => {
    if (!focusedCell) return;
    const text = e.clipboardData.getData('text/plain');
    if (!text.includes('\t') && !text.includes('\n')) return; // not a grid paste

    e.preventDefault();
    const rows = text.trim().split('\n').map((r) => r.split('\t'));
    let newGrid = { ...grid };

    for (let ri = 0; ri < rows.length; ri++) {
      const empIdx = focusedCell.empIdx + ri;
      if (empIdx >= employees.length) break;
      const emp = employees[empIdx];

      for (let ci = 0; ci < rows[ri].length; ci++) {
        const colIdx = focusedCell.colIdx + ci;
        if (colIdx >= activeCols.length) break;
        const tc = activeCols[colIdx];
        const raw = rows[ri][ci].trim().replace(/[^\d.-]/g, '');
        if (!raw) continue;

        newGrid = {
          ...newGrid,
          [emp.id]: { ...newGrid[emp.id], [tc.id]: { ...newGrid[emp.id]?.[tc.id], value: raw } },
        };
        setDirtySet((prev) => new Set(prev).add(`${emp.id}:${tc.id}`));
      }
    }

    setGrid(newGrid);
    // Recompute all summaries after paste
    setSummaries((prev) => {
      const next = { ...prev };
      for (const emp of employees) {
        next[emp.id] = computeSummary(newGrid, emp.id, activeCols, currency);
      }
      return next;
    });
  };

  // ── render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <RefreshCw size={22} className="animate-spin mr-2" /> Loading grid…
      </div>
    );
  }

  const hasDirty = dirtySet.size > 0;
  const available = allTxCodes.filter((t) => !activeCols.find((c) => c.id === t.id));

  const totalGross = Object.values(summaries).reduce((s, v) => s + (v?.gross || 0), 0);
  const totalPaye = Object.values(summaries).reduce((s, v) => s + (v?.paye || 0), 0);
  const totalNet = Object.values(summaries).reduce((s, v) => s + (v?.net || 0), 0);

  const serverPreviewActive = Object.values(summaries).some((s) => s?.source === 'server');

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <div className="flex items-center gap-2">
            <LayoutGrid size={18} className="text-accent-blue" />
            <h1 className="text-xl font-bold">Payroll Input Grid</h1>
          </div>
          <p className="text-slate-500 text-xs font-medium mt-0.5">
            Inline editing · Ctrl+V pastes from Excel · Enter moves down
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-2 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/20 bg-primary"
          />
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="px-3 py-2 border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/20 bg-primary"
          >
            <option value="USD">USD</option>
            <option value="ZiG">ZiG</option>
          </select>
          <button
            onClick={handleServerPreview}
            disabled={previewing}
            title="Get accurate PAYE from server tax tables"
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold border border-border bg-primary hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw size={13} className={previewing ? 'animate-spin' : ''} />
            {serverPreviewActive ? 'Refresh' : 'Preview'}
          </button>
          <button
            onClick={handleSaveAll}
            disabled={saving || !hasDirty}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold shadow disabled:opacity-50 ${
              hasDirty ? 'bg-btn-primary text-navy' : 'bg-slate-100 text-slate-400 border border-border'
            }`}
          >
            <Save size={13} />
            {saving ? 'Saving…' : hasDirty ? `Save (${dirtySet.size})` : 'Saved'}
          </button>
          <button
            onClick={() => navigate('/payroll/inputs')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold border border-border bg-primary hover:bg-slate-50"
          >
            <List size={13} /> List View
          </button>
        </div>
      </div>

      {/* Banners */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
          <AlertTriangle size={14} /> {error}
        </div>
      )}
      {saveMsg && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 font-medium">
          <CheckCircle2 size={14} /> {saveMsg}
        </div>
      )}
      {Object.keys(warnings).length > 0 && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <div>
            <span className="font-bold">Unusual values: </span>
            {Object.keys(warnings).length} cell(s) may need review
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto" onPaste={handleGridPaste}>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b-2 border-border">
                {/* Sticky employee column */}
                <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider min-w-[180px] border-r border-border">
                  Employee
                </th>

                {/* Transaction code columns */}
                {activeCols.map((tc) => (
                  <th key={tc.id} className="px-3 py-3 min-w-[110px] text-center">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            tc.type === 'EARNING' ? 'bg-emerald-400' :
                            tc.type === 'DEDUCTION' ? 'bg-red-400' : 'bg-blue-400'
                          }`}
                        />
                        <span className="text-xs font-black text-slate-600 truncate">{tc.code}</span>
                      </div>
                      <button
                        onClick={() => removeColumn(tc.id)}
                        className="text-slate-300 hover:text-red-400 flex-shrink-0"
                        title={`Remove ${tc.code}`}
                      >
                        <X size={11} />
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400 font-normal mt-0.5 text-left truncate max-w-[100px]">
                      {tc.name}
                    </p>
                  </th>
                ))}

                {/* Add column button */}
                <th className="px-3 py-3 min-w-[60px] relative">
                  <button
                    onClick={() => setShowColPicker((v) => !v)}
                    className="flex items-center gap-1 text-xs font-bold text-accent-blue hover:text-navy whitespace-nowrap"
                  >
                    <Plus size={12} /> Add
                  </button>
                  {showColPicker && (
                    <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-border rounded-xl shadow-xl z-30 max-h-52 overflow-y-auto">
                      <div className="px-3 py-2 border-b border-border">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Add Column</p>
                      </div>
                      {available.length === 0 ? (
                        <p className="px-4 py-3 text-xs text-slate-400">All codes are already columns</p>
                      ) : (
                        available.map((tc) => (
                          <button
                            key={tc.id}
                            onClick={() => addColumn(tc)}
                            className="w-full text-left px-4 py-2.5 hover:bg-slate-50 text-sm flex items-center gap-2"
                          >
                            <span
                              className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                                tc.type === 'EARNING' ? 'bg-emerald-100 text-emerald-700' :
                                tc.type === 'DEDUCTION' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                              }`}
                            >
                              {tc.type.slice(0, 3)}
                            </span>
                            <span className="font-medium">{tc.code}</span>
                            <span className="text-slate-400 text-xs">{tc.name}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </th>

                {/* Summary columns */}
                <th className="px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider min-w-[90px] border-l-2 border-border text-right">
                  Gross
                </th>
                <th className="px-3 py-3 text-xs font-bold text-red-400 uppercase tracking-wider min-w-[90px] text-right">
                  PAYE {serverPreviewActive ? '' : '(est.)'}
                </th>
                <th className="px-3 py-3 text-xs font-bold text-emerald-600 uppercase tracking-wider min-w-[90px] text-right">
                  Net {serverPreviewActive ? '' : '(est.)'}
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border">
              {employees.map((emp, empIdx) => {
                const sum = summaries[emp.id];
                return (
                  <tr key={emp.id} className="group hover:bg-slate-50/40">
                    {/* Sticky employee name */}
                    <td className="sticky left-0 z-10 bg-primary group-hover:bg-slate-50/40 px-4 py-2 border-r border-border">
                      <p className="text-sm font-bold text-navy leading-tight">
                        {emp.firstName} {emp.lastName}
                      </p>
                      <p className="text-[11px] text-slate-400 font-semibold">{emp.employeeCode}</p>
                    </td>

                    {/* Editable cells */}
                    {activeCols.map((tc, colIdx) => {
                      const cell = grid[emp.id]?.[tc.id];
                      const val = cell?.value ?? '';
                      const isWarn = !!warnings[`${emp.id}:${tc.id}`];
                      const isDirty = dirtySet.has(`${emp.id}:${tc.id}`);
                      return (
                        <td key={tc.id} className="px-2 py-1.5">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={val}
                            placeholder="—"
                            data-cell={`${emp.id}:${tc.id}`}
                            onChange={(e) => handleCellChange(emp.id, tc.id, e.target.value)}
                            onFocus={() => setFocusedCell({ empIdx, colIdx })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const nextEmp = employees[empIdx + 1];
                                if (nextEmp) {
                                  (document.querySelector(
                                    `[data-cell="${nextEmp.id}:${tc.id}"]`
                                  ) as HTMLInputElement | null)?.focus();
                                }
                              }
                            }}
                            className={`w-full px-2.5 py-1.5 rounded-lg text-sm font-medium text-right
                              focus:outline-none focus:ring-2 transition-all
                              ${isWarn
                                ? 'border border-amber-300 bg-amber-50 focus:ring-amber-200 text-amber-800'
                                : isDirty
                                  ? 'border border-blue-300 bg-blue-50/70 focus:ring-blue-200'
                                  : 'border border-transparent bg-slate-100 hover:bg-white hover:border-border focus:ring-accent-blue/20 focus:bg-white'
                              }`}
                          />
                        </td>
                      );
                    })}

                    {/* Spacer for "Add" header */}
                    <td />

                    {/* Summary */}
                    <td className="px-3 py-2 border-l-2 border-border text-right">
                      <span className="text-sm font-bold text-navy">
                        {sum ? sum.gross.toFixed(2) : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className="text-sm font-medium text-red-500">
                        {sum ? sum.paye.toFixed(2) : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className={`text-sm font-bold ${sum && sum.net < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                        {sum ? sum.net.toFixed(2) : '—'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {/* Totals row */}
            {employees.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-border bg-slate-50">
                  <td className="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-xs font-black text-slate-500 uppercase tracking-wider border-r border-border">
                    Totals
                  </td>
                  {activeCols.map((tc) => {
                    const total = employees.reduce(
                      (s, emp) => s + (parseFloat(grid[emp.id]?.[tc.id]?.value || '0') || 0),
                      0
                    );
                    return (
                      <td key={tc.id} className="px-2 py-3 text-right">
                        <span className="text-sm font-bold text-slate-600">
                          {total > 0 ? total.toFixed(2) : <span className="text-slate-300">—</span>}
                        </span>
                      </td>
                    );
                  })}
                  <td />
                  <td className="px-3 py-3 border-l-2 border-border text-right">
                    <span className="text-sm font-black">{totalGross.toFixed(2)}</span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className="text-sm font-black text-red-600">{totalPaye.toFixed(2)}</span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className="text-sm font-black text-emerald-700">{totalNet.toFixed(2)}</span>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Footer legend */}
        <div className="px-4 py-2.5 border-t border-border bg-slate-50/70 flex flex-wrap items-center gap-4 text-[11px] text-slate-400 font-medium">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" /> Earning
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-400" /> Deduction
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-400" /> Benefit
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-blue-50 border border-blue-300" /> Unsaved change
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-amber-50 border border-amber-300" /> Unusual value
          </span>
          <span className="ml-auto">
            {serverPreviewActive
              ? '✓ Using server tax tables'
              : 'PAYE estimated using 2024 bands — click Preview for accurate results'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default PayrollInputGrid;
