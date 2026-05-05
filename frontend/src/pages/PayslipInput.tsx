import React, { useEffect, useState, useCallback } from 'react';
import {
  Users, Plus, Trash2, Pencil, Check, X, Loader,
  Search, ChevronRight, Info, Calculator, Upload, Download, AlertCircle, ChevronDown
} from 'lucide-react';
import { EmployeeAPI, TransactionCodeAPI, PayrollInputAPI } from '../api/client';
import { Dropdown } from '@/components/ui/dropdown';
import { getActiveCompanyId } from '../lib/companyContext';
import BenefitCalculator from '../components/tax/BenefitCalculator';
import ConfirmModal from '../components/common/ConfirmModal';
import { useToast } from '../context/ToastContext';

const CURRENT_PERIOD = new Date().toISOString().slice(0, 7);

const TYPE_COLORS: Record<string, string> = {
  EARNING:   'bg-emerald-100 text-emerald-700',
  DEDUCTION: 'bg-red-100 text-red-700',
  BENEFIT:   'bg-blue-100 text-blue-700',
};

const DURATION_OPTIONS = ['Indefinite', 'Once', '3 Months', '6 Months', '12 Months'];
const UNITS_TYPES = ['hrs', 'days', 'pcs', ''];

const EMPTY_FORM = {
  transactionCodeId: '',
  employeeUSD: '',
  employeeZiG: '',
  employerUSD: '',
  employerZiG: '',
  units: '',
  unitsType: 'hrs',
  duration: 'Indefinite',
  balance: '',
  period: CURRENT_PERIOD,
  notes: '',
};

const inputCls =
  'w-full px-3 py-2 bg-muted border border-border rounded-xl text-sm font-medium text-foreground ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green/20 focus-visible:border-accent-green transition-all';

const cellCls = 'px-4 py-3 text-right font-bold text-sm text-navy tabular-nums';

const fmtAmt = (n: number) =>
  n === 0 ? '—' : Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─────────────────────────────────────────────────────────────────────────────

