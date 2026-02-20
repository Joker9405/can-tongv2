import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/telemetry/search
 * Body:
 *  - q: string
 *  - isHit?: boolean
 *  - source?: string (default: 'web_search')
 *  - tz?: string (default: '')
 *
 * Writes:
 *  - telemetry_search: ALL queries (bingo/miss) aggregated by q (cnt++)
 *  - telemetry_zero: ONLY miss queries aggregated by q (cnt++)
 */
export default async function handler(req, res) {
  // CORS (simple)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

    const qRaw = (body.q ?? '').toString();
    const q = qRaw.trim();
    if (!q) {
      return res.status(200).json({ ok: true, recorded: false, skipped: true, reason: 'empty q' });
    }

    // Accept both camelCase (isHit) and snake_case (is_hit) to avoid mismatch.
    const isHit = body.isHit !== undefined ? Boolean(body.isHit) : Boolean(body.is_hit);
    const source = String(body.source || 'web_search');
    const tz = String(body.tz || '');

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.SUPABASE_ANON_KEY;

    // Serverless route SHOULD use service role. If missing, fall back to anon (may be blocked by RLS).
    const supabaseKey = serviceRoleKey || anonKey;
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ ok: false, error: 'Missing SUPABASE_URL or SUPABASE_*_KEY in Vercel env' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Call the DB function (atomic cnt++). The function itself writes both tables.
    // NOTE: arg names MUST match the SQL function: (is_hit, row_q, source, tz)
    const { data, error } = await supabase.rpc('track_unified_search', {
      is_hit: isHit,
      row_q: q,
      source,
      tz,
    });

    if (error) {
      // IMPORTANT: still return 200 so UI isn't broken, but expose error for debugging in DevTools.
      return res.status(200).json({
        ok: false,
        error: error.message || String(error),
        hint: 'Check Supabase SQL: track_unified_search(is_hit boolean, row_q text, source text, tz text) exists and is granted EXECUTE',
      });
    }

    // Your UI asked for: { ok: true, recorded: true, status: 'bingo' | 'miss' }
    const status = isHit ? 'bingo' : 'miss';
    return res.status(200).json({ ok: true, recorded: true, status, data: data ?? null });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}
