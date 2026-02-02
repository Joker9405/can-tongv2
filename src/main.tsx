import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

/**
 * Telemetry: auto-report search drafts without requiring Enter.
 * - Debounce: 3 seconds after the user stops typing
 * - Reports to /api/telemetry/search (POST)
 *
 * This does NOT change your existing "press Enter to search" UI.
 * It only records what the user typed.
 */
function setupTypingTelemetry() {
  const w = window as any;
  // Avoid double-binding in React strict mode / HMR.
  if (w.__CANTONG_TELEMETRY_INPUT_BOUND) return;
  w.__CANTONG_TELEMETRY_INPUT_BOUND = true;

  const DEBOUNCE_MS = 3000;
  let timer: number | undefined;
  let lastSent = '';

  const report = async (q: string) => {
    try {
      const body = {
        q,
        trigger: 'typing_debounce',
        path: window.location.pathname + window.location.search,
        referrer: document.referrer || '',
        lang: navigator.language || '',
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
        ts: Date.now(),
      };
      await fetch('/api/telemetry/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true,
      });
    } catch {
      // ignore telemetry errors
    }
  };

  const onInput = (evt: Event) => {
    const el = evt.target as any;
    if (!el) return;

    const isTextLike = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
    if (!isTextLike) return;

    // Narrow to text/search inputs to avoid unrelated controls.
    if (el instanceof HTMLInputElement) {
      const t = String(el.type || '').toLowerCase();
      if (t && !['text', 'search'].includes(t)) return;
    }

    const val = String(el.value || '').trim();
    if (!val) return;

    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (val === lastSent) return;
      lastSent = val;
      report(val);
    }, DEBOUNCE_MS);
  };

  document.addEventListener('input', onInput, { passive: true });
}

setupTypingTelemetry();

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
