function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function normQ(q) {
  // Keep it simple: trim + collapse spaces + lowercase (so same word counts together)
  return String(q || "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 120);
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") { setCors(res); return res.status(204).end(); }
  if (req.method === "GET") { setCors(res); return res.status(200).json({ ok: true, usage: "POST { q, isHit, tz?, source? }" }); }
  if (req.method !== "POST") { setCors(res); return res.status(200).json({ ok: false, error: "POST only" }); }

  try {
    let body = req.body;
    if (typeof body === "string") body = body ? JSON.parse(body) : {};
    body = body || {};

    const q = normQ(body.q);
    const isHit = body.isHit === true;

    const tz = typeof body.tz === "string" ? body.tz.slice(0, 64) : "";
    const source = typeof body.source === "string" ? body.source.slice(0, 40) : "web";

    if (!q) {
      setCors(res);
      return res.status(200).json({ ok: true, skipped: true });
    }

    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
      setCors(res);
      return res.status(200).json({
        ok: false,
        error: "Missing env: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (set them in Vercel Project → Environment Variables)",
      });
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

    // Atomic increment via RPC (recommended)
    const { error } = await supabase.rpc("track_unified_search", {
      row_q: q,
      is_hit: isHit,
      row_tz: tz,
      row_source: source,
    });

    if (error) throw error;

    setCors(res);
    return res.status(200).json({ ok: true, recorded: true, hit_status: isHit ? "bingo" : "miss" });
  } catch (e) {
    setCors(res);
    return res.status(200).json({ ok: false, error: e?.message || String(e) });
  }
};
