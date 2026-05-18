import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { TrialAPI } from '../api/client';
import { AlertTriangle, Lock } from 'lucide-react';
import { useToast } from '../context/ToastContext';

const HIDDEN_PATHS = ['/trial-onboarding', '/upgrade'];

const TrialBanner: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data } = useQuery({
    queryKey: ['trial-status'],
    queryFn: () => TrialAPI.getStatus().then(r => r.data),
    staleTime: 5 * 60 * 1000,
    retry: false,
    throwOnError: false,
  });

  // Listen for trial error events dispatched by the Axios interceptor
  useEffect(() => {
    function onTrialExpired() {
      showToast('Your trial has ended. Upgrade to continue editing.', 'error');
    }
    function onTrialCapReached() {
      showToast("You've reached the 10-employee trial limit. Upgrade to add more.", 'error');
    }
    window.addEventListener('trial-expired', onTrialExpired);
    window.addEventListener('trial-cap-reached', onTrialCapReached);
    return () => {
      window.removeEventListener('trial-expired', onTrialExpired);
      window.removeEventListener('trial-cap-reached', onTrialCapReached);
    };
  }, [showToast]);

  if (HIDDEN_PATHS.includes(location.pathname)) return null;
  if (!data?.trial) return null;

  const { trial } = data;
  const isExpired = trial.status === 'EXPIRED' || trial.daysRemaining === 0;

  if (isExpired) {
    return (
      <div className="bg-destructive/10 border-b border-destructive/30 px-4 py-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-destructive text-sm font-medium">
          <Lock size={14} />
          <span>Your trial has ended — your data is in read-only mode.</span>
        </div>
        <button
          onClick={() => navigate('/upgrade')}
          className="text-xs font-semibold bg-destructive text-destructive-foreground px-3 py-1 rounded-full hover:bg-destructive/90 transition-colors shrink-0"
        >
          Upgrade
        </button>
      </div>
    );
  }

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between gap-4 dark:bg-amber-950/20 dark:border-amber-800/30">
      <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-sm font-medium">
        <AlertTriangle size={14} />
        <span>
          Trial expires in <strong>{trial.daysRemaining} day{trial.daysRemaining !== 1 ? 's' : ''}</strong>.{' '}
          <span className="text-muted-foreground font-normal">
            {trial.employeeCount} of {trial.employeeCap} employees used.
          </span>
        </span>
      </div>
      <button
        onClick={() => navigate('/upgrade')}
        className="text-xs font-semibold text-amber-700 dark:text-amber-400 underline underline-offset-2 hover:no-underline shrink-0"
      >
        Upgrade
      </button>
    </div>
  );
};

export default TrialBanner;
