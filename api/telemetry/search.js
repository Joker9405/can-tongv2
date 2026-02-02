import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// NOTE: We use the anon key and rely on RLS policies that allow INSERT.
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function parseBody(req) {
  const b = req.body;
  if (!b) return {};
  if (typeof b === "object") return b;

  // Vercel Node + navigator.sendBeacon can arrive as string
  if (typeof b === "string") {
    try {
      return JSON.parse(b);
    } catch {
      return {};
    }
  }

  // Buffer / Uint8Array
  if (b?.toString) {
    try {
      return JSON.parse(b.toString("utf8"));
    } catch {
      return {};
    }
  }

  return {};
}

function getHeader(req, key) {
  return req.headers?.[key] || req.headers?.[key.toLowerCase()] || "";
}

function inferPathFromReferer(referer) {
  if (!referer) return "";
  try {
    const u = new URL(referer);
    return `${u.pathname || "/"}${u.search || ""}`;
  } catch {
    return "";
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const body = parseBody(req);

    const sid = (body.sid || "").toString() || null;
    const q = (body.q || "").toString().trim();
    const q_norm = (body.q_norm || q).toString().trim();

    // Accept either boolean or 0/1
    const hit = typeof body.hit === "boolean" ? body.hit : !!body.hit;

    const result_count_num = Number(body.result_count);
    const result_count = Number.isFinite(result_count_num) ? result_count_num : 0;

    const from_src = (body.from_src || "").toString();

    const refererHeader = getHeader(req, "referer");
    const path = (body.path || inferPathFromReferer(refererHeader) || "/").toString();

    // IMPORTANT: Match your existing telemetry_search schema.
    // Based on your Supabase screenshot, telemetry_search has columns:
    // sid, q, q_norm, hit, result_count, from_src, path
    const payload = {
      sid,
      q: q || "(empty)",
      q_norm: q_norm || "(empty)",
      hit,
      result_count,
      from_src,
      path: path || "/",
    };

    const { error } = await supabase.from("telemetry_search").insert(payload);

    if (error) {
      // Never 500 for telemetry; return 200 so frontend won't break.
      return res.status(200).json({ ok: false, error: error.message });
    }

    // Optional: zero-hit backfill (best effort)
    if (!hit && q) {
      try {
        await supabase.from("telemetry_zero").insert({ sid, q, q_norm, path: payload.path, from_src });
      } catch {
        // ignore
      }
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    // Never throw 500 for telemetry
    return res.status(200).json({ ok: false, error: e?.message || "unknown" });
  }
}
