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
    const isHit = body.isHit === true;

    if (!q) {
      setCors(res);
      return res.status(200).json({ ok: true, skipped: true });
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

    // 调用统一的 RPC 函数，一次性处理两张表
    const { error } = await supabase.rpc('track_unified_search', {
      row_q: q,
      is_hit: isHit
    });

    if (error) throw error;

    setCors(res);
    return res.status(200).json({ ok: true, recorded: true, status: isHit ? "bingo" : "miss" });
  } catch (e) {
    setCors(res);
    return res.status(200).json({ ok: false, error: e.message });
  }
};