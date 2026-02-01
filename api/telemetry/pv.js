// api/telemetry/pv.js (CommonJS, Vercel Node Function)
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
  // Vercel may give req.body as object already
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;

  if (typeof req.body === 'string') return safeJsonParse(req.body) || {};
  if (Buffer.isBuffer(req.body)) return safeJsonParse(req.body.toString('utf8')) || {};

  // Fallback: read raw stream
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

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.json({ ok: false, error: 'Method Not Allowed' });
  }

  const body = await readBody(req);
  const inferred = inferFromHeaders(req);

  const sid = ensureNonEmpty(body.sid, '') || (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));
  const path = ensureNonEmpty(body.path, inferred.path) || '/';
  const referrer = ensureNonEmpty(body.referrer, inferred.referer) || '';

  // Vercel geo headers (when available)
  const country = (req.headers['x-vercel-ip-country'] || body.country || '').toString();

  const payload = {
    sid,
    path,
    referrer,
    lang: (body.lang || req.headers['accept-language'] || '').toString(),
    ua: (req.headers['user-agent'] || '').toString(),
    country,
  };

  const { error } = await supabase.from('telemetry_pv').insert(payload);
  if (error) {
    res.statusCode = 500;
    return res.json({ ok: false, error: error.message });
  }

  res.statusCode = 200;
  return res.json({ ok: true });
};
