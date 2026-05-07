import { useState } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_URL as string;

export interface SyncItem {
  id: string;
  operation: string;
  payload: Record<string, unknown>;
}

export interface SyncResult {
  synced: number;
  failed: number;
  errors: Array<{ id: string; operation: string; error: string }>;
}

export function useSync() {
  const [pending, setPending] = useState<SyncItem[]>([]);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchDryRun(): Promise<SyncItem[]> {
    const res = await fetch(`${API_BASE_URL}/api/sync/dry-run`);
    if (!res.ok) throw new Error('Failed to fetch pending items');
    const data = await res.json();
    return data as SyncItem[];
  }

  async function executeSync(serverUrl: string, authToken: string): Promise<SyncResult> {
    const res = await fetch(`${API_BASE_URL}/api/sync/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serverUrl, authToken }),
    });
    if (!res.ok) throw new Error('Sync failed');
    return res.json();
  }

  async function startDryRun() {
    setLoading(true);
    setError(null);
    try {
      const items = await fetchDryRun();
      setPending(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pending items');
    } finally {
      setLoading(false);
    }
  }

  async function confirmSync(serverUrl: string, authToken: string) {
    setLoading(true);
    setError(null);
    try {
      const syncResult = await executeSync(serverUrl, authToken);
      setResult(syncResult);
      setPending([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setPending([]);
    setResult(null);
    setError(null);
  }

  return { pending, result, loading, error, startDryRun, confirmSync, reset };
}
