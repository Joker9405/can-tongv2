// search.js 完整替换
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
    if (typeof body === "string") body = JSON.parse(body);

    const q = normQ(body.q);
    // 关键：接收前端的命中判断 (true/false)
    // 只记录“完成一次检索”的请求，不记录纯打字/输入事件。
    const hasIsHit = typeof body.isHit === 'boolean';
    const isHit = body.isHit === true;
    const tz = typeof body.tz === 'string' ? body.tz : null;
    const source = typeof body.source === 'string' ? body.source : null;

    if (!q) {
      setCors(res);
      return res.status(200).json({ ok: true, skipped: true });
    }

    if (!hasIsHit) {
      // 防止旧的“打字埋点”把所有输入都当成 miss 写进 telemetry_zero
      setCors(res);
      return res.status(200).json({ ok: true, skipped: true, reason: 'missing_isHit' });
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

    // 调用统一的 RPC 函数，一次性处理两张表
    const { error } = await supabase.rpc('track_unified_search', {
      row_q: q,
      is_hit: isHit,
      tz,
      source
    });

    if (error) throw error;

    setCors(res);
    return res.status(200).json({ ok: true, recorded: true, q, hit_status: isHit ? "bingo" : "miss" });
  } catch (e) {
    setCors(res);
    return res.status(200).json({ ok: false, error: e.message });
  }
};