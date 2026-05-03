import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Shield } from 'lucide-react';
import { SetupAPI } from '../api/client';

const Setup: React.FC = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', clientName: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await SetupAPI.init(form);
      navigate('/login');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Setup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 font-inter">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 bg-accent-green rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-lg">B</div>
        <h1 className="text-3xl font-bold tracking-tight text-navy">Bantu Payroll</h1>
      </div>

      <div className="flex items-center gap-2 mb-8 px-4 py-2 bg-amber-50 border border-amber-200 rounded-full">
        <Shield size={14} className="text-amber-600" />
        <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">Platform Setup — Run Once</span>
      </div>

      <div className="w-full max-w-[440px] bg-primary rounded-2xl border border-border shadow-sm p-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-2">Initialize Platform</h1>
          <p className="text-slate-500 font-medium">Creates the PLATFORM_ADMIN account and first client. This endpoint is disabled once setup is complete.</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {[
            { field: 'name', label: 'Admin Name', type: 'text', placeholder: 'Platform Administrator' },
            { field: 'email', label: 'Admin Email', type: 'email', placeholder: 'admin@bantu.io' },
            { field: 'password', label: 'Admin Password', type: 'password', placeholder: '••••••••' },
            { field: 'clientName', label: 'First Client Name', type: 'text', placeholder: 'Acme Corp' },
          ].map(({ field, label, type, placeholder }) => (
            <div key={field} className="flex flex-col gap-2">
              <label className="text-sm font-bold text-slate-400 uppercase tracking-wider">{label}</label>
              <input
                type={type}
                required
                className="w-full px-4 py-3.5 bg-slate-50 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green transition-all font-medium"
                placeholder={placeholder}
                value={(form as any)[field]}
                onChange={set(field)}
              />
            </div>
          ))}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full bg-brand text-navy py-4 rounded-[9999px] font-bold shadow-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading ? 'Initializing…' : 'Initialize Platform'}
            <ArrowRight size={18} />
          </button>
        </form>
      </div>
    </div>
  );
};

export default Setup;
