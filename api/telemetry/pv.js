// api/telemetry/pv.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  { auth: { persistSession: false } }
);

function inferFromHeaders(req) {
  const referer = req.headers.referer || "";
  let path = "";
  try {
    if (referer) path = new URL(referer).pathname + (new URL(referer).search || "");
  } catch (_) {}
  return { referer, path };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

  // Vercel Functions may pass body as object, string, or Buffer depending on client
  let body = req.body || {};
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  } else if (Buffer.isBuffer(body)) {
    try {
      body = JSON.parse(body.toString("utf8"));
    } catch {
      body = {};
    }
  }
  const inferred = inferFromHeaders(req);

  const path = (body.path || inferred.path || "/").toString();
  const referrer = (body.referrer ?? inferred.referer ?? "").toString();

  const payload = {
    path,
    referrer,
    // 可选：你表里如果有这些列就会写入；没有也不会报错（Supabase 会提示列不存在）
    ua: req.headers["user-agent"] || "",
    lang: body.lang || "",
    tz: body.tz || "",
  };

  const { error } = await supabase.from("telemetry_pv").insert(payload);
  if (error) return res.status(500).json({ ok: false, error: error.message });

  return res.status(200).json({ ok: true });
}
