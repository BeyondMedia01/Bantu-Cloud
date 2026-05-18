import { useState } from 'react';
import { useSync } from '../hooks/useSync';
import type { SyncItem } from '../hooks/useSync';
import { Button } from './ui/button';

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
      <Button onClick={handleSyncClick} disabled={loading} variant="outline" size="sm">
        {loading ? 'Checking...' : '↑ Sync to Cloud'}
      </Button>

      {showModal && (
        <div
          className="fixed inset-0 bg-foreground/50 flex items-center justify-center z-[1000]"
          onClick={(e) => e.target === e.currentTarget && handleClose()}
        >
          <div className="bg-card border border-border rounded-xl p-6 max-w-xl w-[90%] max-h-[80vh] overflow-auto shadow-2xl">
            {result ? (
              <>
                <h2 className="text-lg font-bold text-foreground mb-3">Sync Complete</h2>
                <p className="text-sm text-foreground mb-1">&#x2705; {result.synced} operations synced successfully.</p>
                {result.failed > 0 && (
                  <p className="text-sm text-destructive mb-3">&#x274C; {result.failed} operations failed.</p>
                )}
                <Button onClick={handleClose} className="mt-2">Close</Button>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold text-foreground mb-3">Sync Preview</h2>
                {error && <p className="text-sm text-destructive mb-3">{error}</p>}
                {pending.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing to sync &mdash; you&apos;re up to date!</p>
                ) : (
                  <>
                    <p className="text-sm text-foreground mb-2">{pending.length} operations pending:</p>
                    <ul className="max-h-[300px] overflow-auto list-none p-0 border border-border rounded-lg divide-y divide-border">
                      {pending.map((item: SyncItem) => (
                        <li key={item.id} className="px-3 py-2 flex items-center gap-2">
                          <strong className="text-sm font-semibold text-foreground">{item.operation}</strong>
                          {item.payload.id != null && (
                            <span className="text-xs text-muted-foreground font-mono">id: {String(item.payload.id)}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <div className="mt-4 flex gap-2 justify-end">
                  <Button variant="outline" onClick={handleClose} disabled={loading}>Cancel</Button>
                  <Button
                    onClick={handleConfirm}
                    disabled={loading || pending.length === 0}
                  >
                    {loading ? 'Syncing...' : 'Sync Now'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
