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
  if (req.method !== "POST") { setCors(res); return res.status(200).json({ ok: false, error: "POST only" }); }

  try {
    let body = req.body;
    if (typeof body === "string") body = body ? JSON.parse(body) : {};
    body = body || {};

    const q = normQ(body.q);
    const isHit = body.isHit === true;
    const hitStatus = isHit ? "bingo" : "miss"; // 自动判定标签

    if (!q) {
      setCors(res);
      return res.status(200).json({ ok: true, skipped: true });
    }

    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
      setCors(res);
      return res.status(200).json({ ok: false, error: "Missing Env" });
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

    // --- 1. 写入 telemetry_search (解决你“无法写入该表”的问题) ---
    await supabase.from('telemetry_search').insert([{
      q: q,
      hit_status: hitStatus,
      is_zero: !isHit,
      last_seen_at: new Date().toISOString()
    }]);

    // --- 2. 如果未命中，写入 telemetry_zero (保留你原有的需求) ---
    if (!isHit) {
      await supabase.from('telemetry_zero').insert([{
        q: q,
        last_seen_at: new Date().toISOString()
      }]);
    }

    // --- 3. 保留你原有的 RPC 调用逻辑 (如果你的数据库有对应的函数) ---
    await supabase.rpc("track_unified_search", {
      row_q: q,
      is_hit: isHit
    });

    setCors(res);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    setCors(res);
    return res.status(200).json({ ok: false, error: error.message });
  }
};