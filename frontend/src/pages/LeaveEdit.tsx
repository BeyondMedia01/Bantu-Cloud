import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Loader, ChevronDown } from 'lucide-react';
import { Dropdown } from '@/components/ui/dropdown';
import { LeaveAPI, EmployeeAPI } from '../api/client';
import { Field } from '../components/common/Field';

const LEAVE_TYPES = ['ANNUAL', 'SICK', 'MATERNITY', 'PATERNITY', 'UNPAID', 'COMPASSIONATE', 'STUDY', 'OTHER'];

const LeaveEdit: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [employees, setEmployees] = useState<any[]>([]);
  const [fetching, setFetching] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    employeeId: '', type: 'ANNUAL', startDate: '', endDate: '',
    reason: '', status: 'PENDING',
  });

  useEffect(() => {
    Promise.all([
      LeaveAPI.getById(id!),
      EmployeeAPI.getAll({ limit: '500' }),
    ]).then(([leave, emps]) => {
      const l = leave.data;
      setForm({
        employeeId: l.employeeId || '',
        type:       l.type || 'ANNUAL',
        startDate:  l.startDate?.slice(0, 10) || '',
        endDate:    l.endDate?.slice(0, 10) || '',
        reason:     l.reason || l.notes || '',
        status:     l.status || 'PENDING',
      });
      setEmployees(emps.data?.data || emps.data || []);
    }).catch(() => setError('Failed to load leave record')).finally(() => setFetching(false));
  }, [id]);

  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [f]: e.target.value }));

  const days = form.startDate && form.endDate
    ? Math.max(0, Math.ceil((new Date(form.endDate).getTime() - new Date(form.startDate).getTime()) / 86400000) + 1)
    : 0;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await LeaveAPI.update(id!, { ...form, totalDays: days });
      navigate('/leave');
    } catch (e) {
      setError((e as {response?: {data?: {message?: string}}})?.response?.data?.message || 'Failed to update leave record');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) return (
    <div className="flex items-center justify-center h-64 text-muted-foreground">
      <Loader size={24} className="animate-spin" />
    </div>
  );

  return (
    <div className="max-w-xl">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate('/leave')} aria-label="Go back" className="p-2 hover:bg-muted rounded-xl transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold">Edit Leave Record</h1>
          <p className="text-muted-foreground font-medium text-sm">Update leave details</p>
        </div>
      </div>

      {error && <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium">{error}</div>}

      <form onSubmit={handleSubmit} className="bg-primary rounded-2xl border border-border p-8 shadow-sm flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Employee *</label>
          <Dropdown className="w-full" trigger={(isOpen) => (
            <button type="button" className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium flex items-center justify-between hover:border-accent-green transition-colors">
              <span className="truncate">{employees.find((e) => e.id === form.employeeId) ? `${employees.find((e) => e.id === form.employeeId).firstName} ${employees.find((e) => e.id === form.employeeId).lastName}` : 'Select employee'}</span>
              <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
          )} sections={[{ items: [
            { label: 'Select employee', onClick: () => setForm(p => ({ ...p, employeeId: '' })) },
            ...employees.map((e) => ({ label: `${e.firstName} ${e.lastName} (${e.employeeCode || e.id.slice(0, 6)})`, onClick: () => setForm(p => ({ ...p, employeeId: e.id })) })),
          ], emptyMessage: 'No employees found' }]} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Leave Type</label>
          <Dropdown className="w-full" trigger={(isOpen) => (
            <button type="button" className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium flex items-center justify-between hover:border-accent-green transition-colors">
              <span className="truncate">{form.type.charAt(0) + form.type.slice(1).toLowerCase().replace(/_/g, ' ')}</span>
              <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
          )} sections={[{ items: LEAVE_TYPES.map(t => ({ label: t.charAt(0) + t.slice(1).toLowerCase().replace(/_/g, ' '), onClick: () => setForm(p => ({ ...p, type: t })) })) }]} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Start Date *">
            <input required type="date" value={form.startDate} onChange={set('startDate')} />
          </Field>
          <Field label="End Date *">
            <input required type="date" value={form.endDate} onChange={set('endDate')} />
          </Field>
        </div>

        {days > 0 && (
          <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-100 rounded-xl text-sm font-bold text-accent-green">
            {days} day{days !== 1 ? 's' : ''}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</label>
          <Dropdown className="w-full" trigger={(isOpen) => (
            <button type="button" className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm font-medium flex items-center justify-between hover:border-accent-green transition-colors">
              <span>{form.status.charAt(0) + form.status.slice(1).toLowerCase()}</span>
              <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
          )} sections={[{ items: [
            { label: 'Pending',   onClick: () => setForm(p => ({ ...p, status: 'PENDING' })) },
            { label: 'Approved',  onClick: () => setForm(p => ({ ...p, status: 'APPROVED' })) },
            { label: 'Rejected',  onClick: () => setForm(p => ({ ...p, status: 'REJECTED' })) },
            { label: 'Cancelled', onClick: () => setForm(p => ({ ...p, status: 'CANCELLED' })) },
          ]}]} />
        </div>

        <Field label="Reason / Notes">
          <textarea value={form.reason} onChange={set('reason')} rows={3} placeholder="Optional reason" className="resize-none" />
        </Field>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-1.5 bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 disabled:opacity-60"
          >
            <Save size={16} /> {loading ? 'Saving…' : 'Save Changes'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/leave')}
            className="px-4 py-2 rounded-full border border-border font-bold text-muted-foreground hover:bg-muted"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default LeaveEdit;
