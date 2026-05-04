import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ChevronRight, Banknote } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import SkeletonTable from '../components/common/SkeletonTable';
import { LoanAPI } from '../api/client';
import type { Loan } from '../api/client';
import { useToast } from '../context/ToastContext';

const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtAmt = (n: number | undefined) => n != null ? Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

const statusColor: Record<string, string> = {
  ACTIVE: 'bg-blue-50 text-blue-700',
  PAID_OFF: 'bg-emerald-50 text-emerald-700',
  DEFAULTED: 'bg-red-50 text-red-700',
  CANCELLED: 'bg-muted text-foreground/80',
};

const Loans: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    LoanAPI.getAll()
      .then((r) => setLoans(r.data))
      .catch(() => showToast('Failed to load loans', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter
    ? loans.filter((l) => l.status === filter)
    : loans;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Loans</h1>
          <p className="text-muted-foreground text-sm font-medium">Track employee loans and repayment schedules</p>
        </div>
        <button
          onClick={() => navigate('/loans/new')}
          className="flex items-center gap-1.5 bg-brand text-navy px-4 py-2 rounded-full text-sm font-bold shadow hover:opacity-90"
        >
          <Plus size={16} /> New Loan
        </button>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-6">
        {['', 'ACTIVE', 'PAID_OFF', 'DEFAULTED'].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all border ${filter === s ? 'bg-brand text-navy border-navy' : 'border-border text-muted-foreground hover:bg-muted'}`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonTable headers={['Employee', 'Amount', 'Interest', 'Term', 'Monthly Inst.', 'Start Date', 'Status', '']} />
      ) : filtered.length === 0 && !filter ? (
        <EmptyState
          variant="no-data"
          icon={Banknote}
          title="No loans yet"
          description="Set up employee loans and track repayment schedules."
          action={{ label: 'Create First Loan', onClick: () => navigate('/loans/new') }}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          variant="no-results"
          icon={Banknote}
          title="No loans match this filter"
          description=""
        />
      ) : (
        <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-muted">
                {['Employee', 'Amount', 'Interest', 'Term', 'Monthly Inst.', 'Start Date', 'Status', ''].map((h) => (
                  <th key={h} scope="col" className="px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((loan: Loan) => (
                <tr key={loan.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => navigate(`/loans/${loan.id}`)}>
                  <td className="px-4 py-3">
                    <p className="font-bold text-sm">{loan.employee?.firstName} {loan.employee?.lastName}</p>
                    <p className="text-xs text-muted-foreground">{loan.employee?.employeeCode}</p>
                  </td>
                  <td className="px-4 py-3 text-sm font-bold">{fmtAmt(loan.amount)}</td>
                  <td className="px-4 py-3 text-sm">{loan.interestRate}%</td>
                  <td className="px-4 py-3 text-sm">{loan.termMonths}mo</td>
                  <td className="px-4 py-3 text-sm font-medium">{fmtAmt(loan.monthlyInstalment)}</td>
                  <td className="px-4 py-3 text-sm">{fmtDate(loan.startDate)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-bold ${statusColor[loan.status] || 'bg-muted text-foreground/80'}`}>
                      {loan.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <ChevronRight size={16} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Loans;
