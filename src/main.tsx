import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// --- Telemetry bootstrap (PV + Search) ---
// Sends PV once per load, and logs each /api/translate via try/finally
function initTelemetry() {
  if (typeof window === 'undefined') return;
  const w = window as any;
  if (w.__CT_TELEMETRY_INIT) return;
  w.__CT_TELEMETRY_INIT = true;

  const originalFetch: typeof window.fetch | undefined = window.fetch?.bind(window);
  if (!originalFetch) return;

  // Stable sid in localStorage
  const getSid = () => {
    try {
      const k = 'ct_sid';
      let sid = localStorage.getItem(k) || '';
      if (!sid) {
        sid = (crypto as any)?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem(k, sid);
      }
      return sid;
    } catch {
      return '';
    }
  };

  const getPath = () => `${window.location.pathname}${window.location.search}`;
  const getReferrer = () => document.referrer || '';

  const commonContext = () => ({
    sid: getSid(),
    path: getPath(),
    referrer: getReferrer(),
    lang: navigator.language || '',
  });

  const postTelemetry = (endpoint: string, payload: Record<string, any>) => {
    const data = { ...commonContext(), ...payload };
    // Prefer sendBeacon (no fetch recursion, survives unload)
    try {
      if (navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        const ok = navigator.sendBeacon(endpoint, blob);
        if (ok) return;
      }
    } catch {
      // ignore
    }
    // Fallback to originalFetch (NOT wrapped)
    originalFetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
      keepalive: true,
      credentials: 'same-origin',
    }).catch(() => {});
  };

  // PV once per load
  if (!w.__CT_PV_SENT) {
    w.__CT_PV_SENT = true;
    postTelemetry('/api/telemetry/pv', {});
  }

  // Wrap fetch to auto-log translate calls
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    let urlStr = '';
    try {
      if (typeof input === 'string') urlStr = input;
      else if (input instanceof URL) urlStr = input.toString();
      else urlStr = (input as Request).url;
    } catch {
      urlStr = '';
    }

    let url: URL | null = null;
    try {
      url = new URL(urlStr, window.location.origin);
    } catch {
      url = null;
    }

    const pathname = url?.pathname || '';
    const isTelemetry = pathname.startsWith('/api/telemetry');
    const isTranslate = pathname.startsWith('/api/translate');

    // Never log telemetry calls, and only intercept translate
    if (isTelemetry || !isTranslate) {
      return originalFetch(input as any, init);
    }

    // Extract query from URL or request body
    const extractQuery = (): string => {
      if (url) {
        const q0 = url.searchParams.get('q') || url.searchParams.get('query') || url.searchParams.get('text') || '';
        if (q0) return q0;
      }
      const body = init?.body as any;
      if (!body) return '';

      if (typeof body === 'string') {
        const s = body.trim();
        if (s.startsWith('{') && s.endsWith('}')) {
          try {
            const obj = JSON.parse(s);
            return (obj.q || obj.query || obj.text || obj.input || '').toString();
          } catch {
            return '';
          }
        }
        try {
          const usp = new URLSearchParams(s);
          return (usp.get('q') || usp.get('query') || usp.get('text') || '').toString();
        } catch {
          return '';
        }
      }

      if (body instanceof URLSearchParams) {
        return (body.get('q') || body.get('query') || body.get('text') || '').toString();
      }

      if (typeof FormData !== 'undefined' && body instanceof FormData) {
        return (body.get('q') || body.get('query') || body.get('text') || '')?.toString() || '';
      }

      return '';
    };

    let q = (extractQuery() || '').toString().trim();
    let res: Response | undefined;

    let from_src = 'unknown';
    let result_count = 0;
    let hit = false;

    try {
      res = await originalFetch(input as any, init);
      const data: any = await res.clone().json().catch(() => null);
      if (data && typeof data === 'object') {
        if (!q && typeof data.query === 'string') q = data.query.trim();
        if (typeof data.from === 'string' && data.from) from_src = data.from;
        if (typeof data.count === 'number' && Number.isFinite(data.count)) {
          result_count = data.count;
        } else if (Array.isArray(data.items)) {
          result_count = data.items.length;
        }
      }
      hit = result_count > 0;
      return res;
    } finally {
      if (q) {
        postTelemetry('/api/telemetry/search', {
          q,
          q_norm: q,
          hit,
          result_count,
          from_src,
        });
      }
    }
  };
}

initTelemetry();

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
