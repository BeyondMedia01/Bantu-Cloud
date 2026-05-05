import React, { useEffect, useState } from 'react';
import {
  Plus, Trash, ChevronRight, Calendar, Loader,
  Check, X, Pencil, Percent, Hash, ChevronDown,
} from 'lucide-react';
import { NecTableAPI } from '../api/client';
import { Dropdown } from '@/components/ui/dropdown';
import ConfirmModal from '../components/common/ConfirmModal';
import { useToast } from '../context/ToastContext';

const EMPTY_GRADE = { gradeCode: '', description: '', minRate: '', necLevyRate: '' };
const EMPTY_TABLE = { name: '', sector: '', currency: 'USD', effectiveDate: '', expiryDate: '' };

const NecTables: React.FC = () => {
  const { showToast } = useToast();
  const [tables, setTables]               = useState<any[]>([]);
  const [loading, setLoading]             = useState(true);
  const [activeTableId, setActiveTableId] = useState<string | null>(null);
  const [grades, setGrades]               = useState<any[]>([]);
  const [deleteTableTarget, setDeleteTableTarget] = useState<{ id: string; name: string } | null>(null);

  // New table form
  const [addingTable, setAddingTable]     = useState(false);
  const [newTable, setNewTable]           = useState({ ...EMPTY_TABLE });
  const [tableError, setTableError]       = useState('');
  const [tableSaving, setTableSaving]     = useState(false);

  // Add grade row
  const [addingGrade, setAddingGrade]     = useState(false);
  const [newGrade, setNewGrade]           = useState({ ...EMPTY_GRADE });
  const [addGradeError, setAddGradeError] = useState('');
  const [addGradeSaving, setAddGradeSaving] = useState(false);

  // Edit grade row
  const [editingGradeId, setEditingGradeId] = useState<string | null>(null);
  const [editGrade, setEditGrade]           = useState({ ...EMPTY_GRADE });
  const [editGradeError, setEditGradeError] = useState('');
  const [editGradeSaving, setEditGradeSaving] = useState(false);

  // ── Data Fetching ─────────────────────────────────────────────────────────

  const fetchTables = async () => {
    try {
      const res = await NecTableAPI.getAll();
      setTables(res.data);
      if (res.data.length > 0 && !activeTableId) {
        setActiveTableId(res.data[0].id);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const fetchGrades = async (tableId: string) => {
    try {
      const res = await NecTableAPI.getGrades(tableId);
      setGrades(res.data);
    } catch {
      // silent
    }
  };

  useEffect(() => { fetchTables(); }, []);
  useEffect(() => { if (activeTableId) fetchGrades(activeTableId); }, [activeTableId]);

  // ── Table CRUD ────────────────────────────────────────────────────────────

  const handleCreateTable = async () => {
    if (!newTable.name || !newTable.sector || !newTable.effectiveDate) {
      setTableError('Name, sector, and effective date are required.'); return;
    }
    setTableSaving(true); setTableError('');
    try {
      const res = await NecTableAPI.create({
        name: newTable.name,
        sector: newTable.sector,
        currency: newTable.currency,
        effectiveDate: newTable.effectiveDate,
        expiryDate: newTable.expiryDate || null,
      });
      setTables(prev => [...prev, res.data]);
      setActiveTableId(res.data.id);
      setNewTable({ ...EMPTY_TABLE });
      setAddingTable(false);
    } catch (err: any) {
      setTableError(err.response?.data?.message || 'Failed to create NEC table.');
    } finally {
      setTableSaving(false);
    }
  };

  const handleDeleteTable = (id: string, name: string) => setDeleteTableTarget({ id, name });

  const confirmDeleteTable = async () => {
    if (!deleteTableTarget) return;
    try {
      await NecTableAPI.delete(deleteTableTarget.id);
      setTables(prev => prev.filter(t => t.id !== deleteTableTarget.id));
      if (activeTableId === deleteTableTarget.id) { setActiveTableId(null); setGrades([]); }
    } catch {
      showToast('Failed to delete NEC table', 'error');
    } finally {
      setDeleteTableTarget(null);
    }
  };

  // ── Grade CRUD ────────────────────────────────────────────────────────────

  const handleAddGrade = async () => {
    if (!activeTableId) return;
    if (!newGrade.gradeCode || newGrade.minRate === '') {
      setAddGradeError('Grade code and minimum rate are required.'); return;
    }
    setAddGradeSaving(true); setAddGradeError('');
    try {
      const res = await NecTableAPI.createGrade(activeTableId, {
        gradeCode:    newGrade.gradeCode,
        description:  newGrade.description || null,
        minRate:      parseFloat(newGrade.minRate),
        necLevyRate:  newGrade.necLevyRate !== '' ? parseFloat(newGrade.necLevyRate) / 100 : 0,
      });
      setGrades(prev => [...prev, res.data].sort((a, b) => a.gradeCode.localeCompare(b.gradeCode)));
      setNewGrade({ ...EMPTY_GRADE });
      setAddingGrade(false);
    } catch (err: any) {
      setAddGradeError(err.response?.data?.message || 'Failed to add grade.');
    } finally {
      setAddGradeSaving(false);
    }
  };

  const startEditGrade = (grade: any) => {
    setEditingGradeId(grade.id);
    setEditGrade({
      gradeCode:   grade.gradeCode,
      description: grade.description || '',
      minRate:     String(grade.minRate),
      necLevyRate: String((grade.necLevyRate * 100).toFixed(4)),
    });
    setEditGradeError('');
    setAddingGrade(false);
  };

  const handleSaveGrade = async () => {
    if (!activeTableId || !editingGradeId) return;
    if (!editGrade.gradeCode || editGrade.minRate === '') {
      setEditGradeError('Grade code and minimum rate are required.'); return;
    }
    setEditGradeSaving(true); setEditGradeError('');
    try {
      const res = await NecTableAPI.updateGrade(activeTableId, editingGradeId, {
        gradeCode:   editGrade.gradeCode,
        description: editGrade.description || null,
        minRate:     parseFloat(editGrade.minRate),
        necLevyRate: editGrade.necLevyRate !== '' ? parseFloat(editGrade.necLevyRate) / 100 : 0,
      });
      setGrades(prev =>
        prev.map(g => g.id === editingGradeId ? res.data : g)
            .sort((a, b) => a.gradeCode.localeCompare(b.gradeCode))
      );
      setEditingGradeId(null);
    } catch (err: any) {
      setEditGradeError(err.response?.data?.message || 'Failed to save grade.');
    } finally {
      setEditGradeSaving(false);
    }
  };

  const handleDeleteGrade = async (gradeId: string) => {
    if (!activeTableId) return;
    try {
      await NecTableAPI.deleteGrade(activeTableId, gradeId);
      setGrades(prev => prev.filter(g => g.id !== gradeId));
    } catch {
      showToast('Failed to delete grade', 'error');
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Loader className="animate-spin text-accent-green" />
      </div>
    );
  }

  const activeTable = tables.find(t => t.id === activeTableId);
  const inputCls = 'w-full px-2.5 py-1.5 border border-border rounded-lg text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green/30 focus-visible:border-accent-green font-mono';

  return (
    <div className="flex flex-col gap-6">
      {deleteTableTarget && (
        <ConfirmModal
          title="Delete NEC Table"
          message={`Delete NEC table "${deleteTableTarget.name}"? All grades will be removed.`}
          confirmLabel="Delete"
          onConfirm={confirmDeleteTable}
          onCancel={() => setDeleteTableTarget(null)}
        />
      )}
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-navy">NEC Tables</h1>
          <p className="text-muted-foreground text-sm font-medium">
            Manage National Employment Council minimum wage tables and levy rates per sector.
          </p>
        </div>
        <button
          onClick={() => { setAddingTable(true); setTableError(''); setNewTable({ ...EMPTY_TABLE }); }}
          className="bg-brand text-navy px-4 py-2 rounded-full font-bold text-sm shadow flex items-center gap-2 hover:opacity-90 transition-opacity"
        >
          <Plus size={16} /> New NEC Table
        </button>
      </header>

      {/* ── New Table Form ────────────────────────────────────────────────── */}
      {addingTable && (
        <div className="bg-primary rounded-2xl border border-border shadow-sm p-6 animate-in fade-in slide-in-from-top-4 duration-200">
          <h3 className="font-bold text-navy mb-4">Create NEC Table</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Table Name *</label>
              <input
                className={inputCls + ' text-sm'}
                placeholder="e.g. Engineering Sector 2025"
                value={newTable.name}
                onChange={e => setNewTable(p => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Sector *</label>
              <input
                className={inputCls + ' text-sm'}
                placeholder="e.g. Engineering, Mining, Agriculture"
                value={newTable.sector}
                onChange={e => setNewTable(p => ({ ...p, sector: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Currency</label>
              <Dropdown className="w-full" trigger={(isOpen) => (
                <button type="button" className="w-full flex items-center justify-between px-3 py-2 border border-border rounded-xl text-sm font-medium hover:border-accent-green transition-colors bg-primary">
                  <span>{newTable.currency}</span>
                  <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
              )} sections={[{ items: [
                { label: 'USD', onClick: () => setNewTable(p => ({ ...p, currency: 'USD' })) },
                { label: 'ZiG', onClick: () => setNewTable(p => ({ ...p, currency: 'ZiG' })) },
              ]}]} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Effective Date *</label>
              <input
                type="date"
                className={inputCls + ' text-sm'}
                value={newTable.effectiveDate}
                onChange={e => setNewTable(p => ({ ...p, effectiveDate: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Expiry Date</label>
              <input
                type="date"
                className={inputCls + ' text-sm'}
                value={newTable.expiryDate}
                onChange={e => setNewTable(p => ({ ...p, expiryDate: e.target.value }))}
              />
            </div>
          </div>
          {tableError && <p className="mt-3 text-xs text-red-600 font-medium">{tableError}</p>}
          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={handleCreateTable}
              disabled={tableSaving}
              className="flex items-center gap-1.5 px-4 py-2 bg-brand text-navy rounded-full text-xs font-bold shadow hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {tableSaving ? <Loader size={13} className="animate-spin" /> : <Check size={13} />}
              Create Table
            </button>
            <button
              onClick={() => { setAddingTable(false); setTableError(''); }}
              className="px-4 py-2 rounded-full text-xs font-bold text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-6 items-start">
        {/* ── Sidebar ───────────────────────────────────────────────────────── */}
        <aside className="w-64 shrink-0 bg-primary border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-border bg-muted">
            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">NEC Tables</span>
          </div>
          <div className="p-2">
            {tables.length === 0 && (
              <p className="text-xs text-muted-foreground italic px-3 py-4 text-center">No tables yet.</p>
            )}
            {tables.map((table: any) => (
              <button
                key={table.id}
                onClick={() => {
                  setActiveTableId(table.id);
                  setAddingGrade(false);
                  setEditingGradeId(null);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-all ${
                  activeTableId === table.id
                    ? 'bg-accent-green text-white shadow-md'
                    : 'text-foreground/80 hover:bg-muted'
                }`}
              >
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-bold truncate">{table.name}</span>
                  <span className={`text-[10px] font-bold uppercase truncate ${
                    activeTableId === table.id ? 'text-white/70' : 'text-muted-foreground'
                  }`}>
                    {table.sector} · {table.currency}
                  </span>
                </div>
                {activeTableId === table.id && <ChevronRight size={14} className="shrink-0" />}
              </button>
            ))}
          </div>
        </aside>

        {/* ── Grades Panel ──────────────────────────────────────────────────── */}
        <main className="flex-1 bg-primary border border-border rounded-2xl shadow-sm overflow-hidden flex flex-col">
          {activeTable ? (
            <>
              {/* Panel header */}
              <div className="p-5 border-b border-border bg-muted/30 flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-navy">{activeTable.name}</h3>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      <Calendar size={11} /> Effective: {new Date(activeTable.effectiveDate).toLocaleDateString()}
                    </span>
                    {activeTable.expiryDate && (
                      <span className="text-[10px] font-bold text-orange-500 uppercase tracking-wider">
                        Expires: {new Date(activeTable.expiryDate).toLocaleDateString()}
                      </span>
                    )}
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
                      {activeTable.currency}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setAddingGrade(true); setEditingGradeId(null); setNewGrade({ ...EMPTY_GRADE }); setAddGradeError(''); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-bold text-foreground/80 hover:bg-muted transition-colors"
                  >
                    <Plus size={13} className="text-emerald-500" /> Add Grade
                  </button>
                  <button
                    onClick={() => handleDeleteTable(activeTable.id, activeTable.name)}
                    className="p-1.5 hover:bg-red-50 rounded-lg text-muted-foreground hover:text-red-500 transition-colors"
                  >
                    <Trash size={15} />
                  </button>
                </div>
              </div>

              {/* Grades table */}
              <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border bg-muted">
                    <th className="px-5 py-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider">Grade Code</th>
                    <th className="px-5 py-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider">Description</th>
                    <th className="px-5 py-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider">Min Rate</th>
                    <th className="px-5 py-3 text-[10px] font-black text-muted-foreground uppercase tracking-wider">NEC Levy %</th>
                    <th className="px-5 py-3 w-20" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {grades.map((grade: any) =>
                    editingGradeId === grade.id ? (
                      <tr key={grade.id} className="bg-blue-50/40">
                        <td className="px-3 py-2.5">
                          <input
                            autoFocus
                            className={inputCls}
                            placeholder="A1"
                            value={editGrade.gradeCode}
                            onChange={e => setEditGrade(p => ({ ...p, gradeCode: e.target.value }))}
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <input
                            className={inputCls}
                            placeholder="e.g. Junior Technician"
                            value={editGrade.description}
                            onChange={e => setEditGrade(p => ({ ...p, description: e.target.value }))}
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-bold">
                              {activeTable.currency === 'USD' ? '$' : 'Z'}
                            </span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              className={inputCls + ' pl-5'}
                              placeholder="0.00"
                              value={editGrade.minRate}
                              onChange={e => setEditGrade(p => ({ ...p, minRate: e.target.value }))}
                            />
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="relative">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              className={inputCls + ' pr-6'}
                              placeholder="0.00"
                              value={editGrade.necLevyRate}
                              onChange={e => setEditGrade(p => ({ ...p, necLevyRate: e.target.value }))}
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">%</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={handleSaveGrade}
                              disabled={editGradeSaving}
                              className="p-1.5 bg-emerald-50 hover:bg-emerald-100 rounded-lg text-emerald-600 disabled:opacity-50"
                            >
                              {editGradeSaving ? <Loader size={13} className="animate-spin" /> : <Check size={13} />}
                            </button>
                            <button
                              onClick={() => { setEditingGradeId(null); setEditGradeError(''); }}
                              className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={grade.id} className="hover:bg-muted/30 transition-colors group">
                        <td className="px-5 py-3.5">
                          <span className="font-black text-navy text-sm font-mono">{grade.gradeCode}</span>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-muted-foreground">{grade.description || <span className="text-muted-foreground/50 italic text-xs">—</span>}</td>
                        <td className="px-5 py-3.5">
                          <span className="font-bold text-sm text-navy font-mono">
                            {activeTable.currency} {grade.minRate.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="px-2.5 py-1 rounded-full bg-purple-50 text-purple-600 text-xs font-bold flex items-center gap-1 w-fit">
                            <Percent size={11} /> {(grade.necLevyRate * 100).toFixed(3)}%
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => startEditGrade(grade)}
                              className="p-1.5 hover:bg-blue-50 rounded-lg text-muted-foreground hover:text-accent-green transition-colors"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              onClick={() => handleDeleteGrade(grade.id)}
                              className="p-1.5 hover:bg-red-50 rounded-lg text-muted-foreground hover:text-red-500 transition-colors"
                            >
                              <Trash size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  )}

                  {/* Edit error */}
                  {editGradeError && (
                    <tr>
                      <td colSpan={5} className="px-5 py-2 bg-red-50 text-xs text-red-600 font-medium">{editGradeError}</td>
                    </tr>
                  )}

                  {/* Add row */}
                  {addingGrade && (
                    <>
                      <tr className="bg-emerald-50/40">
                        <td className="px-3 py-2.5">
                          <input
                            autoFocus
                            className={inputCls}
                            placeholder="A1"
                            value={newGrade.gradeCode}
                            onChange={e => setNewGrade(p => ({ ...p, gradeCode: e.target.value }))}
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <input
                            className={inputCls}
                            placeholder="e.g. Senior Engineer"
                            value={newGrade.description}
                            onChange={e => setNewGrade(p => ({ ...p, description: e.target.value }))}
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-bold">
                              {activeTable.currency === 'USD' ? '$' : 'Z'}
                            </span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              className={inputCls + ' pl-5'}
                              placeholder="0.00"
                              value={newGrade.minRate}
                              onChange={e => setNewGrade(p => ({ ...p, minRate: e.target.value }))}
                            />
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="relative">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              className={inputCls + ' pr-6'}
                              placeholder="0.00"
                              value={newGrade.necLevyRate}
                              onChange={e => setNewGrade(p => ({ ...p, necLevyRate: e.target.value }))}
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">%</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={handleAddGrade}
                              disabled={addGradeSaving}
                              className="p-1.5 bg-emerald-50 hover:bg-emerald-100 rounded-lg text-emerald-600 disabled:opacity-50"
                            >
                              {addGradeSaving ? <Loader size={13} className="animate-spin" /> : <Check size={13} />}
                            </button>
                            <button
                              onClick={() => { setAddingGrade(false); setAddGradeError(''); setNewGrade({ ...EMPTY_GRADE }); }}
                              className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {addGradeError && (
                        <tr>
                          <td colSpan={5} className="px-5 py-2 bg-red-50 text-xs text-red-600 font-medium">{addGradeError}</td>
                        </tr>
                      )}
                    </>
                  )}

                  {grades.length === 0 && !addingGrade && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground italic text-sm">
                        No grades defined.{' '}
                        <button
                          onClick={() => setAddingGrade(true)}
                          className="text-accent-green font-bold not-italic hover:underline"
                        >
                          Add the first grade →
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center p-20 text-muted-foreground">
              <Hash size={48} className="opacity-10 mb-4" />
              <p className="font-medium">Select a NEC table to manage grades</p>
              <p className="text-xs mt-1">Or create a new table to get started</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default NecTables;
