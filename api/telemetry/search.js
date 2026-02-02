// api/telemetry/search.js
// Purpose:
// 1) Accept POST telemetry from the browser (including "typing debounce" events)
// 2) If the request doesn't include a reliable hit/count, we will PROBE /api/translate?q=... to determine hit/miss
// 3) Only record MISS (count===0) into telemetry_search (so this table shows missing terms only)

const { createClient } = require('@supabase/supabase-js');

function getEnv(name) {
  return process.env[name] || '';
}

const supabaseUrl = getEnv('SUPABASE_URL');
const anonKey = getEnv('SUPABASE_ANON_KEY');
const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

// Prefer service role (server-side only) if provided, otherwise fall back to anon.
const supabaseKey = serviceKey || anonKey;

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

function inferFromHeaders(req) {
  const refererHeader = req.headers.referer || '';
  let path = '';
  try {
    if (refererHeader) {
      const u = new URL(refererHeader);
      path = u.pathname + (u.search || '');
    }
  } catch (_) {}
  return { refererHeader, path };
}

function safeParseBody(req) {
  const body = req.body;
  if (!body) return {};
  if (typeof body === 'object') return body;
  try {
    return JSON.parse(body);
  } catch (_) {
    return {};
  }
}

async function probeTranslateCount(req, q) {
  try {
    const proto = (req.headers['x-forwarded-proto'] || 'https').toString();
    const host = (req.headers['x-forwarded-host'] || req.headers.host || '').toString();
    if (!host) return { count: 0, from: '' };

    const url = `${proto}://${host}/api/translate?q=${encodeURIComponent(q)}`;
    const r = await fetch(url, { headers: { 'x-telemetry-probe': '1' } });
    const j = await r.json();
    const count = Number(j.count || 0);
    const from = (j.from || j.engine || '').toString();
    return { count: Number.isFinite(count) ? count : 0, from };
  } catch (_) {
    return { count: 0, from: '' };
  }
}

module.exports = async function handler(req, res) {
  // Make it "not scary" when you open the endpoint in a browser.
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      note: 'This endpoint records telemetry via POST. Open DevTools > Network to see POST /api/telemetry/search requests.',
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ ok: false, error: 'Missing SUPABASE_URL / SUPABASE_*_KEY env vars' });
  }

  const body = safeParseBody(req);
  const inferred = inferFromHeaders(req);

  const q = String(body.q || body.query || '').trim();
  if (!q) {
    return res.status(200).json({ ok: true, skipped: true, reason: 'empty query' });
  }

  // Always take path/referrer from body first (browser can provide reliably)
  const path = String(body.path || inferred.path || '/');
  const referrer = String(body.referrer ?? body.referrer_url ?? inferred.refererHeader ?? '');

  // If the client already provided count (e.g., after pressing Enter and receiving translate results), use it.
  let count = Number(body.count);
  let from = String(body.from || '');
  if (!Number.isFinite(count)) {
    const probed = await probeTranslateCount(req, q);
    count = probed.count;
    if (!from) from = probed.from;
  }

  // Requirement: only show missing terms in search table
  if (count > 0) {
    return res.status(200).json({ ok: true, skipped: true, reason: 'hit', count });
  }

  const payload = {
    q,
    path,
    referrer,
    ok: body.ok ?? true,
    from,
    count: 0,
    ms: Number.isFinite(Number(body.ms)) ? Number(body.ms) : 0,
    ua: String(req.headers['user-agent'] || ''),
    trigger: String(body.trigger || ''),
    ts: body.ts ? new Date(Number(body.ts)).toISOString() : null,
  };

  const { error } = await supabase.from('telemetry_search').insert(payload);
  if (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }

  return res.status(200).json({ ok: true, recorded: true, count: 0 });
};
