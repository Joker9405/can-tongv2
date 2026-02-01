// api/telemetry/search.js (CommonJS, Vercel Node Function)
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  { auth: { persistSession: false } }
);

function safeJsonParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return safeJsonParse(req.body) || {};
  if (Buffer.isBuffer(req.body)) return safeJsonParse(req.body.toString('utf8')) || {};
  return await new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => resolve(safeJsonParse(raw) || {}));
    req.on('error', () => resolve({}));
  });
}

function inferFromHeaders(req) {
  const referer = req.headers.referer || '';
  let path = '';
  try {
    if (referer) {
      const u = new URL(referer);
      path = u.pathname + (u.search || '');
    }
  } catch {}
  return { referer, path };
}

function ensureNonEmpty(v, fallback) {
  const s = (v ?? '').toString().trim();
  if (!s || s.toUpperCase() === 'EMPTY') return (fallback ?? '').toString();
  return s;
}

function toInt(n, d = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? x : d;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.json({ ok: false, error: 'Method Not Allowed' });
  }

  const body = await readBody(req);
  const inferred = inferFromHeaders(req);

  const sid = ensureNonEmpty(body.sid, '') || (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));
  const path = ensureNonEmpty(body.path, inferred.path) || '/';

  const q = ensureNonEmpty(body.q, '').trim();
  if (!q) {
    res.statusCode = 200;
    return res.json({ ok: true, skipped: true });
  }

  const q_norm = ensureNonEmpty(body.q_norm, q);
  const result_count = toInt(body.result_count ?? body.count, 0);
  const from_src = ensureNonEmpty(body.from_src, body.from) || 'unknown';

  // Prefer explicit hit; else derive from result_count
  const hit = typeof body.hit === 'boolean' ? body.hit : result_count > 0;

  const payload = {
    sid,
    q,
    q_norm,
    hit,
    result_count,
    from_src,
    path,
  };

  const { error } = await supabase.from('telemetry_search').insert(payload);
  if (error) {
    res.statusCode = 500;
    return res.json({ ok: false, error: error.message });
  }

  res.statusCode = 200;
  return res.json({ ok: true });
};
