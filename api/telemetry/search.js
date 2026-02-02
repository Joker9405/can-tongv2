// api/telemetry/search.js
import { createClient } from "@supabase/supabase-js";

/**
 * 目标：
 * - 只记录「未命中(=缺失词)」到 telemetry_zero（去重+计数）
 * - 前端无需按 Enter；输入停留 ~3 秒即可触发一次（由前端 debounce）
 * - 服务器端二次校验：会先调用 /api/translate 探测是否命中，命中则不写库
 *
 * 需要的环境变量（Vercel）：
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY  （强烈建议：仅在 Serverless 使用，用于写入，避免 RLS/并发问题）
 * （若没配 service key，会退回用 SUPABASE_ANON_KEY，但你要确保 RLS 允许 insert/update）
 */

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
  { auth: { persistSession: false } }
);

function inferFromHeaders(req) {
  const referer = req.headers.referer || req.headers.referrer || "";
  let path = "";
  try {
    if (referer) {
      const u = new URL(referer);
      path = u.pathname + (u.search || "");
    }
  } catch (_) {}
  return { referer, path };
}

function normalizeQ(q) {
  return (q || "")
    .toString()
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

async function probeTranslate(req, q) {
  // 在 Vercel serverless 内部用同域请求探测是否命中
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = (req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const url = new URL(`${proto}://${host}/api/translate`);
  url.searchParams.set("q", q);
  // 你原来的 /api/translate 返回结构：{ ok:true, from:"...", query:"", count:0, items:[] }
  const r = await fetch(url.toString(), { headers: { accept: "application/json" } });
  const j = await r.json().catch(() => ({}));
  const count = Number(j.count ?? (Array.isArray(j.items) ? j.items.length : 0) ?? 0);
  const from = (j.from || "").toString();
  return { count, from, raw: j };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

  const body = req.body || {};
  const inferred = inferFromHeaders(req);

  const q = (body.q || "").toString().trim();
  if (!q) return res.status(200).json({ ok: true, skipped: true, reason: "empty q" });

  const q_norm = normalizeQ(q);

  // 优先相信前端显式传入（最稳），否则用 referer 推断
  const path = (body.path || inferred.path || "").toString();
  const referrer = (body.referrer ?? inferred.referer ?? "").toString();

  const lang = (body.lang || "").toString();
  const tz = (body.tz || "").toString();
  const ua = (req.headers["user-agent"] || "").toString();
  const country = (req.headers["x-vercel-ip-country"] || body.country || "").toString();

  // 服务器端探测是否命中：命中则不写库（避免 search 表出现命中词）
  let probe;
  try {
    probe = await probeTranslate(req, q);
  } catch (e) {
    // 探测失败：为了不丢数据，可选择仍然写入；这里默认“仍写入”，但标记 from_src=probe_error
    probe = { count: 0, from: "probe_error" };
  }

  if (probe.count > 0) {
    return res.status(200).json({ ok: true, skipped: true, hit: true, count: probe.count });
  }

  // 写入 telemetry_zero（去重+计数）——建议使用 SQL 创建的 RPC：log_zero_search
  // 如果你还没建 RPC，也可以先 insert 到 telemetry_zero_raw 再做聚合；但这里优先 RPC（原子+并发安全）
  const rpcName = (body.rpc || "log_zero_search").toString();
  const rpcArgs = {
    p_q: q,
    p_q_norm: q_norm,
    p_lang: lang,
    p_country: country,
    p_path: path,
    p_referrer: referrer,
    p_ua: ua,
    p_from_src: probe.from || "translate",
  };

  const { error } = await supabase.rpc(rpcName, rpcArgs);
  if (error) {
    // fallback：直接 insert（如果没有 RPC）
    const fallback = await supabase
      .from("telemetry_zero")
      .insert({
        day: new Date().toISOString().slice(0, 10),
        q,
        q_norm,
        lang,
        country,
        path,
        referrer,
        ua,
        from_src: rpcArgs.p_from_src,
        cnt: 1,
        first_seen_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      });

    if (fallback.error) return res.status(500).json({ ok: false, error: fallback.error.message, rpc_error: error.message });
    return res.status(200).json({ ok: true, used: "fallback_insert" });
  }

  return res.status(200).json({ ok: true, hit: false, count: 0 });
}
