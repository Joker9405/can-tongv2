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
  if (req.method !== "POST") { setCors(res); return res.status(200).json({ ok: false, error: "Use POST" }); }

  try {
    let body = req.body;
    if (typeof body === "string") body = body ? JSON.parse(body) : {};

    const q = normQ(body.q);
    // isHit 由前端传入：true 代表搜到了结果，false 代表词库里没有
    const isHit = body.isHit === true;

    if (!q) {
      setCors(res);
      return res.status(200).json({ ok: true, skipped: true, reason: "empty q" });
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

    // 1. 处理 telemetry_search 表 (记录所有搜索行为)
    // 使用 upsert 逻辑：如果 q 存在则更新，不存在则插入
    const { data: sData, error: sError } = await supabase.rpc('increment_telemetry_search', {
      row_q: q,
      is_zero: !isHit
    });

    // 2. 如果未命中，处理 telemetry_zero 表
    if (!isHit) {
      await supabase.rpc('increment_telemetry_zero', { row_q: q });
    }

    setCors(res);
    return res.status(200).json({ ok: true, isHit });
  } catch (e) {
    setCors(res);
    return res.status(200).json({ ok: false, error: e.message });
  }
};