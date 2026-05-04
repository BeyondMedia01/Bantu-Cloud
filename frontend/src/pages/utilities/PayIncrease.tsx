import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, CheckCircle2, ChevronDown } from 'lucide-react';
import { Dropdown } from '@/components/ui/dropdown';
import { UtilitiesAPI, DepartmentAPI } from '../../api/client';
import { getActiveCompanyId } from '../../lib/companyContext';

const PayIncrease: React.FC = () => {
  const navigate = useNavigate();
  const [departments, setDepartments] = useState<any[]>([]);
  const [form, setForm] = useState({
    type: 'percentage', value: '', effectiveDate: '',
    departmentId: '', employmentType: '',
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const companyId = getActiveCompanyId();
    if (companyId) DepartmentAPI.getAll({ companyId }).then((r) => setDepartments(r.data)).catch(() => {});
  }, []);

  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [f]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.value || !form.effectiveDate) return setError('Value and effective date are required');
    setError('');
    setLoading(true);
    try {
      const payload: Record<string, unknown> = { effectiveDate: form.effectiveDate };
      if (form.type === 'percentage') payload.percentage = parseFloat(form.value);
      else payload.amount = parseFloat(form.value);
      const filter: Record<string, unknown> = {};
      if (form.departmentId) filter.departmentId = form.departmentId;
      if (form.employmentType) filter.employmentType = form.employmentType;
      if (Object.keys(filter).length) payload.filter = filter;
      const res = await UtilitiesAPI.payIncrease(payload);
      setResult(res.data);
    } catch {
      setError(err.response?.data?.message || 'Failed to apply pay increase');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate('/utilities')} aria-label="Go back" className="p-2 hover:bg-muted rounded-xl"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-2xl font-bold">Bulk Pay Increase</h1>
          <p className="text-muted-foreground font-medium text-sm">Apply an increase to multiple employees at once</p>
        </div>
      </div>

      {result ? (
        <div className="bg-primary rounded-2xl border border-border p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <CheckCircle2 size={24} className="text-emerald-500" />
            <div>
              <p className="font-bold">{result.message}</p>
              <p className="text-sm text-muted-foreground">Effective: {result.effectiveDate}</p>
            </div>
          </div>
          <div className="bg-muted rounded-xl overflow-hidden border border-border">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-2 text-left font-bold text-muted-foreground text-xs uppercase">Employee</th>
                  <th className="px-4 py-2 text-left font-bold text-muted-foreground text-xs uppercase">New Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.employees?.map((emp) => (
                  <tr key={emp.id}>
                    <td className="px-4 py-2 font-medium">{emp.firstName} {emp.lastName}</td>
                    <td className="px-4 py-2 font-bold text-emerald-600">{emp.baseRate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
          <button onClick={() => setResult(null)} className="mt-4 text-sm font-bold text-accent-green hover:underline">
            Apply Another Increase
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="bg-primary rounded-2xl border border-border p-8 shadow-sm flex flex-col gap-5">
          {error && <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>}

          <div className="flex gap-1 bg-muted p-1 rounded-xl w-fit">
            {['percentage', 'amount'].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setForm((f) => ({ ...f, type: t }))}
                className={`px-4 py-2 rounded-lg text-sm font-bold capitalize transition-all ${form.type === t ? 'tab-pill-active' : 'tab-pill-inactive'}`}
              >
                {t === 'percentage' ? '% Increase' : 'Fixed Amount'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
                {form.type === 'percentage' ? 'Percentage (%)' : 'Amount'} *
              </label>
              <input
                required
                type="number"
                step="0.01"
                value={form.value}
                onChange={set('value')}
                placeholder={form.type === 'percentage' ? '10' : '50.00'}
                className="w-full px-4 py-3 bg-muted border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-green/20 font-medium text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Effective Date *</label>
              <input
                required
                type="date"
                value={form.effectiveDate}
                onChange={set('effectiveDate')}
                className="w-full px-4 py-3 bg-muted border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-green/20 font-medium text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Filter by Department</label>
              <Dropdown className="w-full" trigger={(isOpen) => {
                const dept = (departments as any[]).find(d => d.id === form.departmentId);
                return (
                  <button type="button" className="w-full flex items-center justify-between px-4 py-3 bg-muted border border-border rounded-xl font-medium text-sm hover:border-accent-green transition-colors">
                    <span>{dept ? dept.name : 'All Departments'}</span>
                    <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                );
              }} sections={[{ items: [
                { label: 'All Departments', onClick: () => set('departmentId')({ target: { value: '' } } as any) },
                ...(departments as any[]).map(d => ({ label: d.name, onClick: () => set('departmentId')({ target: { value: d.id } } as any) }))
              ]}]} />
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">Filter by Type</label>
              <Dropdown className="w-full" trigger={(isOpen) => {
                const labels: Record<string,string> = { '': 'All Types', PERMANENT: 'Permanent', CONTRACT: 'Contract', TEMPORARY: 'Temporary' };
                return (
                  <button type="button" className="w-full flex items-center justify-between px-4 py-3 bg-muted border border-border rounded-xl font-medium text-sm hover:border-accent-green transition-colors">
                    <span>{labels[form.employmentType] || 'All Types'}</span>
                    <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                );
              }} sections={[{ items: [
                { label: 'All Types', onClick: () => set('employmentType')({ target: { value: '' } } as any) },
                { label: 'Permanent', onClick: () => set('employmentType')({ target: { value: 'PERMANENT' } } as any) },
                { label: 'Contract', onClick: () => set('employmentType')({ target: { value: 'CONTRACT' } } as any) },
                { label: 'Temporary', onClick: () => set('employmentType')({ target: { value: 'TEMPORARY' } } as any) },
              ]}]} />
            </div>
          </div>

          <p className="text-xs text-muted-foreground font-medium">
            Leave filters empty to apply to all active employees in the selected company.
          </p>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading} className="flex items-center gap-1.5 bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 disabled:opacity-60">
              <TrendingUp size={16} /> {loading ? 'Applying…' : 'Apply Increase'}
            </button>
            <button type="button" onClick={() => navigate('/utilities')} className="px-4 py-2 rounded-full border border-border font-bold text-muted-foreground hover:bg-muted">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default PayIncrease;
