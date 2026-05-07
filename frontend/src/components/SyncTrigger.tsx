import { useState } from 'react';
import { useSync } from '../hooks/useSync';
import type { SyncItem } from '../hooks/useSync';

interface SyncTriggerProps {
  serverUrl: string;
  authToken: string;
}

export function SyncTrigger({ serverUrl, authToken }: SyncTriggerProps) {
  const [showModal, setShowModal] = useState(false);
  const { pending, result, loading, error, startDryRun, confirmSync, reset } = useSync();

  async function handleSyncClick() {
    await startDryRun();
    setShowModal(true);
  }

  async function handleConfirm() {
    await confirmSync(serverUrl, authToken);
  }

  function handleClose() {
    setShowModal(false);
    reset();
  }

  return (
    <>
      <button
        onClick={handleSyncClick}
        disabled={loading}
        style={{ padding: '8px 16px', cursor: loading ? 'wait' : 'pointer' }}
      >
        {loading ? 'Checking...' : '↑ Sync to Cloud'}
      </button>

      {showModal && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}
        >
          <div style={{ background: 'white', borderRadius: 8, padding: 24, maxWidth: 600, width: '90%', maxHeight: '80vh', overflow: 'auto' }}>
            {result ? (
              <>
                <h2>Sync Complete</h2>
                <p>&#x2705; {result.synced} operations synced successfully.</p>
                {result.failed > 0 && (
                  <p style={{ color: 'red' }}>&#x274C; {result.failed} operations failed.</p>
                )}
                <button onClick={handleClose} style={{ marginTop: 16 }}>Close</button>
              </>
            ) : (
              <>
                <h2>Sync Preview</h2>
                {error && <p style={{ color: 'red' }}>{error}</p>}
                {pending.length === 0 ? (
                  <p>Nothing to sync &mdash; you&apos;re up to date!</p>
                ) : (
                  <>
                    <p>{pending.length} operations pending:</p>
                    <ul style={{ maxHeight: 300, overflow: 'auto', listStyle: 'none', padding: 0 }}>
                      {pending.map((item: SyncItem) => (
                        <li key={item.id} style={{ padding: '4px 0', borderBottom: '1px solid #eee' }}>
                          <strong>{item.operation}</strong>
                          {item.payload.id != null && <span style={{ color: '#666', marginLeft: 8 }}>id: {String(item.payload.id)}</span>}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={handleClose} disabled={loading}>Cancel</button>
                  <button
                    onClick={handleConfirm}
                    disabled={loading || pending.length === 0}
                    style={{ background: '#0066cc', color: 'white', padding: '8px 16px', border: 'none', borderRadius: 4 }}
                  >
                    {loading ? 'Syncing...' : 'Sync Now'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
