// search.js - 放置在 api 目录下 (例如 api/search.js)
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") { setCors(res); return res.status(204).end(); }
  if (req.method !== "POST") { setCors(res); return res.status(200).json({ ok: false, error: "POST only" }); }

  try {
    const { q, isHit } = req.body;
    const searchTerm = String(q || "").trim().toLowerCase();
    const hitStatus = isHit ? "bingo" : "miss";

    if (!searchTerm) {
      setCors(res);
      return res.status(200).json({ ok: true, skipped: true });
    }

    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
      setCors(res);
      return res.status(200).json({ ok: false, error: "Missing Env" });
    }

    // 动态加载避免编译时路径错误
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(url, serviceKey);

    // 1. 全量记录到 telemetry_search
    await supabase.from('telemetry_search').insert([{
      q: searchTerm,
      hit_status: hitStatus,
      is_zero: !isHit,
      last_seen_at: new Date().toISOString()
    }]);

    // 2. 如果未命中，记录到 telemetry_zero
    if (!isHit) {
      await supabase.from('telemetry_zero').insert([{
        q: searchTerm,
        last_seen_at: new Date().toISOString()
      }]);
    }

    setCors(res);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    setCors(res);
    return res.status(200).json({ ok: false, error: error.message });
  }
};