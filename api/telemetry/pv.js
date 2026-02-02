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

    const refererHeader = getHeader(req, "referer");
    const referrer = (body.referrer || refererHeader || "").toString();

    // Prefer explicit body.path, else derive from referer URL, else '/'
    const path = (body.path || inferPathFromReferer(refererHeader) || "/").toString();

    const lang = (body.lang || getHeader(req, "accept-language") || "").toString();
    const ua = (body.ua || getHeader(req, "user-agent") || "").toString();
    const country = (body.country || getHeader(req, "x-vercel-ip-country") || "").toString();

    // Ensure we never insert empty strings (some schemas default to 'EMPTY')
    const payload = {
      sid,
      path: path || "/",
      referrer: referrer || "(direct)",
      lang: lang || "unknown",
      ua: ua || "unknown",
      country: country || "unknown",
    };

    const { error } = await supabase.from("telemetry_pv").insert(payload);

    if (error) {
      // Return 200 to avoid breaking user experience, but include debug info.
      return res.status(200).json({ ok: false, error: error.message });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    // Never throw 500 for telemetry
    return res.status(200).json({ ok: false, error: e?.message || "unknown" });
  }
}
