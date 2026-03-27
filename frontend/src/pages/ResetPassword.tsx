import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { AuthAPI } from '../api/client';

const ResetPassword: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  if (!token) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6 font-inter text-center">
        <div>
          <p className="text-lg font-bold text-slate-500 mb-4">Invalid or missing reset token.</p>
          <button onClick={() => navigate('/forgot-password')} className="text-accent-blue font-bold hover:underline">
            Request a new link
          </button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      return setError('Password must be at least 8 characters.');
    }
    if (password !== confirm) {
      return setError('Passwords do not match.');
    }
    setLoading(true);
    try {
      await AuthAPI.resetPassword(token, password);
      setDone(true);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Reset failed. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 font-inter">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 bg-accent-blue rounded-xl flex items-center justify-center text-white font-bold text-lg shadow">B</div>
        <span className="text-xl font-bold text-navy">Bantu Payroll</span>
      </div>

      <div className="w-full max-w-[420px] bg-primary rounded-2xl border border-border shadow-sm p-10">
        {done ? (
          <div className="text-center">
            <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-emerald-500">
              <CheckCircle2 size={28} />
            </div>
            <h2 className="text-xl font-bold mb-2">Password updated</h2>
            <p className="text-slate-500 font-medium text-sm mb-6">
              Your password has been changed. You can now sign in with your new password.
            </p>
            <button
              onClick={() => navigate('/login')}
              className="w-full bg-btn-primary text-navy py-3 rounded-full font-bold shadow hover:opacity-90 flex items-center justify-center gap-2"
            >
              Sign In <ArrowRight size={16} />
            </button>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold mb-1">Set new password</h1>
            <p className="text-slate-500 font-medium text-sm mb-6">Choose a strong password — at least 8 characters.</p>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">New Password</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    required
                    autoFocus
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3.5 bg-slate-50 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue transition-all font-medium pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-navy p-1"
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Confirm Password</label>
                <input
                  type={showPw ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full px-4 py-3.5 bg-slate-50 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue transition-all font-medium"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="mt-1 w-full bg-btn-primary text-navy py-3.5 rounded-full font-bold shadow hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {loading ? 'Saving…' : 'Set Password'} <ArrowRight size={16} />
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default ResetPassword;
