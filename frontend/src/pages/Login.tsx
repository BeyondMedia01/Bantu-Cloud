import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, ArrowRight } from 'lucide-react';
import { AuthAPI } from '../api/client';
import { saveAuthData } from '../lib/auth';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [isInitialized, setIsInitialized] = useState<boolean | null>(null);

  React.useEffect(() => {
    import('../api/client').then(({ SetupAPI }) => {
      SetupAPI.check().then(res => setIsInitialized(res.data.initialized));
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await AuthAPI.login({ email, password });
      const { token, companyId, role } = res.data;
      saveAuthData(token, companyId);

      if (role === 'PLATFORM_ADMIN') navigate('/admin');
      else if (role === 'EMPLOYEE') navigate('/employee');
      else navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Login failed');
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

      <div className="w-full max-w-[440px] bg-primary rounded-2xl border border-border shadow-sm p-10">
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-2">Welcome back</h2>
          <p className="text-slate-500 font-medium">Please enter your details to continue</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-slate-400 uppercase tracking-wider">Email Address</label>
            <div className="relative">
              <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                required
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue transition-all font-medium"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-slate-400 uppercase tracking-wider">Password</label>
            <div className="relative">
              <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                required
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue transition-all font-medium"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full bg-btn-primary text-navy py-4 rounded-[9999px] font-bold shadow-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading ? 'Signing in…' : 'Sign In To Dashboard'}
            <ArrowRight size={18} />
          </button>

          <div className="flex items-center justify-between text-sm mt-1">
            <p className="font-medium text-slate-500">
              Don't have an account?
              <Link to="/register" className="ml-2 font-bold text-accent-blue hover:underline">Register</Link>
            </p>
            <Link to="/forgot-password" className="font-bold text-slate-400 hover:text-navy transition-colors">
              Forgot password?
            </Link>
          </div>
          {isInitialized === false && (
            <p className="text-center text-xs text-slate-400 animate-in fade-in slide-in-from-bottom-2 duration-500">
              First time? <Link to="/setup" className="font-bold text-accent-blue hover:underline">Platform Setup</Link>
            </p>
          )}
        </form>
      </div>

      <div className="mt-10 flex items-center gap-8 text-slate-400 font-bold text-xs uppercase tracking-[0.2em]">
        <span>Contact</span>
        <span>Privacy</span>
        <span>Terms</span>
      </div>
    </div>
  );
};

export default Login;