const PayslipInput: React.FC = () => {
  const { showToast } = useToast();
  const [employees, setEmployees]       = useState<any[]>([]);
  const [txCodes, setTxCodes]           = useState<any[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [selectedEmp, setSelectedEmp]   = useState<any>(null);
  const [inputs, setInputs]             = useState<any[]>([]);

  const [empSearch, setEmpSearch]           = useState('');
  const [loadingEmps, setLoadingEmps]       = useState(true);
  const [loadingInputs, setLoadingInputs]   = useState(false);

  const [showAdd, setShowAdd]       = useState(false);
  const [addForm, setAddForm]       = useState({ ...EMPTY_FORM });
  const [addSaving, setAddSaving]   = useState(false);
  const [addError, setAddError]     = useState('');

  const [editingId, setEditingId]   = useState<string | null>(null);
  const [editForm, setEditForm]     = useState({ ...EMPTY_FORM });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError]   = useState('');

  const [calcOpen, setCalcOpen]     = useState(false);
  const [calcTarget, setCalcTarget] = useState<{ form: 'add' | 'edit', field: string } | null>(null);

  const [importOpen, setImportOpen]       = useState(false);
  const [importing, setImporting]         = useState(false);
  const [importResults, setImportResults] = useState<{ created: number, failed: any[] } | null>(null);

  // ── Load employees + transaction codes ────────────────────────────────────

  const loadEmployees = useCallback(() => {
    const cid = getActiveCompanyId();
    setLoadingEmps(true);
    Promise.all([
      EmployeeAPI.getAll({ limit: '500', ...(cid ? { companyId: cid } : {}) }),
      TransactionCodeAPI.getAll(),
    ]).then(([empRes, txRes]) => {
      const list = (empRes.data as any).data ?? empRes.data;
      setEmployees(list);
      setTxCodes(txRes.data);
    }).catch(() => showToast('Failed to load employees or transaction codes', 'error')).finally(() => setLoadingEmps(false));
  }, []);

  useEffect(() => {
    loadEmployees();
    window.addEventListener('activeCompanyChanged', loadEmployees);
    return () => window.removeEventListener('activeCompanyChanged', loadEmployees);
  }, [loadEmployees]);

  // ── Load inputs ──────────────────────────────────────────────────────────

  const loadInputs = useCallback(async (empId: string) => {
    setLoadingInputs(true);
    try {
      const res = await PayrollInputAPI.getAll({ employeeId: empId });
      setInputs(res.data);
    } catch {
      setInputs([]);
    } finally {
      setLoadingInputs(false);
    }
  }, []);

  const selectEmployee = (emp: any) => {
    setSelectedEmp(emp);
    setShowAdd(false);
    setEditingId(null);
    setAddError('');
    setEditError('');
    loadInputs(emp.id);
  };

  // ── Add ──────────────────────────────────────────────────────────────────

  const handleAdd = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedEmp || !addForm.transactionCodeId || !addForm.period) {
      setAddError('Transaction code and period are required.');
      return;
    }
    setAddSaving(true);
    setAddError('');
    try {
      await PayrollInputAPI.create({
        employeeId: selectedEmp.id,
        transactionCodeId: addForm.transactionCodeId,
        employeeUSD: parseFloat(addForm.employeeUSD) || 0,
        employeeZiG: parseFloat(addForm.employeeZiG) || 0,
        employerUSD: parseFloat(addForm.employerUSD) || 0,
        employerZiG: parseFloat(addForm.employerZiG) || 0,
        units: addForm.units ? parseFloat(addForm.units) : null,
        unitsType: addForm.unitsType || null,
        duration: addForm.duration,
        balance: parseFloat(addForm.balance) || 0,
        period: addForm.period,
        notes: addForm.notes || null,
      });
      setAddForm({ ...EMPTY_FORM });
      setShowAdd(false);
      loadInputs(selectedEmp.id);
    } catch (err: any) {
      setAddError(err.response?.data?.message || 'Failed to add input.');
    } finally {
      setAddSaving(false);
    }
  };

  // ── Edit ─────────────────────────────────────────────────────────────────

  const startEdit = (inp: any) => {
    setEditingId(inp.id);
    setEditForm({
      transactionCodeId: inp.transactionCodeId,
      employeeUSD: inp.employeeUSD != null ? String(inp.employeeUSD) : '',
      employeeZiG: inp.employeeZiG != null ? String(inp.employeeZiG) : '',
      employerUSD: inp.employerUSD != null ? String(inp.employerUSD) : '',
      employerZiG: inp.employerZiG != null ? String(inp.employerZiG) : '',
      units:       inp.units != null ? String(inp.units) : '',
      unitsType:   inp.unitsType || 'hrs',
      duration:    inp.duration || 'Indefinite',
      balance:     inp.balance != null ? String(inp.balance) : '',
      period:      inp.period || CURRENT_PERIOD,
      notes:       inp.notes || '',
    });
    setEditError('');
    setShowAdd(false);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !selectedEmp) return;
    setEditSaving(true);
    setEditError('');
    try {
      await PayrollInputAPI.update(editingId, {
        transactionCodeId: editForm.transactionCodeId,
        employeeUSD: parseFloat(editForm.employeeUSD) || 0,
        employeeZiG: parseFloat(editForm.employeeZiG) || 0,
        employerUSD: parseFloat(editForm.employerUSD) || 0,
        employerZiG: parseFloat(editForm.employerZiG) || 0,
        units: editForm.units ? parseFloat(editForm.units) : null,
        unitsType: editForm.unitsType || null,
        duration: editForm.duration,
        balance: parseFloat(editForm.balance) || 0,
        period: editForm.period,
        notes: editForm.notes || null,
      });
      setEditingId(null);
      loadInputs(selectedEmp.id);
    } catch (err: any) {
      setEditError(err.response?.data?.message || 'Failed to save changes.');
    } finally {
      setEditSaving(false);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────

  const handleDelete = (inp: any) => setDeleteTarget(inp);

  const confirmDeleteInput = async () => {
    if (!deleteTarget) return;
    try {
      await PayrollInputAPI.delete(deleteTarget.id);
      loadInputs(selectedEmp.id);
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to delete', 'error');
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResults(null);
    try {
      const res = await PayrollInputAPI.importBulk(file);
      setImportResults(res.data);
      if (selectedEmp) loadInputs(selectedEmp.id);
      loadEmployees(); // Refresh employee list if needed
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Import failed.', 'error');
    } finally {
      setImporting(false);
      e.target.value = ''; // Reset input
    }
  };

  const downloadTemplate = () => {
    const headers = ['Employee Code', 'Transaction Code', 'Amount USD', 'Amount ZiG', 'Units', 'Units Type', 'Period', 'Notes'];
    const csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\nEMP001,BASIC,1000,0,1,hrs,2024-03,Monthly Salary";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "bantu_variable_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ── Derived ──────────────────────────────────────────────────────────────

  const filteredEmps = employees.filter(e =>
    `${e.firstName} ${e.lastName} ${e.employeeCode ?? ''}`.toLowerCase().includes(empSearch.toLowerCase())
  );

  const txMap = Object.fromEntries(txCodes.map(t => [t.id, t]));

  const totals = inputs.reduce(
    (acc, inp) => {
      acc.employeeUSD += inp.employeeUSD || 0;
      acc.employeeZiG += inp.employeeZiG || 0;
      acc.employerUSD += inp.employerUSD || 0;
      acc.employerZiG += inp.employerZiG || 0;
      return acc;
    },
    { employeeUSD: 0, employeeZiG: 0, employerUSD: 0, employerZiG: 0 }
  );

  // ── Field helpers ────────────────────────────────────────────────────────

  const amtInput = (value: string, onChange: (v: string) => void, field?: string) => (
    <div className="relative group/amt">
      <input
        type="number" min="0" step="0.01" placeholder="0.00"
        className="w-full px-2.5 py-1.5 border border-border rounded-lg text-xs font-medium text-right
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green/20 bg-muted tabular-nums"
        value={value}
        onChange={e => onChange(e.target.value)}
      />
      {field && (
        <button
          type="button"
          onClick={() => {
            setCalcTarget({ form: editingId ? 'edit' : 'add', field });
            setCalcOpen(true);
          }}
          className="absolute left-1 top-1/2 -translate-y-1/2 p-1 text-muted-foreground/40 hover:text-accent-green opacity-0 group-hover/amt:opacity-100 transition-all"
          title="Open Statutory Benefit Calculator"
        >
          <Calculator size={12} />
        </button>
      )}
    </div>
  );

  const txCodeSelect = (value: string, onChange: (v: string) => void) => {
    const selected = txCodes.find(t => t.id === value);
    return (
      <Dropdown className="w-full" trigger={(isOpen) => (
        <button type="button" className={`${inputCls} flex items-center justify-between`}>
          <span className="truncate">{selected ? `${selected.code} — ${selected.name}` : '— Select code —'}</span>
          <ChevronDown size={12} className={`text-muted-foreground shrink-0 transition-transform ml-1 ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      )} sections={['EARNING', 'DEDUCTION', 'BENEFIT'].flatMap(group => {
        const grouped = txCodes.filter(t => t.type === group);
        if (!grouped.length) return [];
        return [{ label: group, items: grouped.map(t => ({ label: `${t.code} — ${t.name}`, onClick: () => onChange(t.id) })) }];
      })} />
    );
  };

  const COLS = [
    { label: 'Code',         right: false },
    { label: 'Description',  right: false },
    { label: 'Units',        right: false },
    { label: 'Employee USD', right: true  },
    { label: 'Employee ZiG', right: true  },
    { label: 'Employer USD', right: true  },
    { label: 'Employer ZiG', right: true  },
    { label: 'Duration',     right: false },
    { label: 'Balance',      right: true  },
    { label: '',             right: false },
  ];

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex gap-0 h-[calc(100vh-80px)] -mx-6 -my-6 overflow-hidden">
      {deleteTarget && (
        <ConfirmModal
          title="Remove Payslip Input"
          message={`Remove "${deleteTarget.transactionCode?.name ?? 'this input'}"? This cannot be undone.`}
          confirmLabel="Remove"
          onConfirm={confirmDeleteInput}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="w-72 shrink-0 border-r border-border flex flex-col bg-muted/40">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 mb-3">
            <Users size={16} className="text-accent-green shrink-0" />
            <h2 className="font-bold text-navy text-sm uppercase tracking-wide">Employee List</h2>
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              className="w-full pl-8 pr-3 py-2 text-xs border border-border rounded-xl bg-background text-foreground
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green/20 focus-visible:border-accent-green font-medium"
              placeholder="Search employees…"
              value={empSearch}
              onChange={e => setEmpSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loadingEmps ? (
            <div className="flex justify-center py-10">
              <Loader size={20} className="animate-spin text-accent-green" />
            </div>
          ) : filteredEmps.length === 0 ? (
            <p className="text-xs text-muted-foreground italic text-center py-8">No employees found</p>
          ) : filteredEmps.map(emp => {
            const active = selectedEmp?.id === emp.id;
            return (
              <button
                key={emp.id}
                onClick={() => selectEmployee(emp)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all mb-0.5 ${
                  active ? 'bg-accent-green text-white shadow-md' : 'text-foreground/80 hover:bg-card hover:shadow-sm'
                }`}
              >
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-bold truncate">{emp.firstName} {emp.lastName}</span>
                  <span className={`text-[10px] font-semibold truncate ${active ? 'text-white/70' : 'text-muted-foreground'}`}>
                    {emp.employeeCode || emp.position || '—'}
                  </span>
                </div>
                {active && <ChevronRight size={13} className="shrink-0 ml-1" />}
              </button>
            );
          })}
        </div>
      </aside>

      {/* ── Main Panel ─────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {!selectedEmp ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <Users size={52} className="opacity-10" />
            <p className="font-semibold">Select an employee to manage their inputs</p>
            <p className="text-xs">Earnings, deductions and benefits appear here</p>
          </div>
        ) : (
          <>
            {/* Panel header */}
            <div className="px-6 py-4 border-b border-border bg-card flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold text-navy text-lg">{selectedEmp.firstName} {selectedEmp.lastName}</h3>
                <p className="text-xs text-muted-foreground font-medium">
                  {selectedEmp.position || selectedEmp.occupation || '—'}
                  {selectedEmp.employeeCode ? ` · ${selectedEmp.employeeCode}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setImportOpen(true)}
                  className="flex items-center gap-2 bg-muted text-foreground/80 px-4 py-2 rounded-full font-bold text-sm hover:bg-muted/80 transition-colors"
                >
                  <Upload size={15} /> Import
                </button>
                <button
                  onClick={() => { setShowAdd(true); setEditingId(null); setAddForm({ ...EMPTY_FORM }); setAddError(''); }}
                  className="flex items-center gap-2 bg-brand text-navy px-4 py-2 rounded-full font-bold text-sm shadow hover:opacity-90"
                >
                  <Plus size={15} /> Add Input
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-6 flex flex-col gap-4">

              {/* ── Add form ──────────────────────────────────────────── */}
              {showAdd && (
                <form
                  onSubmit={handleAdd}
                  className="bg-card border border-border rounded-2xl p-5 shadow-sm animate-in fade-in slide-in-from-top-3 duration-200"
                >
                  <h4 className="font-bold text-xs text-muted-foreground uppercase tracking-wider mb-4">New Input</h4>

                  {/* Row 1 */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                    <div className="flex flex-col gap-1.5 md:col-span-2">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Transaction Code *</label>
                      {txCodeSelect(addForm.transactionCodeId, v => setAddForm(p => ({ ...p, transactionCodeId: v })))}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Units</label>
                      <div className="flex gap-1.5">
                        <input
                          type="number" min="0" step="0.01" placeholder="0"
                          className={inputCls}
                          value={addForm.units}
                          onChange={e => setAddForm(p => ({ ...p, units: e.target.value }))}
                        />
                        <Dropdown trigger={(isOpen) => (
                          <button type="button" className="flex items-center gap-0.5 px-1.5 py-2 border border-border rounded-xl text-xs font-medium bg-muted text-foreground hover:border-accent-green transition-colors w-16">
                            <span>{addForm.unitsType || '—'}</span>
                            <ChevronDown size={10} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                          </button>
                        )} sections={[{ items: UNITS_TYPES.map(u => ({ label: u || '—', onClick: () => setAddForm(p => ({ ...p, unitsType: u })) })) }]} />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Duration</label>
                      <Dropdown className="w-full" trigger={(isOpen) => (
                        <button type="button" className={`${inputCls} flex items-center justify-between`}>
                          <span>{addForm.duration}</span>
                          <ChevronDown size={12} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        </button>
                      )} sections={[{ items: DURATION_OPTIONS.map(d => ({ label: d, onClick: () => setAddForm(p => ({ ...p, duration: d })) })) }]} />
                    </div>
                  </div>

                  {/* Row 2 — 4 amounts */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                    {[
                      { label: 'Employee USD', field: 'employeeUSD' },
                      { label: 'Employee ZiG', field: 'employeeZiG' },
                      { label: 'Employer USD', field: 'employerUSD' },
                      { label: 'Employer ZiG', field: 'employerZiG' },
                    ].map(({ label, field }) => (
                      <div key={field} className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">{label}</label>
                        {amtInput((addForm as any)[field], v => setAddForm(p => ({ ...p, [field]: v })), field)}
                      </div>
                    ))}
                  </div>

                  {/* Row 3 — period + balance + notes */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Period *</label>
                      <input
                        required type="month" className={inputCls}
                        value={addForm.period}
                        onChange={e => setAddForm(p => ({ ...p, period: e.target.value }))}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Balance</label>
                      {amtInput(addForm.balance, v => setAddForm(p => ({ ...p, balance: v })))}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Notes</label>
                      <input type="text" placeholder="Optional" className={inputCls}
                        value={addForm.notes} onChange={e => setAddForm(p => ({ ...p, notes: e.target.value }))} />
                    </div>
                  </div>

                  {addError && <p className="text-xs text-red-600 font-medium mb-3">{addError}</p>}
                  <div className="flex gap-2">
                    <button type="submit" disabled={addSaving}
                      className="flex items-center gap-1.5 bg-brand text-navy px-5 py-2 rounded-full text-sm font-bold shadow hover:opacity-90 disabled:opacity-50">
                      {addSaving ? <Loader size={13} className="animate-spin" /> : <Check size={13} />} Save Input
                    </button>
                    <button type="button" onClick={() => { setShowAdd(false); setAddError(''); }}
                      className="px-4 py-2 rounded-full text-sm font-bold text-muted-foreground hover:bg-muted">
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {/* ── Table ────────────────────────────────────────────── */}
              {loadingInputs ? (
                <div className="flex justify-center py-16">
                  <Loader size={24} className="animate-spin text-accent-green" />
                </div>
              ) : inputs.length === 0 && !showAdd ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
                  <Info size={36} className="opacity-20" />
                  <p className="font-semibold text-sm">No inputs staged for this employee</p>
                  <button onClick={() => { setShowAdd(true); setAddForm({ ...EMPTY_FORM }); }}
                    className="text-accent-green text-sm font-bold hover:underline">
                    Add the first input →
                  </button>
                </div>
              ) : inputs.length > 0 && (
                <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
                  <div className="overflow-x-auto scroll-x-shadow">
                    <table className="w-full text-sm min-w-[1000px]">
                      <thead>
                        <tr className="border-b border-border bg-muted/50">
                          {COLS.map((c, i) => (
                            <th key={i} className={`px-4 py-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider ${c.right ? 'text-right' : 'text-left'}`}>
                              {c.label}
                            </th>
                          ))}
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-border">
                        {inputs.map(inp => {
                          const tc = txMap[inp.transactionCodeId] ?? inp.transactionCode;
                          const isEditing = editingId === inp.id;

                          if (isEditing) {
                            const selTc = txMap[editForm.transactionCodeId];
                            return (
                              <tr key={inp.id} className="bg-blue-50/30 dark:bg-blue-950/20">
                                <td colSpan={2} className="px-3 py-2">
                                  {txCodeSelect(editForm.transactionCodeId, v => setEditForm(p => ({ ...p, transactionCodeId: v })))}
                                  {selTc?.type && (
                                    <span className={`mt-1 inline-block text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full ${TYPE_COLORS[selTc.type] ?? ''}`}>
                                      {selTc.type}
                                    </span>
                                  )}
                                </td>
                                {/* Units */}
                                <td className="px-3 py-2">
                                  <div className="flex gap-1">
                                    <input type="number" min="0" step="0.01" placeholder="0"
                                      className="w-16 px-2 py-1.5 border border-border rounded-lg text-xs text-right bg-muted text-foreground focus-visible:outline-none"
                                      value={editForm.units} onChange={e => setEditForm(p => ({ ...p, units: e.target.value }))} />
                                    <Dropdown trigger={(isOpen) => (
                                      <button type="button" className="flex items-center gap-0.5 px-1 py-1.5 border border-border rounded-lg text-xs bg-muted text-foreground hover:border-accent-green transition-colors w-12">
                                        <span>{editForm.unitsType || '—'}</span>
                                        <ChevronDown size={9} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                                      </button>
                                    )} sections={[{ items: UNITS_TYPES.map(u => ({ label: u || '—', onClick: () => setEditForm(p => ({ ...p, unitsType: u })) })) }]} />
                                  </div>
                                </td>
                                {/* 4 amount cells */}
                                {(['employeeUSD','employeeZiG','employerUSD','employerZiG'] as const).map(f => (
                                  <td key={f} className="px-3 py-2">
                                    {amtInput(editForm[f], v => setEditForm(p => ({ ...p, [f]: v })), f)}
                                  </td>
                                ))}
                                {/* Duration */}
                                <td className="px-3 py-2">
                                  <Dropdown className="w-full" trigger={(isOpen) => (
                                    <button type="button" className="w-full flex items-center justify-between px-2 py-1.5 border border-border rounded-lg text-xs bg-muted text-foreground hover:border-accent-green transition-colors">
                                      <span>{editForm.duration}</span>
                                      <ChevronDown size={10} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                                    </button>
                                  )} sections={[{ items: DURATION_OPTIONS.map(d => ({ label: d, onClick: () => setEditForm(p => ({ ...p, duration: d })) })) }]} />
                                </td>
                                {/* Balance */}
                                <td className="px-3 py-2">
                                  {amtInput(editForm.balance, v => setEditForm(p => ({ ...p, balance: v })))}
                                </td>
                                {/* Save/cancel */}
                                <td className="px-3 py-2">
                                  <div className="flex gap-1">
                                    <button onClick={handleSaveEdit} disabled={editSaving}
                                      className="p-1.5 bg-emerald-50 hover:bg-emerald-100 rounded-lg text-emerald-600 disabled:opacity-50">
                                      {editSaving ? <Loader size={13} className="animate-spin" /> : <Check size={13} />}
                                    </button>
                                    <button onClick={() => { setEditingId(null); setEditError(''); setEditForm({ ...EMPTY_FORM }); }}
                                      className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground">
                                      <X size={13} />
                                    </button>
                                  </div>
                                  {editError && <p className="text-[10px] text-red-600 mt-1">{editError}</p>}
                                </td>
                              </tr>
                            );
                          }

                          // ── Read row ────────────────────────────────
                          const isDeduction = tc?.type === 'DEDUCTION';
                          return (
                            <tr key={inp.id} className="hover:bg-muted/40 transition-colors group">
                              {/* Code */}
                              <td className="px-4 py-3.5">
                                <span className={`text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full ${TYPE_COLORS[tc?.type] ?? 'bg-muted text-muted-foreground'}`}>
                                  {tc?.code ?? '—'}
                                </span>
                              </td>
                              {/* Description */}
                              <td className="px-4 py-3.5">
                                <p className="font-semibold text-navy text-sm">{tc?.name ?? '—'}</p>
                                {inp.notes && <p className="text-[10px] text-muted-foreground truncate max-w-[180px]">{inp.notes}</p>}
                              </td>
                              {/* Units */}
                              <td className="px-4 py-3.5 text-sm font-medium text-foreground/80">
                                {inp.units != null
                                  ? `${Number(inp.units).toLocaleString()} ${inp.unitsType || ''}`.trim()
                                  : <span className="text-muted-foreground/40">—</span>}
                              </td>
                              {/* Employee USD */}
                              <td className={cellCls}>
                                <span className={isDeduction ? 'text-red-600' : ''}>
                                  {fmtAmt(inp.employeeUSD || 0)}
                                </span>
                              </td>
                              {/* Employee ZiG */}
                              <td className={cellCls}>
                                <span className={isDeduction ? 'text-red-600' : ''}>
                                  {fmtAmt(inp.employeeZiG || 0)}
                                </span>
                              </td>
                              {/* Employer USD */}
                              <td className={cellCls + ' text-muted-foreground'}>
                                {fmtAmt(inp.employerUSD || 0)}
                              </td>
                              {/* Employer ZiG */}
                              <td className={cellCls + ' text-muted-foreground'}>
                                {fmtAmt(inp.employerZiG || 0)}
                              </td>
                              {/* Duration */}
                              <td className="px-4 py-3.5 text-sm font-medium text-muted-foreground">
                                {inp.duration || 'Indefinite'}
                              </td>
                              {/* Balance */}
                              <td className={cellCls}>
                                {fmtAmt(inp.balance || 0)}
                              </td>
                              {/* Actions */}
                              <td className="px-3 py-3.5">
                                {inp.processed ? (
                                  <span className="text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                    Done
                                  </span>
                                ) : (
                                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => startEdit(inp)}
                                      className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg text-muted-foreground hover:text-accent-green">
                                      <Pencil size={13} />
                                    </button>
                                    <button onClick={() => handleDelete(inp)}
                                      className="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg text-muted-foreground hover:text-red-500">
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>

                      {/* Totals footer */}
                      {inputs.length > 1 && (
                        <tfoot>
                          <tr className="border-t-2 border-border bg-muted/50">
                            <td colSpan={3} className="px-4 py-3 text-xs font-black text-muted-foreground uppercase tracking-wider">
                              Totals
                            </td>
                            <td className={cellCls}>{fmtAmt(totals.employeeUSD)}</td>
                            <td className={cellCls}>{fmtAmt(totals.employeeZiG)}</td>
                            <td className={cellCls + ' text-muted-foreground'}>{fmtAmt(totals.employerUSD)}</td>
                            <td className={cellCls + ' text-muted-foreground'}>{fmtAmt(totals.employerZiG)}</td>
                            <td colSpan={3} />
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      <BenefitCalculator
        isOpen={calcOpen}
        onClose={() => setCalcOpen(false)}
        baseSalary={selectedEmp?.baseSalary || 0}
        onApply={(amount) => {
          if (!calcTarget) return;
          const amtStr = amount.toFixed(2);
          if (calcTarget.form === 'add') {
            setAddForm(p => ({ ...p, [calcTarget.field]: amtStr }));
          } else {
            setEditForm(p => ({ ...p, [calcTarget.field]: amtStr }));
          }
          setCalcOpen(false);
        }}
      />

      {/* ── Import Modal ────────────────────────────────────────────── */}
      {importOpen && (
        <div className="fixed inset-0 bg-navy/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="import-variable-pay-title" className="bg-card rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-border flex justify-between items-center bg-muted/50">
              <div>
                <h3 id="import-variable-pay-title" className="text-xl font-bold text-navy">Import Variable Pay</h3>
                <p className="text-xs text-muted-foreground font-medium mt-0.5">Bulk upload earnings, deductions and benefits.</p>
              </div>
              <button onClick={() => { setImportOpen(false); setImportResults(null); }} aria-label="Close" className="p-2 hover:bg-muted rounded-full transition-colors">
                <X size={20} className="text-muted-foreground" />
              </button>
            </div>

            <div className="p-8">
              {!importResults ? (
                <div className="flex flex-col gap-6">
                  <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-800 rounded-2xl p-5 flex gap-4">
                    <div className="p-3 bg-card rounded-xl text-accent-green shadow-sm shrink-0 h-fit">
                      <Download size={24} />
                    </div>
                    <div>
                      <h4 className="font-bold mb-1 text-sm text-navy">Download Template</h4>
                      <p className="text-xs text-foreground/70 leading-relaxed mb-3">
                        Use our standard format to ensure your data is mapped correctly.
                      </p>
                      <button onClick={downloadTemplate} className="text-accent-green text-xs font-bold hover:underline flex items-center gap-1">
                        Get CSV Template (.csv)
                      </button>
                    </div>
                  </div>

                  <div className="relative group">
                    <input 
                      type="file" 
                      accept=".csv,.xlsx,.xls" 
                      onChange={handleImport}
                      disabled={importing}
                      className="absolute inset-0 opacity-0 cursor-pointer z-10"
                    />
                    <div className="border-2 border-dashed border-border rounded-3xl p-10 flex flex-col items-center justify-center gap-4 group-hover:border-accent-green group-hover:bg-blue-50/50 dark:group-hover:bg-blue-950/20 transition-all">
                      <div className={`p-4 rounded-full ${importing ? 'bg-muted' : 'bg-muted group-hover:bg-accent-green group-hover:text-white'} transition-all`}>
                        {importing ? <Loader size={32} className="animate-spin text-accent-green" /> : <Upload size={32} />}
                      </div>
                      <div className="text-center text-navy font-bold">
                        {importing ? 'Processing file...' : 'Click or drag file to upload'}
                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-2">{importing ? 'Please wait' : 'CSV or Excel files accepted'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-6 animate-in fade-in duration-300">
                  <div className={`p-6 rounded-2xl flex items-center gap-5 ${importResults.failed.length === 0 ? 'bg-emerald-50 border border-emerald-100' : 'bg-amber-50 border border-amber-100'}`}>
                    <div className={`p-3 rounded-full ${importResults.failed.length === 0 ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'}`}>
                      <Check size={28} />
                    </div>
                    <div>
                      <h4 className="text-xl font-bold">{importResults.created} Records Imported</h4>
                      <p className="text-sm font-medium opacity-70">
                        {importResults.failed.length > 0 
                          ? `Completed with ${importResults.failed.length} errors.` 
                          : 'Successfully processed all rows.'}
                      </p>
                    </div>
                  </div>

                  {importResults.failed.length > 0 && (
                    <div className="max-h-48 overflow-y-auto border border-border rounded-2xl bg-muted/50">
                      <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 bg-muted border-b border-border">
                          <tr>
                            <th className="px-4 py-2 font-bold text-muted-foreground uppercase">Row</th>
                            <th className="px-4 py-2 font-bold text-muted-foreground uppercase">Error Reason</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {importResults.failed.map((f, idx) => (
                            <tr key={idx}>
                              <td className="px-4 py-2 font-mono text-muted-foreground">{f.row}</td>
                              <td className="px-4 py-2 font-bold text-red-500 flex items-center gap-2">
                                <AlertCircle size={12} /> {f.reason}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <button 
                    onClick={() => { setImportOpen(false); setImportResults(null); }}
                    className="w-full bg-navy text-white py-4 rounded-2xl font-bold shadow-xl hover:opacity-90 transition-all"
                  >
                    Close Window
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PayslipInput;
