import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, User, Key, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { SetupAPI } from '../api/client';
import { saveAuthData } from '../lib/auth';

const DesktopOnboarding: React.FC = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    licenseToken: '',
    firstName: '',
    lastName: '',
    email: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  const getStrength = (pw: string) => {
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return score;
  };
  const strength = getStrength(form.password);
  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong'][strength];
  const strengthColor = ['', 'bg-red-400', 'bg-amber-400', 'bg-blue-400', 'bg-emerald-500'][strength];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.licenseToken.startsWith('tb_')) {
      setError('License token must start with tb_');
      return;
    }
    setLoading(true);
    try {
      const res = await SetupAPI.desktopOnboard(form);
      const { token } = res.data;
      saveAuthData(token);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Setup failed. Check your license token and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 font-inter">
      <div className="flex items-center gap-3 mb-10">
        <div className="w-12 h-12 bg-accent-green rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-lg">B</div>
        <h1 className="text-3xl font-bold tracking-tight text-navy">Bantu Payroll</h1>
      </div>

      <div className="w-full max-w-[480px] bg-primary rounded-2xl border border-border shadow-sm p-10">
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-2">Activate your app</h2>
          <p className="text-muted-foreground font-medium">
            Enter the license token you received from Bantu, then create your admin account.
          </p>
        </div>

        {error && (
          <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* License token */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-muted-foreground uppercase tracking-wider">License Token</label>
            <div className="relative">
              <Key size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                required
                autoComplete="off"
                className="w-full pl-12 pr-4 py-3.5 bg-muted border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green transition-all font-mono text-sm"
                placeholder="tb_eyJ..."
                value={form.licenseToken}
                onChange={set('licenseToken')}
              />
            </div>
            <p className="text-xs text-muted-foreground">Provided by your Bantu account manager. Starts with <span className="font-mono font-bold">tb_</span></p>
          </div>

          {/* Name row */}
          <div className="grid grid-cols-2 gap-3">
            {(['firstName', 'lastName'] as const).map((field) => (
              <div key={field} className="flex flex-col gap-2">
                <label className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
                  {field === 'firstName' ? 'First Name' : 'Last Name'}
                </label>
                <div className="relative">
                  <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    required
                    className="w-full pl-12 pr-4 py-3.5 bg-muted border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green transition-all font-medium"
                    placeholder={field === 'firstName' ? 'Jane' : 'Smith'}
                    value={form[field]}
                    onChange={set(field)}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Email */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Email Address</label>
            <div className="relative">
              <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="email"
                required
                autoComplete="email"
                className="w-full pl-12 pr-4 py-3.5 bg-muted border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green transition-all font-medium"
                placeholder="jane@company.com"
                value={form.email}
                onChange={set('email')}
              />
            </div>
          </div>

          {/* Password with strength meter */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Password</label>
            <div className="relative">
              <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                className="w-full pl-12 pr-12 py-3.5 bg-muted border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green transition-all font-medium"
                placeholder="Min. 8 characters"
                value={form.password}
                onChange={set('password')}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-navy transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {form.password.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${strengthColor}`}
                    style={{ width: `${(strength / 4) * 100}%` }}
                  />
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${
                  strength <= 1 ? 'text-red-400' : strength === 2 ? 'text-amber-500' : strength === 3 ? 'text-blue-500' : 'text-emerald-600'
                }`}>{strengthLabel}</span>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full bg-brand text-navy py-4 rounded-[9999px] font-bold shadow-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading ? 'Setting up…' : 'Activate & Continue'}
            <ArrowRight size={18} />
          </button>

          <p className="text-center text-xs text-muted-foreground">
            Already have an account?{' '}
            <a href="/login" className="font-bold text-accent-green hover:underline">Sign in</a>
          </p>
        </form>
      </div>
    </div>
  );
};

export default DesktopOnboarding;
