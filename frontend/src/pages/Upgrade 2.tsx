import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpCircle, CheckCircle2, AlertCircle } from 'lucide-react';
import { TrialAPI } from '../api/client';
import { getUser } from '../lib/auth';

const Upgrade: React.FC = () => {
  const currentUser = getUser();
  const [name, setName] = useState(currentUser?.name || '');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['trial-status'],
    queryFn: () => TrialAPI.getStatus().then((r) => r.data),
    staleTime: 60_000,
    retry: 1,
  });

  const trial = data?.trial ?? null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setError('');
    setSubmitting(true);
    try {
      await TrialAPI.upgradeRequest({ name: name.trim(), message: message.trim() });
      setSuccess(true);
    } catch {
      setError("Failed to send. Please email us at bechanibeyond@gmail.com");
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
      return iso;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <ArrowUpCircle className="h-8 w-8 text-indigo-600" />
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Upgrade to Bantu Pro</h1>
            <p className="text-sm text-gray-500">Get in touch and we'll get you set up.</p>
          </div>
        </div>

        {/* Trial summary */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Your Current Plan</h2>

          {isLoading ? (
            <div className="space-y-3 animate-pulse">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-4 bg-gray-100 rounded w-3/4" />
              ))}
            </div>
          ) : trial === null ? (
            <p className="text-sm text-green-700 font-medium">You're already on a paid plan.</p>
          ) : (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <dt className="text-gray-500">Plan</dt>
                <dd className="font-medium text-gray-900">Trial</dd>
              </div>
              <div>
                <dt className="text-gray-500">Status</dt>
                <dd className={`font-medium ${trial.status === 'EXPIRED' ? 'text-red-600' : 'text-green-600'}`}>
                  {trial.status === 'EXPIRED' ? 'Expired' : trial.status === 'CONVERTED' ? 'Converted' : 'Active'}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Expiry Date</dt>
                <dd className="font-medium text-gray-900">{formatDate(trial.expiresAt)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Days Remaining</dt>
                <dd className="font-medium text-gray-900">
                  {trial.daysRemaining > 0 ? trial.daysRemaining : 'Expired'}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Employees Used</dt>
                <dd className="font-medium text-gray-900">
                  {trial.employeeCount} / {trial.employeeCap}
                </dd>
              </div>
            </dl>
          )}
        </div>

        {/* Contact form — only shown when there is a trial (or status is loading) */}
        {(isLoading || trial !== null) && !success && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Send Upgrade Request</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="upgrade-name">
                  Name
                </label>
                <input
                  id="upgrade-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="upgrade-message">
                  Message <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="upgrade-message"
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tell us about your organisation and what you need..."
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !message.trim()}
                className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2 px-4 transition-colors"
              >
                {submitting ? 'Sending…' : 'Send Upgrade Request'}
              </button>
            </form>
          </div>
        )}

        {/* Success state */}
        {success && (
          <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl px-5 py-4 text-sm text-green-800">
            <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0 text-green-600" />
            <p>We've received your request. We'll be in touch shortly.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Upgrade;
