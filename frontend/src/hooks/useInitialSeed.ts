import { useState } from 'react';

const LOCAL_API = import.meta.env.VITE_API_URL as string;

interface SeedState {
  status: 'idle' | 'seeding' | 'done' | 'error';
  progress: number; // 0-100
  error: string | null;
}

export function useInitialSeed() {
  const [state, setState] = useState<SeedState>({ status: 'idle', progress: 0, error: null });

  /**
   * Pull initial data from the web server and seed the local database.
   * @param serverUrl - Base URL of the web server
   * @param authToken - JWT auth token from the web server login
   */
  async function seedFromServer(serverUrl: string, authToken: string) {
    setState({ status: 'seeding', progress: 0, error: null });

    try {
      let page = 1;
      const limit = 100;
      let hasMore = true;

      while (hasMore) {
        // 1. Fetch a page from the web server
        const res = await fetch(
          `${serverUrl}/api/sync/initial?page=${page}&limit=${limit}`,
          { headers: { Authorization: `Bearer ${authToken}` } }
        );

        if (!res.ok) {
          throw new Error(`Server returned ${res.status}`);
        }

        const { data } = await res.json();
        const { employees = [], companies = [], payrollRuns = [], payslips = [] } = data;

        const batchSize = employees.length + companies.length + payrollRuns.length + payslips.length;
        hasMore = batchSize === limit * 4; // Rough check — if full page, there may be more

        // 2. Write to local DB via local backend
        if (batchSize > 0) {
          const seedRes = await fetch(`${LOCAL_API}/api/sync/seed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          });

          if (!seedRes.ok) {
            const err = await seedRes.json();
            throw new Error(err.error || 'Seeding failed');
          }
        }

        // Update progress (cap at 95% until done)
        setState(s => ({ ...s, progress: Math.min(95, page * 10) }));

        if (batchSize < limit) {
          hasMore = false;
        }

        page++;
      }

      setState({ status: 'done', progress: 100, error: null });
    } catch (err) {
      setState({
        status: 'error',
        progress: 0,
        error: err instanceof Error ? err.message : 'Seeding failed',
      });
    }
  }

  function reset() {
    setState({ status: 'idle', progress: 0, error: null });
  }

  return { ...state, seedFromServer, reset };
}
