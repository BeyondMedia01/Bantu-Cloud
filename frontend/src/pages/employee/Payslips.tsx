import React, { useEffect, useState } from 'react';
import { FileText, Download } from 'lucide-react';
import SkeletonTable from '../../components/common/SkeletonTable';
import { EmptyState } from '../../components/ui/empty-state';
import { EmployeeSelfAPI, PayrollAPI } from '../../api/client';
import { useToast } from '../../context/ToastContext';

const fmt = (n: number | null | undefined) =>
  n != null ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

const EmployeePayslips: React.FC = () => {
  const { showToast } = useToast();
  const [payslips, setPayslips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const handlePdf = async (runId: string, payslipId: string) => {
    try {
      const res = await PayrollAPI.downloadPayslipPdf(runId, payslipId);
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'payslip.pdf';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      showToast('Failed to download payslip PDF', 'error');
    }
  };

  useEffect(() => {
    EmployeeSelfAPI.getPayslips()
      .then((r) => setPayslips(r.data))
      .catch(() => showToast('Failed to load payslips', 'error'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-navy">My Payslips</h1>
        <p className="text-muted-foreground text-sm font-medium">View and download your payslips</p>
      </header>

      <div className="tbl-container">
        {loading ? (
          <SkeletonTable headers={['Period', 'Currency', 'Gross', 'PAYE', 'Net Pay', 'Download']} />
        ) : payslips.length === 0 ? (
          <EmptyState
            variant="no-data"
            icon={FileText}
            title="No payslips yet"
            description="Your payslips will appear here once payroll has been processed."
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="tbl-head-row">
                {['Period', 'Currency', 'Gross', 'PAYE', 'Net Pay', 'Download'].map((h) => (
                  <th key={h} className="tbl-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payslips.map((p: any) => (
                <tr key={p.id} className="tbl-row">
                  <td className="px-5 py-3.5 font-medium text-navy">
                    {p.payrollRun && new Date(p.payrollRun.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    {' – '}
                    {p.payrollRun && new Date(p.payrollRun.endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground">{p.payrollRun?.currency}</td>
                  <td className="px-5 py-3.5 font-bold text-navy">{fmt(p.gross)}</td>
                  <td className="px-5 py-3.5 font-medium text-red-500">{fmt(p.paye)}</td>
                  <td className="px-5 py-3.5 font-bold text-emerald-600">{fmt(p.netPay)}</td>
                  <td className="px-5 py-3.5">
                    <button
                      onClick={() => handlePdf(p.payrollRunId, p.id)}
                      className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-navy transition-colors"
                      title="Download PDF"
                    >
                      <Download size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default EmployeePayslips;
