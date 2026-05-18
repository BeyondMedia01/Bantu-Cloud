import { useState, useEffect } from 'react';
import { Button } from './ui/button';

const API_BASE_URL = import.meta.env.VITE_API_URL as string;

interface FailedItem {
  id: string;
  operation: string;
  payload: Record<string, unknown>;
  error: string | null;
  attempts: number;
}

export function SyncPanel() {
  const [items, setItems] = useState<FailedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  async function loadFailed() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/sync/failed`);
      const data = await res.json();
      setItems(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  async function retry(id: string) {
    setActionLoading(id);
    try {
      await fetch(`${API_BASE_URL}/api/sync/retry/${id}`, { method: 'POST' });
      await loadFailed();
    } finally {
      setActionLoading(null);
    }
  }

  async function dismiss(id: string) {
    setActionLoading(id);
    try {
      await fetch(`${API_BASE_URL}/api/sync/dismiss/${id}`, { method: 'DELETE' });
      await loadFailed();
    } finally {
      setActionLoading(null);
    }
  }

  useEffect(() => {
    loadFailed();
  }, []);

  if (loading) return <div className="p-4 text-sm text-muted-foreground">Loading failed sync items...</div>;

  if (items.length === 0) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">No sync conflicts — all operations are up to date.</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h2 className="text-base font-bold text-foreground mb-1">Sync Conflicts ({items.length})</h2>
      <p className="text-sm text-muted-foreground mb-4">These operations failed to sync. You can retry or dismiss them.</p>
      <div className="flex flex-col gap-2">
        {items.map(item => (
          <div
            key={item.id}
            className="border border-destructive/30 rounded-lg p-3 bg-destructive/5"
          >
            <div className="flex justify-between items-start gap-4">
              <div className="min-w-0">
                <strong className="text-sm font-semibold text-foreground">{item.operation}</strong>
                <span className="ml-2 text-xs text-muted-foreground">
                  {item.attempts} attempt{item.attempts !== 1 ? 's' : ''}
                </span>
                {item.error && (
                  <p className="text-xs text-destructive mt-1">{item.error}</p>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => retry(item.id)}
                  disabled={actionLoading === item.id}
                >
                  Retry
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => dismiss(item.id)}
                  disabled={actionLoading === item.id}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
