import { createClient } from '@supabase/supabase-js';

// Vercel env priority (supports Vite / Next style env names)
const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  '';

const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';

// Prefer SERVICE_ROLE for reliability (bypasses RLS). Falls back to anon.
const supabaseKey = supabaseServiceKey || supabaseAnonKey;

const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
    : null;

export default async function handler(req, res) {
  // No caching
  res.setHeader('Cache-Control', 'no-store');

  // CORS (safe for telemetry)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  if (!supabase) {
    return res.status(500).json({
      ok: false,
      error:
        'Missing SUPABASE_URL and/or SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY) in server env.',
    });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body || '{}');
    } catch {
      body = {};
    }
  }

  const q = (body?.q ?? '').toString();
  const isHit = !!body?.isHit;
  const tz = body?.tz ? String(body.tz) : null;
  const source = body?.source ? String(body.source) : null;

  const qTrim = q.trim();
  if (!qTrim) {
    return res.status(200).json({ ok: true, skipped: true });
  }

  // DB-side atomic upsert + cnt++ (also writes telemetry_zero when miss)
  const { error } = await supabase.rpc('track_unified_search', {
    row_q: qTrim,
    is_hit: isHit,
    v_tz: tz,
    v_source: source,
  });

  if (error) {
    return res.status(500).json({ ok: false, error: error.message, code: error.code });
  }

  return res.status(200).json({ ok: true });
}
