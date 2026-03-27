import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail } from 'lucide-react';
import { AuthAPI } from '../api/client';

const ForgotPassword: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await AuthAPI.forgotPassword(email);
      setSent(true);
    } catch {
      setError('Something went wrong. Please try again.');
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
        {sent ? (
          <div className="text-center">
            <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-emerald-500">
              <Mail size={28} />
            </div>
            <h2 className="text-xl font-bold mb-2">Check your inbox</h2>
            <p className="text-slate-500 font-medium text-sm mb-6">
              If <strong>{email}</strong> is registered, we've sent a password reset link. Check your spam folder if it doesn't arrive.
            </p>
            <button
              onClick={() => navigate('/login')}
              className="w-full bg-btn-primary text-navy py-3 rounded-full font-bold shadow hover:opacity-90 transition-opacity"
            >
              Back to Sign In
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={() => navigate('/login')}
              className="flex items-center gap-1.5 text-sm font-bold text-slate-400 hover:text-navy transition-colors mb-6"
            >
              <ArrowLeft size={15} /> Back to Sign In
            </button>

            <h1 className="text-2xl font-bold mb-1">Forgot password?</h1>
            <p className="text-slate-500 font-medium text-sm mb-6">
              Enter your email and we'll send you a reset link.
            </p>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 font-medium">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Email Address</label>
                <input
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3.5 bg-slate-50 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue transition-all font-medium"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="mt-1 w-full bg-btn-primary text-navy py-3.5 rounded-full font-bold shadow hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {loading ? 'Sending…' : 'Send Reset Link'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default ForgotPassword;
