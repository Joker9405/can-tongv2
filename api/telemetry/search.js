/**
 * /api/telemetry/search
 * Record ONLY "missing" queries into telemetry_zero (dedupe + cnt).
 * Never crash to 500; return 200 with ok:false on errors.
 */
module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    return res.status(204).end();
  }

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      usage: "POST JSON: { q: string }",
      note: "This endpoint only writes to telemetry_zero (dedupe + cnt).",
    });
  }

  if (req.method !== "POST") {
    return res.status(200).json({ ok: false, error: "Method Not Allowed (use POST)" });
  }

  try {
    let body = req.body;
    if (typeof body === "string") body = body ? JSON.parse(body) : {};
    body = body || {};

    const qRaw = (body.q ?? "").toString();
    const q = qRaw.trim();
    if (!q) return res.status(200).json({ ok: true, skipped: true, reason: "empty q" });

    const q_norm = q.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 120);

    const { createClient } = await import("@supabase/supabase-js");

    const supabaseUrl = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const keyToUse = serviceKey || anonKey;
    if (!supabaseUrl || !keyToUse) {
      return res.status(200).json({
        ok: false,
        error: "Missing env vars: SUPABASE_URL or SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY",
      });
    }

    const supabase = createClient(supabaseUrl, keyToUse, { auth: { persistSession: false } });

    const sel = await supabase
      .from("telemetry_zero")
      .select("id,cnt")
      .eq("q_norm", q_norm)
      .maybeSingle();

    if (sel.error && sel.status !== 406) {
      return res.status(200).json({ ok: false, error: "select failed: " + sel.error.message });
    }

    if (sel.data && sel.data.id) {
      const nextCnt = (sel.data.cnt || 0) + 1;
      const upd = await supabase
        .from("telemetry_zero")
        .update({ cnt: nextCnt, last_seen_at: new Date().toISOString() })
        .eq("id", sel.data.id)
        .select("id,q,q_norm,cnt,last_seen_at")
        .maybeSingle();

      if (upd.error) return res.status(200).json({ ok: false, error: "update failed: " + upd.error.message });
      return res.status(200).json({ ok: true, mode: "update", row: upd.data });
    }

    const ins = await supabase
      .from("telemetry_zero")
      .insert({
        q,
        q_norm,
        cnt: 1,
        first_seen_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      })
      .select("id,q,q_norm,cnt,first_seen_at,last_seen_at")
      .maybeSingle();

    if (ins.error) return res.status(200).json({ ok: false, error: "insert failed: " + ins.error.message });
    return res.status(200).json({ ok: true, mode: "insert", row: ins.data });
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    return res.status(200).json({ ok: false, error: msg });
  }
};

