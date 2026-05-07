import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

// Check if we're running inside Tauri
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

function parseJwtExpiry(token: string): Date | null {
  try {
    const [, payload] = token.split('.');
    const decoded = JSON.parse(atob(payload));
    if (decoded.exp) {
      return new Date(decoded.exp * 1000);
    }
  } catch {
    // ignore
  }
  return null;
}

export type LicenseStatus = 'checking' | 'valid' | 'expired' | 'missing' | 'not_desktop';

export function useLicense() {
  const [status, setStatus] = useState<LicenseStatus>('checking');
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauri) {
      setStatus('not_desktop');
      return;
    }

    invoke<string | null>('get_license_token')
      .then(storedToken => {
        if (!storedToken) {
          setStatus('missing');
          return;
        }

        const expiry = parseJwtExpiry(storedToken);
        if (expiry && expiry < new Date()) {
          setStatus('expired');
        } else {
          setToken(storedToken);
          setStatus('valid');
        }
      })
      .catch(() => {
        setStatus('missing');
      });
  }, []);

  return { status, token, setToken, setStatus };
}
