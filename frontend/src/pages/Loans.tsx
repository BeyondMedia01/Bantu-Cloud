import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ChevronRight, Banknote } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import SkeletonTable from '../components/common/SkeletonTable';
import { LoanAPI } from '../api/client';
import { useToast } from '../context/ToastContext';
import { usePermissions } from '../hooks/usePermissions';
import { StatusBadge } from '@/components/common/StatusBadge';

const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtAmt = (n: number | undefined) => n != null ? Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';


const Loans: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { can } = usePermissions();
  const [loans, setLoans] = useState<any[]>([]);
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
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">Loans</h1>
          <p className="text-muted-foreground text-sm font-medium">Track employee loans and repayment schedules</p>
        </div>
        {can('PEOPLE', 'EDIT') && (
          <button
            onClick={() => navigate('/loans/new')}
            className="flex items-center gap-1.5 bg-brand text-navy px-4 py-2 rounded-full text-sm font-bold shadow hover:opacity-90"
          >
            <Plus size={16} /> New Loan
          </button>
        )}
      </header>

      {/* Filter */}
      <div className="flex gap-2">
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
        <div className="tbl-container">
          <div className="tbl-scroll">
          <table className="w-full text-left">
            <thead>
              <tr className="tbl-head-row">
                {['Employee', 'Amount', 'Interest', 'Term', 'Monthly Inst.', 'Start Date', 'Status', ''].map((h) => (
                  <th key={h} scope="col" className="tbl-th whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((loan: any) => (
                <tr key={loan.id} className="hover:bg-muted/50 cursor-pointer" onClick={() => navigate(`/loans/${loan.id}`)}>
                  <td className="px-5 py-3.5">
                    <p className="font-bold text-sm">{loan.employee?.firstName} {loan.employee?.lastName}</p>
                    <p className="text-xs text-muted-foreground">{loan.employee?.employeeCode}</p>
                  </td>
                  <td className="px-5 py-3.5 text-sm font-bold">{fmtAmt(loan.amount)}</td>
                  <td className="px-5 py-3.5 text-sm">{loan.interestRate}%</td>
                  <td className="px-5 py-3.5 text-sm">{loan.termMonths}mo</td>
                  <td className="px-5 py-3.5 text-sm font-medium">{fmtAmt(loan.monthlyInstalment)}</td>
                  <td className="px-5 py-3.5 text-sm">{fmtDate(loan.startDate)}</td>
                  <td className="px-5 py-3.5">
                    <StatusBadge status={loan.status} />
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground">
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
