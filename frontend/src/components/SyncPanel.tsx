import { useState, useEffect } from 'react';

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

  if (loading) return <div>Loading failed sync items...</div>;

  if (items.length === 0) {
    return (
      <div style={{ padding: 16 }}>
        <p>No sync conflicts — all operations are up to date.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <h2>Sync Conflicts ({items.length})</h2>
      <p>These operations failed to sync. You can retry or dismiss them.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(item => (
          <div
            key={item.id}
            style={{
              border: '1px solid #fca5a5',
              borderRadius: 6,
              padding: 12,
              background: '#fef2f2',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <strong>{item.operation}</strong>
                <span style={{ marginLeft: 8, color: '#666', fontSize: 12 }}>
                  {item.attempts} attempt{item.attempts !== 1 ? 's' : ''}
                </span>
                {item.error && (
                  <p style={{ color: '#dc2626', fontSize: 12, margin: '4px 0 0' }}>{item.error}</p>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => retry(item.id)}
                  disabled={actionLoading === item.id}
                  style={{ padding: '4px 12px', fontSize: 12 }}
                >
                  Retry
                </button>
                <button
                  onClick={() => dismiss(item.id)}
                  disabled={actionLoading === item.id}
                  style={{ padding: '4px 12px', fontSize: 12, color: '#666' }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
