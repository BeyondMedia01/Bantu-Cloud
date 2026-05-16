import React, { useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, ArrowRight, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { AuthAPI } from '../api/client';
import { saveAuthData } from '../lib/auth';

const IS_DESKTOP = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;

function navigateAfterLogin(role: string, navigate: ReturnType<typeof useNavigate>) {
  if (role === 'PLATFORM_ADMIN') navigate('/admin');
  else if (role === 'EMPLOYEE') navigate('/employee');
  else navigate('/dashboard');
}

// ── TOTP step ──────────────────────────────────────────────────────────────────

interface TwoFAStepProps {
  tempToken: string;
  email: string;
  onBack: () => void;
}

const TwoFAStep: React.FC<TwoFAStepProps> = ({ tempToken, email, onBack }) => {
  const navigate = useNavigate();
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const refs = Array.from({ length: 6 }, () => useRef<HTMLInputElement>(null));

  const code = digits.join('');

  const handleChange = (i: number, val: string) => {
    const d = val.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[i] = d;
    setDigits(next);
    if (d && i < 5) refs[i + 1].current?.focus();
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs[i - 1].current?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setDigits(pasted.split(''));
      refs[5].current?.focus();
    }
    e.preventDefault();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length < 6) return;
    setError('');
    setLoading(true);
    try {
      const res = await AuthAPI.twoFA.authenticate(tempToken, code);
      const { token, refreshToken, role, companyId, clientId: _clientId } = res.data;
      const userId = (res.data as any).userId;
      saveAuthData(token, companyId ?? undefined, refreshToken, userId);
      navigateAfterLogin(role, navigate);
    } catch (err: any) {
      setError(err.message || 'Invalid code');
      setDigits(['', '', '', '', '', '']);
      refs[0].current?.focus();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-[440px] bg-primary rounded-2xl border border-border shadow-sm p-6 sm:p-10">
      <div className="flex flex-col items-center text-center mb-8">
        <div className="w-14 h-14 rounded-full bg-accent-green/10 flex items-center justify-center mb-4">
          <ShieldCheck size={28} className="text-accent-green" />
        </div>
        <h2 className="text-2xl font-bold mb-1">Two-factor authentication</h2>
        <p className="text-sm text-muted-foreground font-medium">
          Enter the 6-digit code from your authenticator app for<br />
          <span className="text-foreground font-semibold">{email}</span>
        </p>
      </div>

      {error && (
        <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium text-center">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="flex gap-2 justify-center" onPaste={handlePaste}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={refs[i]}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className="w-12 h-14 text-center text-xl font-bold border border-border rounded-xl bg-muted focus:outline-none focus:ring-2 focus:ring-accent-green/30 focus:border-accent-green transition-all"
              aria-label={`Digit ${i + 1}`}
              autoFocus={i === 0}
            />
          ))}
        </div>

        <button
          type="submit"
          disabled={loading || code.length < 6}
          className="w-full bg-brand text-navy py-4 rounded-[9999px] font-bold shadow-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {loading ? 'Verifying…' : 'Verify & Sign In'}
          <ArrowRight size={18} />
        </button>

        <button
          type="button"
          onClick={onBack}
          className="text-sm font-medium text-muted-foreground hover:text-navy transition-colors text-center"
        >
          ← Back to login
        </button>
      </form>
    </div>
  );
};

// ── Main login ─────────────────────────────────────────────────────────────────

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [twoFA, setTwoFA] = useState<{ tempToken: string } | null>(null);

  React.useEffect(() => {
    if (!IS_DESKTOP) return;
    import('../api/client').then(({ SetupAPI }) => {
      SetupAPI.check()
        .then(res => { if (!res.data.initialized) navigate('/onboarding'); })
        .catch(() => {});
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await AuthAPI.login({ email, password });
      const data = res.data;

      if (data.requiresTwoFactor) {
        setTwoFA({ tempToken: data.tempToken });
        return;
      }

      const { token, refreshToken, companyId, role } = data;
      const userId = (data as any).userId;
      saveAuthData(token, companyId ?? undefined, refreshToken, userId);

      if (IS_DESKTOP) {
        fetch('http://localhost:5005/api/auth/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, role, name: data.name, clientId: data.clientId, companyId, employeeId: data.employeeId }),
        }).catch(() => {});
      }

      navigateAfterLogin(role, navigate);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 font-inter">
      <div className="flex items-center gap-3 mb-10">
        <img src="/logo.svg" alt="Bantu" className="w-12 h-12" />
        <h1 className="text-3xl font-bold tracking-tight text-navy">Bantu Payroll</h1>
      </div>

      {twoFA ? (
        <TwoFAStep tempToken={twoFA.tempToken} email={email} onBack={() => setTwoFA(null)} />
      ) : (
        <div className="w-full max-w-[440px] bg-primary rounded-2xl border border-border shadow-sm p-6 sm:p-10">
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-2">Welcome back</h2>
            <p className="text-muted-foreground font-medium">Please enter your details to continue</p>
          </div>

          {error && (
            <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Email Address</label>
              <div className="relative">
                <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  className="w-full pl-12 pr-4 py-3.5 bg-muted border border-border rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green/20 focus-visible:border-accent-green transition-all font-medium"
                  placeholder="admin@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Password</label>
              <div className="relative">
                <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  className="w-full pl-12 pr-12 py-3.5 bg-muted border border-border rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green/20 focus-visible:border-accent-green transition-all font-medium"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-navy transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full bg-brand text-navy py-4 rounded-[9999px] font-bold shadow-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading ? 'Signing in…' : 'Sign In To Dashboard'}
              <ArrowRight size={18} />
            </button>

            <div className="flex items-center justify-between text-sm mt-1">
              {!IS_DESKTOP && (
                <p className="font-medium text-muted-foreground">
                  Don't have an account?
                  <Link to="/register" className="ml-2 font-bold text-accent-green hover:underline">Register</Link>
                </p>
              )}
              <Link to="/forgot-password" className="font-bold text-muted-foreground hover:text-navy transition-colors ml-auto">
                Forgot password?
              </Link>
            </div>
            {!IS_DESKTOP && (
              <div className="text-center mt-4 pt-4 border-t border-border">
                <Link to="/trial-signup" className="text-sm font-bold text-accent-green hover:underline">
                  Start a free 14-day trial
                </Link>
              </div>
            )}
          </form>
        </div>
      )}

      <div className="mt-10 flex items-center gap-8 text-muted-foreground font-bold text-xs uppercase tracking-[0.2em]">
        <span>Contact</span>
        <span>Privacy</span>
        <span>Terms</span>
      </div>
    </div>
  );
};

export default Login;
