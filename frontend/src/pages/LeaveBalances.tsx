import React, { useEffect, useState } from 'react';
import { Loader, ChevronsRight, CalendarCheck, AlertCircle } from 'lucide-react';
import { LeaveBalanceAPI, EmployeeAPI } from '../api/client';
import ConfirmModal from '../components/common/ConfirmModal';

const fmtType = (t: string) => t.charAt(0) + t.slice(1).toLowerCase().replace(/_/g, ' ');

const LeaveBalances: React.FC = () => {
  const [balances, setBalances] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [yearFilter, setYearFilter] = useState(String(new Date().getFullYear()));
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [actionMsg, setActionMsg] = useState('');
  const [error, setError] = useState('');
  const [showAdjust, setShowAdjust] = useState<string | null>(null);
  const [adjValue, setAdjValue] = useState('');
  const [adjNote, setAdjNote] = useState('');
  const [confirmAction, setConfirmAction] = useState<'yearend' | null>(null);

  const load = () => {
    setLoading(true);
    const params: Record<string, string> = { year: yearFilter };
    if (employeeFilter) params.employeeId = employeeFilter;
    LeaveBalanceAPI.getAll(params)
      .then((r) => setBalances(r.data))
      .catch(() => setError('Failed to load leave balances'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    EmployeeAPI.getAll({ limit: '500' })
      .then((r) => setEmployees(r.data?.data || r.data || []))
      .catch(() => {});
  }, []);

  useEffect(load, [yearFilter, employeeFilter]);

  const handleYearEnd = () => setConfirmAction('yearend');

  const runYearEnd = async () => {
    const yr = parseInt(yearFilter);
    setActionLoading('yearend');
    setActionMsg('');
    setError('');
    try {
      const r = await LeaveBalanceAPI.runYearEnd(yr);
      setActionMsg(`Year-end complete — ${r.data.carried} balances carried forward, ${r.data.forfeited} partially forfeited`);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Year-end processing failed');
    } finally {
      setActionLoading('');
    }
  };

  const handleAdjust = async (id: string) => {
    if (!adjValue) return;
    setActionLoading('adj-' + id);
    try {
      await LeaveBalanceAPI.adjust(id, parseFloat(adjValue), adjNote);
      setShowAdjust(null);
      setAdjValue('');
      setAdjNote('');
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Adjustment failed');
    } finally {
      setActionLoading('');
    }
  };

  // Group by employee
  const grouped = balances.reduce((acc: Record<string, any[]>, b) => {
    const key = b.employeeId;
    if (!acc[key]) acc[key] = [];
    acc[key].push(b);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-6">
      {confirmAction && (
        <ConfirmModal
          title="Year-End Carry-Over"
          message={`Run year-end carry-over for ${yearFilter}? Unused leave will be rolled forward (within policy limits) and remainder forfeited.`}
          confirmLabel="Run Year-End"
          onConfirm={() => { setConfirmAction(null); runYearEnd(); }}
          onCancel={() => setConfirmAction(null)}
        />
      )}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Leave Balances</h1>
          <p className="text-slate-500 text-sm font-medium">Per-employee, per-type leave balance tracking</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleYearEnd}
            disabled={actionLoading === 'yearend'}
            className="flex items-center gap-2 bg-purple-600 text-white px-5 py-2.5 rounded-full font-bold text-sm shadow hover:bg-purple-700 disabled:opacity-60"
          >
            <ChevronsRight size={15} className={actionLoading === 'yearend' ? 'animate-pulse' : ''} />
            Year-End Carry-Over
          </button>
        </div>
      </header>

      {error && <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600"><AlertCircle size={16} />{error}</div>}
      {actionMsg && <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 font-medium">{actionMsg}</div>}

      {/* Filters */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <select
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
          className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue shadow-sm"
        >
          {[0, 1, 2].map((offset) => {
            const y = new Date().getFullYear() - offset;
            return <option key={y} value={String(y)}>{y}</option>;
          })}
        </select>
        <select
          value={employeeFilter}
          onChange={(e) => setEmployeeFilter(e.target.value)}
          className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue shadow-sm"
        >
          <option value="">All Employees</option>
          {employees.map((e: any) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><Loader size={24} className="animate-spin text-slate-400" /></div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="text-center py-16 bg-primary rounded-2xl border border-border">
          <CalendarCheck size={36} className="mx-auto mb-3 text-slate-200" />
          <p className="font-bold text-slate-500 mb-1">No balances found</p>
          <p className="text-sm text-slate-400">Leave balances will appear here once accrual has run for active employees</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {Object.entries(grouped).map(([empId, rows]) => {
            const emp = rows[0].employee;
            return (
              <div key={empId} className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
                <div className="px-5 py-3 bg-slate-50 border-b border-border flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-accent-blue text-white flex items-center justify-center text-xs font-bold">
                    {emp?.firstName?.[0]}{emp?.lastName?.[0]}
                  </div>
                  <div>
                    <p className="font-bold text-sm">{emp?.firstName} {emp?.lastName}</p>
                    <p className="text-xs text-slate-400 font-semibold">{emp?.employeeCode || '—'}</p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-border">
                        {['Type', 'Opening', 'Accrued', 'Taken', 'Encashed', 'Forfeited', 'Balance', ''].map((h) => (
                          <th key={h} className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {rows.map((b: any) => (
                        <tr key={b.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 text-sm font-medium">{fmtType(b.leaveType)}</td>
                          <td className="px-4 py-3 text-sm">{b.openingBalance.toFixed(1)}</td>
                          <td className="px-4 py-3 text-sm text-emerald-700 font-medium">+{b.accrued.toFixed(1)}</td>
                          <td className="px-4 py-3 text-sm text-red-600">−{b.taken.toFixed(1)}</td>
                          <td className="px-4 py-3 text-sm text-orange-600">−{b.encashed.toFixed(1)}</td>
                          <td className="px-4 py-3 text-sm text-slate-400">−{b.forfeited.toFixed(1)}</td>
                          <td className="px-4 py-3">
                            <span className={`font-bold text-sm ${b.balance <= 0 ? 'text-red-600' : b.balance < 5 ? 'text-amber-600' : 'text-emerald-700'}`}>
                              {b.balance.toFixed(1)} days
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {showAdjust === b.id ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  step="0.5"
                                  value={adjValue}
                                  onChange={(e) => setAdjValue(e.target.value)}
                                  placeholder="e.g. +5 or -2"
                                  className="w-24 px-2 py-1 text-sm border border-border rounded-lg"
                                />
                                <input
                                  type="text"
                                  value={adjNote}
                                  onChange={(e) => setAdjNote(e.target.value)}
                                  placeholder="Note"
                                  className="w-28 px-2 py-1 text-sm border border-border rounded-lg"
                                />
                                <button
                                  onClick={() => handleAdjust(b.id)}
                                  disabled={actionLoading === 'adj-' + b.id}
                                  className="text-xs font-bold px-2 py-1 bg-accent-blue text-white rounded-lg"
                                >
                                  OK
                                </button>
                                <button onClick={() => { setShowAdjust(null); setAdjValue(''); setAdjNote(''); }} className="text-xs text-slate-400 hover:text-slate-600">✕</button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setShowAdjust(b.id)}
                                className="text-xs font-bold text-slate-400 hover:text-navy px-2 py-1 rounded hover:bg-slate-100"
                              >
                                Adjust
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LeaveBalances;
