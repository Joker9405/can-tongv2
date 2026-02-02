import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

/**
 * Telemetry bootstrap (client-side)
 * - Ensures /api/telemetry/search fires even when results are from local CSV (no /api/translate request)
 * - Enriches payload with path/referrer/sid to reduce EMPTY rows
 */

const SID_KEY = 'cantong_sid'

function getSid(): string {
  try {
    const existing = localStorage.getItem(SID_KEY)
    if (existing && existing.length > 8) return existing
    const sid = (crypto as any)?.randomUUID ? (crypto as any).randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`
    localStorage.setItem(SID_KEY, sid)
    return sid
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
  }
}

function getPath(): string {
  try {
    const { pathname, search, hash } = window.location
    return `${pathname || '/'}${search || ''}${hash || ''}`
  } catch {
    return '/'
  }
}

function getReferrer(): string {
  try {
    return document.referrer || ''
  } catch {
    return ''
  }
}

function sendBeaconJson(url: string, payload: any): void {
  try {
    const body = JSON.stringify(payload)
    const blob = new Blob([body], { type: 'application/json' })

    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, blob)
      return
    }

    // Fallback: fetch keepalive
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {})
  } catch {
    // ignore
  }
}

// Prevent spamming duplicate logs on rapid Enter / IME confirmations
let lastLogKey = ''
let lastLogSrc = ''
let lastLogAt = 0
function shouldLogSearch(q: string, fromSrc: string): boolean {
  const key = q.trim()
  if (!key) return false
  const src = fromSrc || 'ui'
  const now = Date.now()
  if (key === lastLogKey && src === lastLogSrc && now - lastLogAt < 800) return false
  lastLogKey = key
  lastLogSrc = src
  lastLogAt = now
  return true
}

function logSearch(q: string, meta?: Partial<{ hit: boolean; result_count: number; from_src: string }>) {
  if (!shouldLogSearch(q, meta?.from_src)) return

  sendBeaconJson('/api/telemetry/search', {
    sid: getSid(),
    q,
    q_norm: q.trim(),
    hit: meta?.hit ?? false,
    result_count: meta?.result_count ?? 0,
    from_src: meta?.from_src ?? 'ui',
    path: getPath(),
    referrer: getReferrer(),
    lang: navigator.language || '',
    ua: navigator.userAgent || '',
  })
}

function extractQueryFromBody(body: any): string {
  if (!body) return ''
  return body.q || body.query || body.text || body.input || body.keyword || ''
}

function extractCountFromResponseData(data: any): number {
  if (!data) return 0
  if (typeof data.count === 'number') return data.count
  if (typeof data.result_count === 'number') return data.result_count
  if (Array.isArray(data.items)) return data.items.length
  if (Array.isArray(data.results)) return data.results.length
  if (Array.isArray(data.data)) return data.data.length
  return 0
}

function initTelemetry() {
  // 1) Capture Enter on inputs/textareas (covers local CSV hit where no network call happens)
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Enter') return
      const target = e.target as any
      if (!target) return
      const tag = (target.tagName || '').toLowerCase()
      if (tag !== 'input' && tag !== 'textarea') return
      const value = (target.value || '').toString().trim()
      if (!value) return

      // Delay slightly so UI state updates first; still ok if user keeps typing
      window.setTimeout(() => {
        logSearch(value, { from_src: 'ui' })
      }, 0)
    },
    true
  )

  // 2) Wrap fetch: when /api/translate is called, log a richer search event (hit/result_count/from_src)
  const originalFetch = window.fetch.bind(window)
  window.fetch = async (...args: any[]) => {
    const input = args[0]
    const init = args[1] || {}

    const url = typeof input === 'string' ? input : input?.url
    const method = (init.method || 'GET').toUpperCase()

    // Only intercept POST to translate endpoints
    const isTranslate = typeof url === 'string' && url.includes('/api/translate')

    let requestBody: any = null
    if (isTranslate && method === 'POST' && init.body) {
      try {
        requestBody = typeof init.body === 'string' ? JSON.parse(init.body) : init.body
      } catch {
        requestBody = null
      }
    }

    const res = await originalFetch(...args)

    if (isTranslate && method === 'POST') {
      try {
        const cloned = res.clone()
        const data = await cloned.json()

        const q = extractQueryFromBody(requestBody) || data?.query || data?.q || ''
        const count = extractCountFromResponseData(data)

        // Try to infer source string from API response if present
        const fromSrc = data?.from ? `api:${data.from}` : 'api:translate'

        if (q) {
          logSearch(q, {
            hit: count > 0,
            result_count: count,
            from_src: fromSrc,
          })
        }
      } catch {
        // ignore
      }
    }

    return res
  }
}

initTelemetry()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
