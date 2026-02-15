function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}
function normQ(q) {
  return String(q || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") { setCors(res); return res.status(204).end(); }
  if (req.method === "GET") { setCors(res); return res.status(200).json({ ok: true, usage: "POST { q }" }); }
  if (req.method !== "POST") { setCors(res); return res.status(200).json({ ok: false, error: "Method Not Allowed (use POST)" }); }

  try {
    let body = req.body;
    if (typeof body === "string") body = body ? JSON.parse(body) : {};
    body = body || {};

    const q = normQ(body.q);
    if (!q) { setCors(res); return res.status(200).json({ ok: true, skipped: true, reason: "empty q" }); }

    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.SUPABASE_URL;
    const anon = process.env.SUPABASE_ANON_KEY;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const key = service || anon;
    if (!url || !key) {
      setCors(res);
      return res.status(200).json({ ok: false, error: "Missing env: SUPABASE_URL or SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY" });
    }
    const supabase = createClient(url, key, { auth: { persistSession: false } });

    const sel = await supabase.from("telemetry_zero").select("id,cnt").eq("q", q).maybeSingle();
    if (sel.error && sel.status !== 406) {
      setCors(res);
      return res.status(200).json({ ok: false, error: "select failed: " + sel.error.message });
    }

    if (sel.data?.id) {
      const nextCnt = (sel.data.cnt || 0) + 1;
      const upd = await supabase
        .from("telemetry_zero")
        .update({ cnt: nextCnt, last_seen_at: new Date().toISOString() })
        .eq("id", sel.data.id)
        .select("id,q,cnt,last_seen_at")
        .maybeSingle();
      if (upd.error) { setCors(res); return res.status(200).json({ ok: false, error: "update failed: " + upd.error.message }); }
      setCors(res); return res.status(200).json({ ok: true, mode: "update", row: upd.data });
    }

    const ins = await supabase
      .from("telemetry_zero")
      .insert({ q, cnt: 1, first_seen_at: new Date().toISOString(), last_seen_at: new Date().toISOString() })
      .select("id,q,cnt,last_seen_at")
      .maybeSingle();
    if (ins.error) { setCors(res); return res.status(200).json({ ok: false, error: "insert failed: " + ins.error.message }); }

    setCors(res); return res.status(200).json({ ok: true, mode: "insert", row: ins.data });
  } catch (e) {
    setCors(res);
    return res.status(200).json({ ok: false, error: e?.message || String(e) });
  }
};
