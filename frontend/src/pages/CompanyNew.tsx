import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { CompanyAPI } from '../api/client';

const CompanyNew: React.FC = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '', registrationNumber: '', taxId: '',
    address: '', contactEmail: '', contactPhone: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await CompanyAPI.create(form);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create company');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate(-1)} aria-label="Go back" className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold">New Company</h1>
          <p className="text-slate-500 font-medium text-sm">Add a company to your account</p>
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="bg-primary rounded-2xl border border-border p-8 shadow-sm flex flex-col gap-5">
        <Field label="Company Name" required>
          <input required value={form.name} onChange={set('name')} placeholder="e.g. Acme Zimbabwe (Pvt) Ltd" />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Registration Number">
            <input value={form.registrationNumber} onChange={set('registrationNumber')} placeholder="e.g. 1234/2020" />
          </Field>
          <Field label="Tax ID / BP Number">
            <input value={form.taxId} onChange={set('taxId')} placeholder="e.g. 1234567890" />
          </Field>
        </div>
        <Field label="Address">
          <input value={form.address} onChange={set('address')} placeholder="e.g. 1 Main St, Harare" />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Contact Email">
            <input type="email" value={form.contactEmail} onChange={set('contactEmail')} placeholder="info@company.co.zw" />
          </Field>
          <Field label="Contact Phone">
            <input value={form.contactPhone} onChange={set('contactPhone')} placeholder="+263 77 000 0000" />
          </Field>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 bg-btn-primary text-navy px-8 py-3 rounded-full font-bold shadow hover:opacity-90 disabled:opacity-60"
          >
            <Save size={16} /> {loading ? 'Creating…' : 'Create Company'}
          </button>
          <button type="button" onClick={() => navigate(-1)} className="px-6 py-3 rounded-full border border-border font-bold text-slate-500 hover:bg-slate-50">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

const Field: React.FC<{ label: string; required?: boolean; children: React.ReactElement }> = ({ label, required, children }) => {
  const id = React.useId();
  const child = React.cloneElement(children as React.ReactElement<any>, {
    id,
    className: 'w-full px-4 py-3 bg-slate-50 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue transition-all font-medium text-sm',
  });
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-bold text-slate-400 uppercase tracking-wider">
        {label}{required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {child}
    </div>
  );
};

export default CompanyNew;
