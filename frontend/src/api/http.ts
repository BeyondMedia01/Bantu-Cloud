import { getToken, logout, saveAuthData, getRefreshToken, getStoredUserId } from '../lib/auth';

const IS_DESKTOP = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;
const DESKTOP_CLOUD_URL = import.meta.env.VITE_DESKTOP_API_URL as string || 'https://api.payroll.thinkbantu.com/api';
const DESKTOP_LOCAL_URL = 'http://localhost:5005/api';
const WEB_BASE_URL = import.meta.env.VITE_API_URL as string || 'https://api.payroll.thinkbantu.com';
const BASE_URL = IS_DESKTOP
  ? DESKTOP_CLOUD_URL
  : WEB_BASE_URL.replace(/\/api\/?$/, '').replace(/\/+$/, '') + '/api';

type RequestOptions = {
  params?: Record<string, string>;
  responseType?: 'json' | 'blob';
  headers?: Record<string, string>;
};

type HttpResponse<T> = { data: T; headers: Record<string, string> };

async function request<T = any>(method: string, url: string, body?: any, options?: RequestOptions): Promise<HttpResponse<T>> {
  const token = getToken();
  const companyId = sessionStorage.getItem('activeCompanyId');
  const reqHeaders: Record<string, string> = { ...options?.headers };

  if (token) reqHeaders['Authorization'] = `Bearer ${token}`;
  if (companyId) reqHeaders['x-company-id'] = companyId;
  if (body && !(body instanceof FormData)) {
    reqHeaders['Content-Type'] = 'application/json';
  }

  let fullUrl = `${BASE_URL}${url}`;
  if (options?.params) {
    const qs = new URLSearchParams(options.params).toString();
    if (qs) fullUrl += `?${qs}`;
  }

  const fetchOpts: RequestInit = {
    method,
    headers: reqHeaders,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  };
  if (IS_DESKTOP && method === 'GET') {
    fetchOpts.signal = AbortSignal.timeout(15_000);
  }

  let response = await fetch(fullUrl, fetchOpts);

  // Desktop offline fallback
  if (IS_DESKTOP && !response.ok && response.status >= 500) {
    const otherUrl = BASE_URL === DESKTOP_CLOUD_URL ? DESKTOP_LOCAL_URL : DESKTOP_CLOUD_URL;
    const fallbackUrl = url.startsWith('/') ? `${otherUrl}${url}` : `${otherUrl}/${url}`;
    response = await fetch(fallbackUrl, fetchOpts);
  }

  if (response.status === 401) {
    // The refresh token is an httpOnly cookie — send it automatically via credentials: 'include'.
    try {
      const storedRefreshToken = getRefreshToken();
      const storedUserId = getStoredUserId();
      if (!storedRefreshToken || !storedUserId) throw new Error('No refresh token');
      const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: storedUserId, refreshToken: storedRefreshToken }),
      });
      if (refreshRes.ok) {
        const data = await refreshRes.json();
        saveAuthData(data.token, sessionStorage.getItem('activeCompanyId') ?? undefined, data.refreshToken, data.userId);
        // Retry the original request with the new access token
        const retryHeaders = { ...reqHeaders, Authorization: `Bearer ${data.token}` };
        const retryOpts: RequestInit = { ...fetchOpts, headers: retryHeaders };
        response = await fetch(fullUrl, retryOpts);
        if (response.ok) {
          const retryResHeaders: Record<string, string> = {};
          response.headers.forEach((v, k) => { retryResHeaders[k.toLowerCase()] = v; });
          if (options?.responseType === 'blob') {
            return { data: await response.blob() as unknown as T, headers: retryResHeaders };
          }
          const retryJson = await response.json();
          if (retryJson !== null && typeof retryJson === 'object' && !Array.isArray(retryJson) && 'data' in retryJson && !('total' in retryJson)) {
            return { data: retryJson.data, headers: retryResHeaders };
          }
          return { data: retryJson, headers: retryResHeaders };
        }
      }
    } catch {
      // fall through to logout
    }
    logout();
    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
    throw Object.assign(new Error('Unauthorized'), { status: 401 });
  }

  const resHeaders: Record<string, string> = {};
  response.headers.forEach((v, k) => { resHeaders[k.toLowerCase()] = v; });

  if (options?.responseType === 'blob') {
    if (!response.ok) {
      const err = await response.text();
      throw Object.assign(new Error(err || response.statusText), { status: response.status });
    }
    return { data: await response.blob() as unknown as T, headers: resHeaders };
  }

  let json: any;
  try {
    json = await response.json();
  } catch {
    throw Object.assign(
      new Error(`Server error (${response.status} ${response.statusText})`),
      { status: response.status },
    );
  }
  if (!response.ok) {
    if (response.status === 403) {
      if (json?.trialExpired) {
        window.dispatchEvent(new CustomEvent('trial-expired', { detail: json }));
      } else if (json?.trialCapReached) {
        window.dispatchEvent(new CustomEvent('trial-cap-reached', { detail: json }));
      }
    }
    throw Object.assign(new Error(json.error || json.message || response.statusText), { status: response.status });
  }

  if (
    json !== null &&
    typeof json === 'object' &&
    !Array.isArray(json) &&
    'data' in json &&
    !('total' in json)
  ) {
    return { data: json.data, headers: resHeaders };
  }

  return { data: json, headers: resHeaders };
}

export const http = {
  get: <T = any>(url: string, options?: RequestOptions) => request<T>('GET', url, undefined, options),
  post: <T = any>(url: string, body?: any, options?: RequestOptions) => request<T>('POST', url, body, options),
  put: <T = any>(url: string, body?: any, options?: RequestOptions) => request<T>('PUT', url, body, options),
  patch: <T = any>(url: string, body?: any, options?: RequestOptions) => request<T>('PATCH', url, body, options),
  delete: <T = any>(url: string, options?: RequestOptions) => request<T>('DELETE', url, undefined, options),
};
