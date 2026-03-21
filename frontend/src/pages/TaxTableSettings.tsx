import React, { useEffect, useState } from 'react';
import { Plus, FileUp, Loader, ChevronRight, Hash, Percent, Calendar, Trash, Pencil, X, Check, Zap } from 'lucide-react';
import { TaxTableAPI } from '../api/client';
import UploadTaxTableModal from '../components/tax/UploadTaxTableModal';
import NewTaxTableModal from '../components/tax/NewTaxTableModal';

const EMPTY_ROW = { lowerBound: '', upperBound: '', rate: '', fixedAmount: '' };

const TaxTableSettings: React.FC<{ activeCompanyId?: string | null }> = () => {
  const [tables, setTables]               = useState<any[]>([]);
  const [loading, setLoading]             = useState(true);
  const [activeTableId, setActiveTableId] = useState<string | null>(null);
  const [brackets, setBrackets]           = useState<any[]>([]);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isNewModalOpen, setIsNewModalOpen]       = useState(false);

  // Add row
  const [addingRow, setAddingRow] = useState(false);
  const [newRow, setNewRow]       = useState({ ...EMPTY_ROW });
  const [addError, setAddError]   = useState('');
  const [addSaving, setAddSaving] = useState(false);

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRow, setEditRow]     = useState({ ...EMPTY_ROW });
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Activate table
  const [activating, setActivating] = useState(false);

  const fetchTables = async () => {
    try {
      const response = await TaxTableAPI.getAll();
      setTables(response.data);
      if (response.data.length > 0 && !activeTableId) {
        setActiveTableId(response.data[0].id);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const fetchBrackets = async (tableId: string) => {
    try {
      const response = await TaxTableAPI.getBrackets(tableId);
      setBrackets(response.data);
    } catch {
      // silent
    }
  };

  useEffect(() => { fetchTables(); }, []);
  useEffect(() => { if (activeTableId) fetchBrackets(activeTableId); }, [activeTableId]);

  const handleActivateTable = async (id: string) => {
    setActivating(true);
    try {
      const res = await TaxTableAPI.activate(id);
      setTables(prev => prev.map(t =>
        t.currency === res.data.currency ? { ...t, isActive: t.id === id } : t
      ));
    } catch {
      alert('Failed to set active table');
    } finally {
      setActivating(false);
    }
  };

  const handleDeleteTable = async (id: string, name: string) => {
    if (!window.confirm(`Delete tax table "${name}"? All brackets will be lost.`)) return;
    try {
      await TaxTableAPI.delete(id);
      setTables(prev => prev.filter(t => t.id !== id));
      if (activeTableId === id) { setActiveTableId(null); setBrackets([]); }
    } catch {
      alert('Failed to delete tax table');
    }
  };

  const handleDeleteBracket = async (bracketId: string) => {
    if (!activeTableId) return;
    try {
      await TaxTableAPI.deleteBracket(activeTableId, bracketId);
      setBrackets(prev => prev.filter(b => b.id !== bracketId));
    } catch {
      alert('Failed to delete bracket');
    }
  };

  const handleAddBracket = async () => {
    if (!activeTableId) return;
    if (newRow.lowerBound === '' || newRow.rate === '') {
      setAddError('Lower bound and rate are required.'); return;
    }
    setAddSaving(true);
    setAddError('');
    try {
      const created = await TaxTableAPI.createBracket(activeTableId, {
        lowerBound:  parseFloat(newRow.lowerBound),
        upperBound:  newRow.upperBound !== '' ? parseFloat(newRow.upperBound) : null,
        rate:        parseFloat(newRow.rate) / 100,
        fixedAmount: newRow.fixedAmount !== '' ? parseFloat(newRow.fixedAmount) : 0,
      });
      setBrackets(prev => [...prev, created.data].sort((a, b) => a.lowerBound - b.lowerBound));
      setNewRow({ ...EMPTY_ROW });
      setAddingRow(false);
    } catch (err: any) {
      setAddError(err.response?.data?.message || 'Failed to add bracket.');
    } finally {
      setAddSaving(false);
    }
  };

  const startEdit = (bracket: any) => {
    setEditingId(bracket.id);
    setEditRow({
      lowerBound:  String(bracket.lowerBound),
      upperBound:  bracket.upperBound != null ? String(bracket.upperBound) : '',
      rate:        String((bracket.rate * 100).toFixed(2)),
      fixedAmount: String(bracket.fixedAmount),
    });
    setEditError('');
    // Cancel add mode
    setAddingRow(false);
  };

  const handleSaveEdit = async () => {
    if (!activeTableId || !editingId) return;
    if (editRow.lowerBound === '' || editRow.rate === '') {
      setEditError('Lower bound and rate are required.'); return;
    }
    setEditSaving(true);
    setEditError('');
    try {
      const updated = await TaxTableAPI.updateBracket(activeTableId, editingId, {
        lowerBound:  parseFloat(editRow.lowerBound),
        upperBound:  editRow.upperBound !== '' ? parseFloat(editRow.upperBound) : null,
        rate:        parseFloat(editRow.rate) / 100,
        fixedAmount: editRow.fixedAmount !== '' ? parseFloat(editRow.fixedAmount) : 0,
      });
      setBrackets(prev =>
        prev.map(b => b.id === editingId ? updated.data : b)
            .sort((a, b) => a.lowerBound - b.lowerBound)
      );
      setEditingId(null);
    } catch (err: any) {
      setEditError(err.response?.data?.message || 'Failed to save changes.');
    } finally {
      setEditSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center p-12"><Loader className="animate-spin text-slate-300" /></div>;

  const activeTable = tables.find((t: any) => t.id === activeTableId);

  const inputCls = 'w-full px-2.5 py-1.5 border border-border rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue font-mono';

  return (
    <div className="flex flex-col gap-6">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-navy">Tax Tables</h2>
          <p className="text-slate-500 text-sm font-medium">Manage multi-currency progressive tax structures.</p>
        </div>
        <button
          onClick={() => setIsNewModalOpen(true)}
          className="bg-btn-primary text-navy px-4 py-2 rounded-full font-bold text-sm shadow flex items-center gap-2 hover:opacity-90 transition-opacity"
        >
          <Plus size={16} /> New Table
        </button>
      </header>

      <div className="flex gap-6 items-start">
        {/* Sidebar */}
        <aside className="w-64 shrink-0 bg-primary border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-border bg-slate-50">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Tables</span>
          </div>
          <div className="p-2">
            {tables.map((table: any) => (
              <button
                key={table.id}
                onClick={() => { setActiveTableId(table.id); setAddingRow(false); setEditingId(null); }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-all ${activeTableId === table.id ? 'bg-accent-blue text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-bold truncate">{table.name}</span>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-bold uppercase ${activeTableId === table.id ? 'text-white/70' : 'text-slate-400'}`}>{table.currency}</span>
                    <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${activeTableId === table.id ? 'bg-white/20 text-white/80' : 'bg-slate-100 text-slate-400'}`}>
                      {table.isAnnual === false ? 'Monthly' : 'Annual'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {table.isActive && (
                    <span className={`w-2 h-2 rounded-full ${activeTableId === table.id ? 'bg-white' : 'bg-emerald-500'}`} title="Active table" />
                  )}
                  {activeTableId === table.id && <ChevronRight size={14} />}
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* Brackets Panel */}
        <main className="flex-1 bg-primary border border-border rounded-2xl shadow-sm overflow-hidden flex flex-col">
          {activeTable ? (
            <>
              {/* Panel header */}
              <div className="p-5 border-b border-border bg-slate-50/50 flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-navy">{activeTable.name}</h3>
                    {activeTable.isActive && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase tracking-widest">
                        <Zap size={9} /> Active
                      </span>
                    )}
                  </div>
                  <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">
                    <Calendar size={12} /> Effective: {new Date(activeTable.effectiveDate).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {!activeTable.isActive && (
                    <button
                      onClick={() => handleActivateTable(activeTable.id)}
                      disabled={activating}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                    >
                      {activating ? <Loader size={13} className="animate-spin" /> : <Zap size={13} />}
                      Use This Table
                    </button>
                  )}
                  <button
                    onClick={() => { setAddingRow(true); setEditingId(null); setNewRow({ ...EMPTY_ROW }); setAddError(''); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    <Plus size={13} className="text-emerald-500" /> Add Bracket
                  </button>
                  <button
                    onClick={() => setIsUploadModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    <FileUp size={13} className="text-accent-blue" /> Bulk Upload
                  </button>
                  <button
                    onClick={() => handleDeleteTable(activeTable.id, activeTable.name)}
                    className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <Trash size={15} />
                  </button>
                </div>
              </div>

              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border bg-slate-50">
                    <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">Lower Bound</th>
                    <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">Upper Bound</th>
                    <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">Rate %</th>
                    <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-wider">Fixed Cumulative</th>
                    <th className="px-5 py-3 w-20" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {brackets.map((bracket: any) =>
                    editingId === bracket.id ? (
                      <tr key={bracket.id} className="bg-blue-50/40">
                        <td className="px-3 py-2.5">
                          <input type="number" value={editRow.lowerBound} onChange={e => setEditRow(p => ({ ...p, lowerBound: e.target.value }))} placeholder="0" className={inputCls} />
                        </td>
                        <td className="px-3 py-2.5">
                          <input type="number" value={editRow.upperBound} onChange={e => setEditRow(p => ({ ...p, upperBound: e.target.value }))} placeholder="(none = above)" className={inputCls} />
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="relative">
                            <input type="number" step="0.01" min="0" max="100" value={editRow.rate} onChange={e => setEditRow(p => ({ ...p, rate: e.target.value }))} placeholder="0.00" className={inputCls + ' pr-6'} />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">%</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                            <input type="number" step="0.01" value={editRow.fixedAmount} onChange={e => setEditRow(p => ({ ...p, fixedAmount: e.target.value }))} placeholder="0.00" className={inputCls + ' pl-5'} />
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1">
                            <button onClick={handleSaveEdit} disabled={editSaving} className="p-1.5 bg-emerald-50 hover:bg-emerald-100 rounded-lg text-emerald-600 transition-colors disabled:opacity-50">
                              {editSaving ? <Loader size={13} className="animate-spin" /> : <Check size={13} />}
                            </button>
                            <button onClick={() => { setEditingId(null); setEditError(''); }} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors">
                              <X size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={bracket.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-5 py-3.5 text-sm font-bold text-navy font-mono">{bracket.lowerBound.toLocaleString()}</td>
                        <td className="px-5 py-3.5 text-sm font-mono text-slate-500">
                          {bracket.upperBound != null ? bracket.upperBound.toLocaleString() : <span className="text-[10px] font-black text-slate-300 uppercase italic tracking-widest">And Above</span>}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="px-2.5 py-1 rounded-full bg-blue-50 text-accent-blue text-xs font-bold flex items-center gap-1 w-fit">
                            <Percent size={11} /> {(bracket.rate * 100).toFixed(2)}%
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-sm font-bold font-mono text-navy">{bracket.fixedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => startEdit(bracket)} className="p-1.5 hover:bg-blue-50 rounded-lg text-slate-400 hover:text-accent-blue transition-colors">
                              <Pencil size={13} />
                            </button>
                            <button onClick={() => handleDeleteBracket(bracket.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors">
                              <Trash size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  )}

                  {/* Edit error row */}
                  {editError && (
                    <tr>
                      <td colSpan={5} className="px-5 py-2 bg-red-50 text-xs text-red-600 font-medium">{editError}</td>
                    </tr>
                  )}

                  {/* Add row */}
                  {addingRow && (
                    <>
                      <tr className="bg-emerald-50/40">
                        <td className="px-3 py-2.5">
                          <input type="number" value={newRow.lowerBound} onChange={e => setNewRow(p => ({ ...p, lowerBound: e.target.value }))} placeholder="0" className={inputCls} autoFocus />
                        </td>
                        <td className="px-3 py-2.5">
                          <input type="number" value={newRow.upperBound} onChange={e => setNewRow(p => ({ ...p, upperBound: e.target.value }))} placeholder="(none = above)" className={inputCls} />
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="relative">
                            <input type="number" step="0.01" min="0" max="100" value={newRow.rate} onChange={e => setNewRow(p => ({ ...p, rate: e.target.value }))} placeholder="0.00" className={inputCls + ' pr-6'} />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">%</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                            <input type="number" step="0.01" value={newRow.fixedAmount} onChange={e => setNewRow(p => ({ ...p, fixedAmount: e.target.value }))} placeholder="0.00" className={inputCls + ' pl-5'} />
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1">
                            <button onClick={handleAddBracket} disabled={addSaving} className="p-1.5 bg-emerald-50 hover:bg-emerald-100 rounded-lg text-emerald-600 transition-colors disabled:opacity-50">
                              {addSaving ? <Loader size={13} className="animate-spin" /> : <Check size={13} />}
                            </button>
                            <button onClick={() => { setAddingRow(false); setAddError(''); setNewRow({ ...EMPTY_ROW }); }} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors">
                              <X size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {addError && (
                        <tr>
                          <td colSpan={5} className="px-5 py-2 bg-red-50 text-xs text-red-600 font-medium">{addError}</td>
                        </tr>
                      )}
                    </>
                  )}

                  {brackets.length === 0 && !addingRow && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic text-sm">
                        No brackets defined.{' '}
                        <button onClick={() => setAddingRow(true)} className="text-accent-blue font-bold not-italic hover:underline">Add the first bracket →</button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center p-20 text-slate-400">
              <Hash size={48} className="opacity-10 mb-4" />
              <p className="font-medium">Select a tax table to view brackets</p>
            </div>
          )}
        </main>
      </div>

      {isUploadModalOpen && activeTableId && (
        <UploadTaxTableModal
          tableId={activeTableId}
          tableName={activeTable?.name}
          onClose={() => setIsUploadModalOpen(false)}
          onSuccess={() => { setIsUploadModalOpen(false); fetchBrackets(activeTableId); }}
        />
      )}

      {isNewModalOpen && (
        <NewTaxTableModal
          onClose={() => setIsNewModalOpen(false)}
          onSuccess={(newTable) => {
            setIsNewModalOpen(false);
            setTables(prev => [...prev, newTable]);
            setActiveTableId(newTable.id);
          }}
        />
      )}
    </div>
  );
};

export default TaxTableSettings;
