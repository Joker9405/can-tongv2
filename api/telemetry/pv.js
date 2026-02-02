// api/telemetry/pv.js
import { createClient } from "@supabase/supabase-js";

/**
 * 目标：PV 必须拿到 path / referrer（不要 EMPTY）
 * 做法：前端强制传 path/referrer；后端兜底从 headers.referer 推断
 * 建议用 SUPABASE_SERVICE_ROLE_KEY 写入，避免 RLS 干扰
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

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

  const body = req.body || {};
  const inferred = inferFromHeaders(req);

  const payload = {
    path: (body.path || inferred.path || "").toString(),
    referrer: (body.referrer ?? inferred.referer ?? "").toString(),
    ua: (req.headers["user-agent"] || "").toString(),
    lang: (body.lang || "").toString(),
    tz: (body.tz || "").toString(),
    country: (req.headers["x-vercel-ip-country"] || body.country || "").toString(),
  };

  const { error } = await supabase.from("telemetry_pv").insert(payload);
  if (error) return res.status(500).json({ ok: false, error: error.message });

  return res.status(200).json({ ok: true });
}
