import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Loader } from 'lucide-react';
import { LeaveAPI, EmployeeAPI } from '../api/client';

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
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update leave record');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) return (
    <div className="flex items-center justify-center h-64 text-slate-400">
      <Loader size={24} className="animate-spin" />
    </div>
  );

  return (
    <div className="max-w-xl">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate('/leave')} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold">Edit Leave Record</h1>
          <p className="text-slate-500 font-medium text-sm">Update leave details</p>
        </div>
      </div>

      {error && <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium">{error}</div>}

      <form onSubmit={handleSubmit} className="bg-primary rounded-2xl border border-border p-8 shadow-sm flex flex-col gap-5">
        <Field label="Employee *">
          <select required value={form.employeeId} onChange={set('employeeId')}>
            <option value="">Select employee</option>
            {employees.map((e: any) => (
              <option key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.employeeCode || e.id.slice(0, 6)})</option>
            ))}
          </select>
        </Field>

        <Field label="Leave Type">
          <select value={form.type} onChange={set('type')}>
            {LEAVE_TYPES.map((t) => (
              <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase().replace(/_/g, ' ')}</option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Start Date *">
            <input required type="date" value={form.startDate} onChange={set('startDate')} />
          </Field>
          <Field label="End Date *">
            <input required type="date" value={form.endDate} onChange={set('endDate')} />
          </Field>
        </div>

        {days > 0 && (
          <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-100 rounded-xl text-sm font-bold text-accent-blue">
            {days} day{days !== 1 ? 's' : ''}
          </div>
        )}

        <Field label="Status">
          <select value={form.status} onChange={set('status')}>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </Field>

        <Field label="Reason / Notes">
          <textarea value={form.reason} onChange={set('reason')} rows={3} placeholder="Optional reason" className="resize-none" />
        </Field>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 bg-btn-primary text-navy px-8 py-3 rounded-full font-bold shadow hover:opacity-90 disabled:opacity-60"
          >
            <Save size={16} /> {loading ? 'Saving…' : 'Save Changes'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/leave')}
            className="px-6 py-3 rounded-full border border-border font-bold text-slate-500 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactElement }> = ({ label, children }) => {
  const child = React.cloneElement(children as React.ReactElement<any>, {
    className: `w-full px-4 py-3 bg-slate-50 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue font-medium text-sm ${(children.props as any).className || ''}`,
  });
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</label>
      {child}
    </div>
  );
};

export default LeaveEdit;
