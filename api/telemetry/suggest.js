module.exports = async function handler(req, res) { 
  function setCors(res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }
  
  if (req.method === "OPTIONS") { 
    setCors(res); 
    return res.status(204).end(); 
  }
  
  if (req.method === "GET") { 
    setCors(res); 
    return res.status(200).json({ ok: true, usage: "POST { seed_q, zhh, zhh_pron, chs, en, source }" }); 
  }
  
  if (req.method !== "POST") { 
    setCors(res); 
    return res.status(200).json({ ok: false, error: "Method Not Allowed (use POST)" }); 
  }

  try {
    let body = req.body;
    if (typeof body === "string") body = body ? JSON.parse(body) : {};
    body = body || {};

    // Extract and sanitize the fields
    const seed_q = String(body.seed_q || body.q || "").trim().slice(0, 200);
    const zhh = String(body.zhh || "").trim().slice(0, 200);

    // Ensure required fields are provided
    if (!zhh && !seed_q) {
      setCors(res);
      return res.status(200).json({ ok: false, error: "Missing zhh/seed_q" });
    }

    const payload = {
      seed_q: seed_q || null,
      zhh: zhh || null,
      zhh_pron: body.zhh_pron ? String(body.zhh_pron).trim().slice(0, 200) : null,
      chs: body.chs ? String(body.chs).trim().slice(0, 400) : '',  // Default empty string if not provided
      en: body.en ? String(body.en).trim().slice(0, 400) : '',    // Default empty string if not provided
      source: body.source ? String(body.source).trim().slice(0, 40) : "unknown",  // Default to 'unknown' if missing
      created_at: new Date().toISOString(),
    };

    // Check if the entry already exists
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.SUPABASE_URL;
    const anon = process.env.SUPABASE_ANON_KEY;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const key = service || anon;
    
    if (!url || !key) {
      setCors(res);
      return res.status(200).json({ ok: false, error: "Missing env: SUPABASE_URL or SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY" });
    }

    const supabase = createClient(url, key, { auth: { persistSession: false } });

    // Check if the word already exists in the lexeme_suggestions table
    const { data: existingData } = await supabase
      .from('lexeme_suggestions')
      .select('*')
      .eq('zhh', zhh)
      .single();

    if (existingData) {
      setCors(res);
      return res.status(200).json({ ok: true, message: 'Duplicate entry, not added.' });
    }

    // Insert new entry
    const { data, error } = await supabase
      .from('lexeme_suggestions')
      .insert([payload]);

    if (error) {
      setCors(res);
      return res.status(500).json({ ok: false, error: error.message });
    }

    setCors(res);
    return res.status(200).json({ ok: true, data });
  } catch (e) {
    setCors(res);
    return res.status(200).json({ ok: false, error: e?.message || String(e) });
  }
};
