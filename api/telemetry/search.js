function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function normQ(q) {
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
    // 这里的 isHit 由前端判定后传入：命中词库为 true (bingo)，未命中为 false (miss)
    const isHit = body.isHit === true;
    const hitStatus = isHit ? "bingo" : "miss";

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
        error: "Missing env: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
      });
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

    // 1. 记录到 telemetry_search (全量表)
    // 使用 upsert 确保同一个词累加计数或更新状态
    const { error: searchErr } = await supabase.from('telemetry_search').upsert({
      q: q,
      is_zero: !isHit,
      hit_status: hitStatus,
      last_seen_at: new Date().toISOString()
    }, { onConflict: 'q' });

    if (searchErr) throw searchErr;

    // 2. 如果未命中，记录到 telemetry_zero (无结果表)
    if (!isHit) {
      await supabase.from('telemetry_zero').upsert({
        q: q,
        last_seen_at: new Date().toISOString()
      }, { onConflict: 'q' });
    }

    // 3. 保留你原有的 RPC 调用（如果你的数据库里已经写好了 track_unified_search 函数）
    await supabase.rpc("track_unified_search", {
      row_q: q,
      is_hit: isHit,
      row_tz: tz,
      row_source: source,
    });

    setCors(res);
    return res.status(200).json({ ok: true, recorded: true, hit_status: hitStatus });
  } catch (e) {
    setCors(res);
    return res.status(200).json({ ok: false, error: e?.message || String(e) });
  }
};