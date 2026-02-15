// 覆盖你项目中的 api/search.js
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
    // 关键：由前端判断该词是否在 lexeme.csv 中并传入
    const isHit = body.isHit === true;

    if (!q) {
      setCors(res);
      return res.status(200).json({ ok: true, skipped: true });
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
    );

    // 调用 SQL 函数一次性更新两张表
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