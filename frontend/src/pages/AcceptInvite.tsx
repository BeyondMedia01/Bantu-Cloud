import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { InviteAPI } from '../api/client';
import { saveAuthData } from '../lib/auth';

const schema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type FormData = z.infer<typeof schema>;

const AcceptInvite: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';

  const [inviteInfo, setInviteInfo] = useState<{ email: string; companyName: string } | null>(null);
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (!token) { setLoadError('Invalid invite link.'); return; }
    InviteAPI.validate(token)
      .then((res) => setInviteInfo(res.data))
      .catch((err) => setLoadError(err.message ?? 'Invite not found or expired.'));
  }, [token]);

  const onSubmit = async (data: FormData) => {
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await InviteAPI.accept({ token, firstName: data.firstName, lastName: data.lastName, password: data.password });
      saveAuthData(res.data.token, res.data.companyId);
      navigate('/dashboard');
    } catch (err: any) {
      setSubmitError(err.message ?? 'Failed to accept invite. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <img src="/logo.svg" alt="Bantu" className="w-12 h-12" />
        </div>

        {loadError ? (
          <div className="bg-card border border-border rounded-2xl p-8 text-center">
            <p className="text-sm font-semibold text-red-500">{loadError}</p>
            <p className="text-xs text-muted-foreground mt-2">Contact your administrator for a new invite.</p>
          </div>
        ) : !inviteInfo ? (
          <div className="flex justify-center">
            <div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" />
          </div>
        ) : (
          <div className="bg-card border border-border rounded-2xl p-8 shadow-sm">
            <h1 className="text-xl font-bold text-navy mb-1">Set up your account</h1>
            <p className="text-sm text-muted-foreground mb-6">
              You've been invited to <span className="font-semibold text-navy">{inviteInfo.companyName}</span>.
              <br />Signing in as <span className="font-semibold">{inviteInfo.email}</span>.
            </p>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">First Name</label>
                  <input
                    {...register('firstName')}
                    className="mt-1 w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand"
                    placeholder="Jane"
                  />
                  {errors.firstName && <p className="text-xs text-red-500 mt-1">{errors.firstName.message}</p>}
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Last Name</label>
                  <input
                    {...register('lastName')}
                    className="mt-1 w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand"
                    placeholder="Brown"
                  />
                  {errors.lastName && <p className="text-xs text-red-500 mt-1">{errors.lastName.message}</p>}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Password</label>
                <input
                  {...register('password')}
                  type="password"
                  className="mt-1 w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand"
                  placeholder="Min 8 characters"
                />
                {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>}
              </div>

              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Confirm Password</label>
                <input
                  {...register('confirmPassword')}
                  type="password"
                  className="mt-1 w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand"
                  placeholder="Repeat password"
                />
                {errors.confirmPassword && <p className="text-xs text-red-500 mt-1">{errors.confirmPassword.message}</p>}
              </div>

              {submitError && <p className="text-xs text-red-500 font-semibold">{submitError}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 rounded-xl bg-navy text-white text-sm font-bold hover:bg-navy/90 transition-colors disabled:opacity-50"
              >
                {submitting ? 'Setting up account...' : 'Create Account & Sign In'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default AcceptInvite;
