import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface ActivationProps {
  onActivated: () => void;
}

export function Activation({ onActivated }: ActivationProps) {
  const [serverUrl, setServerUrl] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleActivate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // 1. Authenticate with web server
      const authRes = await fetch(`${serverUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!authRes.ok) {
        const err = await authRes.json();
        throw new Error(err.error || 'Authentication failed');
      }
      const { token: authToken } = await authRes.json();

      // 2. Get device hardware ID (use a stable identifier)
      // For now use a random UUID stored locally — TODO: use actual hardware ID
      const deviceIdRaw = crypto.randomUUID();

      // 3. Activate license on web server
      const licenseRes = await fetch(`${serverUrl}/api/license/activate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ deviceId: deviceIdRaw }),
      });
      if (!licenseRes.ok) {
        const err = await licenseRes.json();
        throw new Error(err.error || 'License activation failed');
      }
      const { token: licenseToken } = await licenseRes.json();

      // 4. Store the license token
      await invoke('store_license_token', { token: licenseToken });

      onActivated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Activation failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: '100px auto', padding: 32 }}>
      <h1>Activate Bantu Desktop</h1>
      <p>Enter your Bantu account details to activate this device.</p>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <form onSubmit={handleActivate}>
        <div style={{ marginBottom: 16 }}>
          <label>Server URL</label>
          <input
            type="url"
            value={serverUrl}
            onChange={e => setServerUrl(e.target.value)}
            placeholder="https://app.bantu.com"
            required
            style={{ display: 'block', width: '100%' }}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={{ display: 'block', width: '100%' }}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            style={{ display: 'block', width: '100%' }}
          />
        </div>
        <button type="submit" disabled={loading}>
          {loading ? 'Activating...' : 'Activate'}
        </button>
      </form>
    </div>
  );
}
