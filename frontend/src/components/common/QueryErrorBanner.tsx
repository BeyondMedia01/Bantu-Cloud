import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, X, RefreshCw } from 'lucide-react';

interface Props {
  error: string | null;
  onDismiss: () => void;
}

export const QueryErrorBanner = ({ error, onDismiss }: Props) => {
  const queryClient = useQueryClient();

  if (!error) return null;

  const handleRetry = () => {
    queryClient.refetchQueries();
  };

  return (
    <div
      role="alert"
      className="sticky top-0 z-[100] flex items-center gap-3 px-4 sm:px-8 py-2.5 bg-red-50 border-b border-red-200 text-sm text-red-700"
    >
      <AlertTriangle size={16} className="shrink-0 text-red-400" />
      <span className="flex-1 min-w-0 truncate">
        <span className="font-semibold">Connection issue:</span> {error}
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleRetry}
          className="inline-flex items-center gap-1.5 rounded-lg bg-red-100 hover:bg-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition-colors"
        >
          <RefreshCw size={12} />
          Retry
        </button>
        <button
          onClick={onDismiss}
          className="rounded-lg p-1.5 text-red-400 hover:text-red-600 hover:bg-red-100 transition-colors"
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};
