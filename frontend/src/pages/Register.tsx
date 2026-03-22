import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, User, Key, ArrowRight, Phone } from 'lucide-react';
import { AuthAPI } from '../api/client';

const Register: React.FC = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    firstName: '', lastName: '', phone: '', email: '', password: '', licenseToken: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await AuthAPI.register(form);
      navigate('/login');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 font-inter">
      <div className="flex items-center gap-3 mb-10">
        <div className="w-12 h-12 bg-accent-blue rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-lg">B</div>
        <h1 className="text-3xl font-bold tracking-tight text-navy">Bantu Payroll</h1>
      </div>

      <div className="w-full max-w-[480px] bg-primary rounded-2xl border border-border shadow-sm p-10">
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-2">Create your account</h2>
          <p className="text-slate-500 font-medium">You'll need a license token from your platform admin</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* Name Row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-slate-400 uppercase tracking-wider">First Name</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><User size={18} /></span>
                <input
                  type="text"
                  required
                  className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue transition-all font-medium"
                  placeholder="Jane"
                  value={form.firstName}
                  onChange={set('firstName')}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-slate-400 uppercase tracking-wider">Last Name</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><User size={18} /></span>
                <input
                  type="text"
                  required
                  className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue transition-all font-medium"
                  placeholder="Smith"
                  value={form.lastName}
                  onChange={set('lastName')}
                />
              </div>
            </div>
          </div>

          {/* Phone */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-slate-400 uppercase tracking-wider">Phone Number <span className="text-slate-300">(for 2FA)</span></label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><Phone size={18} /></span>
              <input
                type="tel"
                required
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue transition-all font-medium"
                placeholder="+263 77 123 4567"
                value={form.phone}
                onChange={set('phone')}
              />
            </div>
          </div>

          {[
            { field: 'email', label: 'Email Address', icon: <Mail size={18} />, type: 'email', placeholder: 'jane@company.com' },
            { field: 'password', label: 'Password', icon: <Lock size={18} />, type: 'password', placeholder: '••••••••' },
            { field: 'licenseToken', label: 'License Token', icon: <Key size={18} />, type: 'text', placeholder: 'Paste your license token' },
          ].map(({ field, label, icon, type, placeholder }) => (
            <div key={field} className="flex flex-col gap-2">
              <label className="text-sm font-bold text-slate-400 uppercase tracking-wider">{label}</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span>
                <input
                  type={type}
                  required
                  className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue transition-all font-medium"
                  placeholder={placeholder}
                  value={(form as any)[field]}
                  onChange={set(field)}
                />
              </div>
            </div>
          ))}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full bg-btn-primary text-navy py-4 rounded-[9999px] font-bold shadow-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading ? 'Creating account…' : 'Create Account'}
            <ArrowRight size={18} />
          </button>

          <p className="text-center text-sm font-medium text-slate-500">
            Already have an account?
            <Link to="/login" className="ml-2 font-bold text-accent-blue hover:underline">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default Register;
