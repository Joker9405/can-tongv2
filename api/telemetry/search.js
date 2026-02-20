// Vercel Serverless Function: /api/telemetry/search
// Records every search into telemetry_search, and additionally records misses into telemetry_zero.
// Requires SUPABASE_URL and (recommended) SUPABASE_SERVICE_ROLE_KEY in Vercel env.

const { createClient } = require('@supabase/supabase-js');

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  // CORS (so the same endpoint can be called from web / mini-program later)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return json(res, 200, { ok: true });
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

  if (!SUPABASE_URL) return json(res, 500, { ok: false, error: 'Missing env: SUPABASE_URL' });
  const key = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
  if (!key) return json(res, 500, { ok: false, error: 'Missing env: SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY)' });

  const supabase = createClient(SUPABASE_URL, key, {
    auth: { persistSession: false },
    global: { headers: { 'X-Client-Info': 'cantong-telemetry' } },
  });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }

  const q = String(body?.q ?? '').trim();
  const isHit = Boolean(body?.isHit);
  const source = String(body?.source ?? 'web_search');
  const tz = body?.tz == null ? null : String(body?.tz);

  if (!q) return json(res, 200, { ok: false, recorded: false, error: 'empty q' });

  // IMPORTANT: Use RPC so cnt increment is atomic.
  const { data, error } = await supabase.rpc('track_unified_search', {
    is_hit: isHit,
    row_q: q,
    source,
    tz,
  });

  if (error) {
    return json(res, 500, {
      ok: false,
      recorded: false,
      error: error.message,
      details: error.details || null,
      hint: error.hint || null,
      code: error.code || null,
    });
  }

  return json(res, 200, {
    ok: true,
    recorded: true,
    status: data?.hit_status ?? (isHit ? 'bingo' : 'miss'),
    data,
  });
};
