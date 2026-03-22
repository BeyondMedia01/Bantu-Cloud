import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader, CheckCircle2, Clock } from 'lucide-react';
import { LoanAPI } from '../api/client';

const LoanDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loan, setLoan] = useState<any>(null);
  const [repayments, setRepayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState('');

  const load = () => {
    if (!id) return;
    Promise.all([LoanAPI.getById(id), LoanAPI.getRepayments(id)])
      .then(([l, r]) => { setLoan(l.data); setRepayments(r.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const handleMarkPaid = async (repaymentId: string) => {
    setActionError('');
    try {
      await LoanAPI.markRepaymentPaid(repaymentId);
      load();
    } catch (err: any) {
      setActionError(err.response?.data?.message || 'Failed to mark repayment as paid');
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-slate-400">
      <Loader size={24} className="animate-spin" />
    </div>
  );

  if (!loan) return <div className="text-slate-400 text-center py-16">Loan not found</div>;

  const paid = repayments.filter((r) => r.status === 'PAID').reduce((s: number, r: any) => s + r.amount, 0);
  const outstanding = loan.amount - paid;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate('/loans')} aria-label="Go back" className="p-2 hover:bg-slate-100 rounded-xl"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-2xl font-bold">Loan Details</h1>
          <p className="text-slate-500 font-medium text-sm">
            {loan.employee?.firstName} {loan.employee?.lastName} · {loan.status}
          </p>
        </div>
      </div>

      {actionError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{actionError}</div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Principal', value: loan.amount?.toFixed(2) },
          { label: 'Interest Rate', value: `${loan.interestRate}%` },
          { label: 'Paid', value: paid.toFixed(2) },
          { label: 'Outstanding', value: outstanding.toFixed(2) },
        ].map((s) => (
          <div key={s.label} className="bg-primary rounded-2xl border border-border p-4 shadow-sm">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{s.label}</p>
            <p className="text-xl font-bold">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Loan info */}
      <div className="bg-primary rounded-2xl border border-border p-6 shadow-sm mb-6">
        <h3 className="font-bold mb-4 text-sm uppercase tracking-wider text-slate-400">Loan Information</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          {[
            ['Start Date', new Date(loan.startDate).toLocaleDateString()],
            ['Term', `${loan.termMonths} months`],
            ['Monthly Instalment', loan.monthlyInstalment?.toFixed(2)],
            ['Status', loan.status],
            ['Description', loan.description || '—'],
          ].map(([k, v]) => (
            <div key={k}>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">{k}</p>
              <p className="font-medium">{v}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Repayment schedule */}
      <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="font-bold">Repayment Schedule</h3>
        </div>
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border bg-slate-50">
              {['#', 'Due Date', 'Amount', 'Status', 'Paid On', 'Action'].map((h) => (
                <th key={h} className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {repayments.map((r: any, i: number) => (
              <tr key={r.id} className={r.status === 'PAID' ? 'opacity-60' : ''}>
                <td className="px-4 py-3 text-sm font-bold text-slate-400">{i + 1}</td>
                <td className="px-4 py-3 text-sm">{new Date(r.dueDate).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-sm font-bold">{r.amount?.toFixed(2)}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${
                    r.status === 'PAID' ? 'bg-emerald-50 text-emerald-700' :
                    r.status === 'DUE' ? 'bg-amber-50 text-amber-700' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {r.status === 'PAID' ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-400">
                  {r.paidDate ? new Date(r.paidDate).toLocaleDateString() : '—'}
                </td>
                <td className="px-4 py-3">
                  {r.status !== 'PAID' && (
                    <button
                      onClick={() => handleMarkPaid(r.id)}
                      className="text-xs font-bold text-accent-blue hover:underline"
                    >
                      Mark Paid
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
};

export default LoanDetail;
