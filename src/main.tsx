import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css'; 
import App from './App'; 

// --- Telemetry bootstrap (PV + Search) ---
// 1) Sends a PV event once per load
// 2) Wraps fetch() so every /api/translate request is logged in a try/finally
//    (records hit/miss, duration, source, etc.)
function initTelemetry() {
  if (typeof window === 'undefined') return;
  const w = window as any;
  if (w.__CT_TELEMETRY_INIT) return;
  w.__CT_TELEMETRY_INIT = true;

  const originalFetch: typeof window.fetch | undefined = window.fetch?.bind(window);
  if (!originalFetch) return;

  const getPath = () => `${window.location.pathname}${window.location.search}`;
  const getReferrer = () => document.referrer || '';
  const getTZ = () => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    } catch {
      return '';
    }
  };

  const commonContext = () => ({
    path: getPath(),
    referrer: getReferrer(),
    lang: navigator.language || '',
    tz: getTZ(),
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

    const start = performance.now();
    let res: Response | undefined;

    // Extract query from URL or request body
    const extractQuery = (): string => {
      if (url) {
        const q0 =
          url.searchParams.get('q') ||
          url.searchParams.get('query') ||
          url.searchParams.get('text') ||
          '';
        if (q0) return q0;
      }
      const body = init?.body as any;
      if (!body) return '';

      // JSON string
      if (typeof body === 'string') {
        const s = body.trim();
        // Try JSON
        if (s.startsWith('{') && s.endsWith('}')) {
          try {
            const obj = JSON.parse(s);
            return (obj.q || obj.query || obj.text || obj.input || '').toString();
          } catch {
            return '';
          }
        }
        // Try querystring-ish
        try {
          const usp = new URLSearchParams(s);
          return (
            usp.get('q') || usp.get('query') || usp.get('text') || ''
          ).toString();
        } catch {
          return '';
        }
      }

      // URLSearchParams
      if (body instanceof URLSearchParams) {
        return (
          body.get('q') || body.get('query') || body.get('text') || ''
        ).toString();
      }

      // FormData
      if (typeof FormData !== 'undefined' && body instanceof FormData) {
        return (
          body.get('q') || body.get('query') || body.get('text') || ''
        )?.toString();
      }

      return '';
    };

    let q = (extractQuery() || '').toString().trim();
    let ok = false;
    let from = '';
    let count = 0;
    let status = 0;

    try {
      res = await originalFetch(input as any, init);
      ok = res.ok;
      status = res.status;

      // Try read translate JSON (without consuming the original response)
      const data: any = await res.clone().json().catch(() => null);
      if (data && typeof data === 'object') {
        if (!q && typeof data.query === 'string') q = data.query.trim();
        if (typeof data.ok === 'boolean') ok = data.ok;
        if (typeof data.from === 'string') from = data.from;
        if (typeof data.count === 'number' && Number.isFinite(data.count)) {
          count = data.count;
        } else if (Array.isArray(data.items)) {
          count = data.items.length;
        }
      }

      return res;
    } catch (e) {
      ok = false;
      if (!from) from = 'translate_error';
      throw e;
    } finally {
      const ms = Math.round(performance.now() - start);
      if (q) {
        postTelemetry('/api/telemetry/search', {
          q,
          ok,
          from: from || 'unknown',
          count,
          ms,
          status,
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
