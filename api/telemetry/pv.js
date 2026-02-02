// api/telemetry/pv.js
// Records page views. Use POST from browser; GET returns a friendly ok.

const { createClient } = require('@supabase/supabase-js');

function getEnv(name) {
  return process.env[name] || '';
}

const supabaseUrl = getEnv('SUPABASE_URL');
const anonKey = getEnv('SUPABASE_ANON_KEY');
const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
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

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, note: 'Use POST to record page views.' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ ok: false, error: 'Missing SUPABASE_URL / SUPABASE_*_KEY env vars' });
  }

  const body = safeParseBody(req);
  const inferred = inferFromHeaders(req);

  const path = String(body.path || inferred.path || '/');
  const referrer = String(body.referrer ?? inferred.refererHeader ?? '');

  const payload = {
    path,
    referrer,
    ua: String(req.headers['user-agent'] || ''),
    lang: String(body.lang || ''),
    tz: String(body.tz || ''),
    ts: body.ts ? new Date(Number(body.ts)).toISOString() : null,
  };

  const { error } = await supabase.from('telemetry_pv').insert(payload);
  if (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }

  return res.status(200).json({ ok: true });
};
