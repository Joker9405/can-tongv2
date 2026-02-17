// api/telemetry/search.js
// Unified search telemetry:
// - Writes ALL searches into public.telemetry_search (hit_status=bingo/miss, cnt++, timestamps)
// - Writes ONLY misses into public.telemetry_zero (cnt++, timestamps)
//
// NOTE:
// 1) This endpoint expects: { q: string, isHit: boolean, tz?: string, source?: string }
// 2) It calls SQL RPC: public.track_unified_search(row_q text, is_hit boolean, row_tz text, row_source text)

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function safeJson(body) {
  if (!body) return {};
  if (typeof body === 'object') return body;
  try { return JSON.parse(body); } catch { return {}; }
}

function normQ(q) {
  return String(q || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 200);
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    setCors(res);
    return res.status(204).end();
  }

  if (req.method === 'GET') {
    setCors(res);
    return res.status(200).json({ ok: true, usage: 'POST { q, isHit, tz?, source? }' });
  }

  if (req.method !== 'POST') {
    setCors(res);
    return res.status(405).json({ ok: false, error: 'Method Not Allowed (POST only)' });
  }

  const body = safeJson(req.body);
  const q = normQ(body.q);
  const isHit = body.isHit === true;
  const tz = body.tz ? String(body.tz).slice(0, 64) : null;
  const source = body.source ? String(body.source).slice(0, 40) : 'web_search';

  if (!q) {
    setCors(res);
    return res.status(200).json({ ok: true, skipped: true });
  }

  const url = process.env.SUPABASE_URL;
  // Prefer service role in serverless. If not provided, fall back to anon.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    setCors(res);
    return res.status(500).json({
      ok: false,
      error: 'Missing env: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY)',
    });
  }

  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(url, key, { auth: { persistSession: false } });

    const { data, error } = await supabase.rpc('track_unified_search', {
      row_q: q,
      is_hit: isHit,
      row_tz: tz,
      row_source: source,
    });

    if (error) {
      setCors(res);
      return res.status(500).json({ ok: false, error: error.message });
    }

    setCors(res);
    return res.status(200).json({ ok: true, recorded: true, hit_status: isHit ? 'bingo' : 'miss', data });
  } catch (e) {
    setCors(res);
    return res.status(500).json({ ok: false, error: String(e && e.message ? e.message : e) });
  }
};
