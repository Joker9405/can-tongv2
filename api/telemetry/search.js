// api/search.js
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") { setCors(res); return res.status(204).end(); }

  try {
    let { q, isHit } = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!q) return res.status(200).json({ ok: false });

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // 调用我们在数据库创建的统一函数 (track_unified_search)
    // 这个函数会处理：search表计数、识别bingo/miss、以及决定是否进zero表
    const { error } = await supabase.rpc('track_unified_search', {
      row_q: q.trim().toLowerCase(),
      is_hit: isHit
    });

    if (error) throw error;

    setCors(res);
    return res.status(200).json({ ok: true });
  } catch (e) {
    setCors(res);
    return res.status(200).json({ ok: false, error: e.message });
  }
};