import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, ChevronDown } from 'lucide-react';
import { Dropdown } from '@/components/ui/dropdown';
import { LoanAPI, EmployeeAPI } from '../api/client';
import { Field } from '../components/common/Field';

const LoanNew: React.FC = () => {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<any[]>([]);
  const [form, setForm] = useState({
    employeeId: '', amount: '', interestRate: '0', termMonths: '12',
    startDate: '', description: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    EmployeeAPI.getAll({ limit: '200' }).then((r) => setEmployees(r.data?.data || r.data)).catch(() => {});
  }, []);

  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [f]: e.target.value }));

  const monthlyInstalment = form.amount && form.termMonths
    ? (() => {
        const P = parseFloat(form.amount);
        const r = parseFloat(form.interestRate) / 100 / 12;
        const n = parseInt(form.termMonths);
        if (r === 0) return (P / n).toFixed(2);
        return (P * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1)).toFixed(2);
      })()
    : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.employeeId) return setError('Please select an employee');
    setError('');
    setLoading(true);
    try {
      const res = await LoanAPI.create({
        ...form,
        amount: parseFloat(form.amount),
        interestRate: parseFloat(form.interestRate),
        termMonths: parseInt(form.termMonths),
      });
      navigate(`/loans/${res.data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create loan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate('/loans')} aria-label="Go back" className="p-2 hover:bg-slate-100 rounded-xl"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-2xl font-bold">New Loan</h1>
          <p className="text-slate-500 font-medium text-sm">Issue a new employee loan with repayment schedule</p>
        </div>
      </div>

      {error && <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>}

      <form onSubmit={handleSubmit} className="bg-primary rounded-2xl border border-border p-8 shadow-sm flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Employee *</label>
          <Dropdown className="w-full" trigger={(isOpen) => (
            <button type="button" className="w-full px-4 py-3 bg-slate-50 border border-border rounded-xl text-sm font-medium flex items-center justify-between hover:border-accent-green transition-colors">
              <span className="truncate">{employees.find((e: any) => e.id === form.employeeId) ? `${employees.find((e: any) => e.id === form.employeeId).firstName} ${employees.find((e: any) => e.id === form.employeeId).lastName}` : 'Select employee'}</span>
              <ChevronDown size={14} className={`text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
          )} sections={[{ items: [
            { label: 'Select employee', onClick: () => setForm(p => ({ ...p, employeeId: '' })) },
            ...employees.map((e: any) => ({ label: `${e.firstName} ${e.lastName} (${e.employeeCode || e.id.slice(0, 6)})`, onClick: () => setForm(p => ({ ...p, employeeId: e.id })) })),
          ], emptyMessage: 'No employees found' }]} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Loan Amount *"><input required type="number" step="0.01" value={form.amount} onChange={set('amount')} placeholder="1000.00" /></Field>
          <Field label="Annual Interest Rate (%)"><input type="number" step="0.1" value={form.interestRate} onChange={set('interestRate')} /></Field>
          <Field label="Term (Months) *"><input required type="number" value={form.termMonths} onChange={set('termMonths')} /></Field>
          <Field label="Start Date *"><input required type="date" value={form.startDate} onChange={set('startDate')} /></Field>
        </div>

        {monthlyInstalment && (
          <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Estimated Monthly Instalment</p>
            <p className="text-2xl font-bold text-accent-green">{Number(monthlyInstalment).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
        )}

        <Field label="Description / Purpose">
          <textarea value={form.description} onChange={set('description')} rows={3} placeholder="Reason for loan" className="resize-none" />
        </Field>

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={loading} className="flex items-center gap-1.5 bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 disabled:opacity-60">
            <Save size={16} /> {loading ? 'Creating…' : 'Create Loan'}
          </button>
          <button type="button" onClick={() => navigate('/loans')} className="px-4 py-2 rounded-full border border-border font-bold text-slate-500 hover:bg-slate-50">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default LoanNew;
