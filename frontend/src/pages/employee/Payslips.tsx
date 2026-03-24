import React, { useEffect, useState } from 'react';
import { FileText, Loader } from 'lucide-react';
import { EmployeeSelfAPI, PayrollAPI } from '../../api/client';
import { useToast } from '../../context/ToastContext';

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
      a.download = `payslip.pdf`;
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
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">My Payslips</h1>
        <p className="text-slate-500 text-sm font-medium">View and download your payslips</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-slate-400"><Loader size={24} className="animate-spin" /></div>
      ) : payslips.length === 0 ? (
        <div className="text-center py-16 text-slate-400 bg-primary rounded-2xl border border-border">
          <FileText size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No payslips yet</p>
        </div>
      ) : (
        <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-slate-50">
                {['Period', 'Currency', 'Gross', 'PAYE', 'Net Pay', 'Download'].map((h) => (
                  <th key={h} className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payslips.map((p: any) => (
                <tr key={p.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 text-sm font-bold">
                    {p.payrollRun && new Date(p.payrollRun.startDate).toLocaleDateString()} –{' '}
                    {p.payrollRun && new Date(p.payrollRun.endDate).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-sm">{p.payrollRun?.currency}</td>
                  <td className="px-4 py-3 text-sm font-bold">{p.gross?.toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-red-500">{p.paye?.toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm font-bold text-emerald-600">{p.netPay?.toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handlePdf(p.payrollRunId, p.id)}
                      className="flex items-center gap-1 text-xs font-bold text-accent-blue hover:underline"
                    >
                      <FileText size={14} /> PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default EmployeePayslips;
