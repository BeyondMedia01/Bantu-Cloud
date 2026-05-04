import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, CheckCircle2, AlertTriangle, Loader, Lock, ChevronDown } from 'lucide-react';
import { Dropdown } from '@/components/ui/dropdown';
import { UtilitiesAPI, PayrollCalendarAPI } from '../../api/client';
import ConfirmModal from '../../components/common/ConfirmModal';

const PeriodEnd: React.FC = () => {
  const navigate = useNavigate();
  const [calendars, setCalendars] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [confirmPending, setConfirmPending] = useState<'reopen' | 'close' | null>(null);

  useEffect(() => {
    PayrollCalendarAPI.getAll().then((r) => setCalendars(r.data)).catch(() => {});
  }, []);

  const checkStatus = async (id: string) => {
    setSelectedId(id);
    setStatus(null);
    if (!id) return;

    const cal = calendars.find(c => c.id === id);
    if (cal?.isClosed) return; // Don't check status for closed periods

    setStatusLoading(true);
    try {
      const res = await UtilitiesAPI.periodEndStatus(id);
      setStatus(res.data);
    } catch {}
    setStatusLoading(false);
  };

  const selectedCal = calendars.find(c => c.id === selectedId);

  const handleAction = () => {
    if (!selectedId || !selectedCal) return;
    setConfirmPending(selectedCal.isClosed ? 'reopen' : 'close');
  };

  const runAction = async () => {
    if (!selectedId || !selectedCal || !confirmPending) return;
    setConfirmPending(null);
    setLoading(true);
    setError('');
    try {
      if (confirmPending === 'reopen') {
        await UtilitiesAPI.unClosePeriod(selectedId);
        setResult({ message: 'Period re-opened successfully' });
      } else {
        const res = await UtilitiesAPI.periodEnd(selectedId);
        setResult(res.data);
      }
      PayrollCalendarAPI.getAll().then((r) => setCalendars(r.data)).catch(() => {});
    } catch {
      setError(err.response?.data?.message || `Failed to ${confirmPending === 'reopen' ? 're-open' : 'close'} period`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl">
      {confirmPending && (
        <ConfirmModal
          title={confirmPending === 'reopen' ? 'Re-open Period?' : 'Close Period?'}
          message={confirmPending === 'reopen'
            ? 'Re-opening this period will allow edits and payroll runs again.'
            : 'Closing this period will finalise all runs. This action cannot be undone.'}
          confirmLabel={confirmPending === 'reopen' ? 'Re-open' : 'Close Period'}
          onConfirm={runAction}
          onCancel={() => setConfirmPending(null)}
        />
      )}
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate('/utilities')} aria-label="Go back" className="p-2 hover:bg-muted rounded-xl"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-2xl font-bold">Period End Processing</h1>
          <p className="text-muted-foreground font-medium text-sm">Close a payroll period and finalise all runs</p>
        </div>
      </div>

      {result ? (
        <div className="bg-primary rounded-2xl border border-emerald-200 p-8 shadow-sm">
          <CheckCircle2 size={32} className="text-emerald-500 mb-4" />
          <h3 className="font-bold text-lg mb-2">Period Closed Successfully</h3>
          <div className="text-sm text-foreground/80 space-y-1">
            <p>Runs completed: <strong>{result.runsCompleted}</strong></p>
            <p>Repayments marked DUE: <strong>{result.repaymentsMarked}</strong></p>
          </div>
          <button onClick={() => { setResult(null); setStatus(null); setSelectedId(''); }} className="mt-4 text-sm font-bold text-accent-green hover:underline">
            Close Another Period
          </button>
        </div>
      ) : (
        <div className="bg-primary rounded-2xl border border-border p-8 shadow-sm flex flex-col gap-6">
          {error && <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>}

          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Select Payroll Period *</label>
            <Dropdown className="w-full" trigger={(isOpen) => {
              const cal = (calendars as any[]).find(c => c.id === selectedId);
              const label = cal ? `${cal.isClosed ? '🔒 ' : ''}${cal.periodType} — ${new Date(cal.startDate).toLocaleDateString()} to ${new Date(cal.endDate).toLocaleDateString()}` : 'Choose an open period…';
              return (
                <button type="button" className="w-full flex items-center justify-between px-4 py-3 bg-muted border border-border rounded-xl font-medium text-sm hover:border-accent-green transition-colors">
                  <span className="truncate">{label}</span>
                  <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
              );
            }} sections={[{ items: [
              { label: 'Choose an open period…', onClick: () => checkStatus('') },
              ...(calendars as any[]).map(c => ({ label: `${c.isClosed ? '🔒 ' : ''}${c.periodType} — ${new Date(c.startDate).toLocaleDateString()} to ${new Date(c.endDate).toLocaleDateString()}`, onClick: () => checkStatus(c.id) }))
            ]}]} />
          </div>

          {statusLoading && (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader size={16} className="animate-spin" /> Checking status…</div>
          )}

          {status && !selectedCal?.isClosed && (
            <div className={`p-4 rounded-xl border ${status.readyToClose ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
              <div className="flex items-center gap-2 mb-2">
                {status.readyToClose ? (
                  <CheckCircle2 size={16} className="text-emerald-500" />
                ) : (
                  <AlertTriangle size={16} className="text-amber-500" />
                )}
                <p className="font-bold text-sm">
                  {status.readyToClose ? 'Ready to close' : 'Not ready to close'}
                </p>
              </div>
              <div className="text-sm space-y-0.5 text-foreground/80">
                <p>Runs in progress: <strong>{status.runsInProgress}</strong></p>
                <p>Unprocessed inputs: <strong>{status.pendingInputs}</strong></p>
              </div>
              {status.pendingInputDetails?.length > 0 && (
                <div className="mt-3 border-t border-amber-200 pt-3 flex flex-col gap-1.5">
                  {status.pendingInputDetails.map((inp) => (
                    <div key={inp.id} className="text-xs text-amber-800 bg-card rounded-lg px-3 py-2 border border-amber-100">
                      <span className="font-bold">{inp.employee}</span>
                      <span className="text-amber-600"> · {inp.transactionCode}</span>
                      <span className="text-amber-500 ml-1">({inp.period}, {inp.currency} {inp.amount})</span>
                    </div>
                  ))}
                </div>
              )}
              {!status.readyToClose && (
                <p className="text-xs text-amber-700 font-medium mt-2">
                  Complete all payroll runs before closing this period.
                </p>
              )}
            </div>
          )}

          {selectedCal?.isClosed && (
            <div className="p-4 rounded-xl border bg-muted border-border">
              <div className="flex items-center gap-2">
                <Lock size={16} className="text-muted-foreground" />
                <p className="font-bold text-sm text-foreground/80">This period is currently closed.</p>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Re-opening will allow you to run payroll and modify inputs for this cycle.
              </p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={handleAction}
              disabled={!selectedId || loading || (!selectedCal?.isClosed && !status?.readyToClose)}
              className="flex items-center gap-1.5 bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 disabled:opacity-40"
            >
              <Calendar size={16} /> {loading ? (selectedCal?.isClosed ? 'Re-opening…' : 'Closing…') : (selectedCal?.isClosed ? 'Re-open Period' : 'Close Period')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PeriodEnd;
