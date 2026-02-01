// api/telemetry/search.js
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

  const q = (body.q || "").toString().trim();

  const payload = {
    q,
    path,
    referrer,
    ok: body.ok ?? true,
    from: body.from || "",
    count: Number.isFinite(body.count) ? body.count : Number(body.count || 0),
    ms: Number.isFinite(body.ms) ? body.ms : Number(body.ms || 0),
    ua: req.headers["user-agent"] || "",
  };

  const { error } = await supabase.from("telemetry_search").insert(payload);
  if (error) return res.status(500).json({ ok: false, error: error.message });

  // 可选：如果你有 telemetry_zero 表，未命中就顺手写一条
  if (payload.count === 0 && q) {
    try {
      const { error: zerr } = await supabase.from("telemetry_zero").insert({
        q,
        path,
        referrer,
        from: payload.from || "zero",
      });
      // Ignore telemetry_zero errors to avoid breaking primary logging
      void zerr;
    } catch {
      // ignore
    }
  }

  return res.status(200).json({ ok: true });
}
