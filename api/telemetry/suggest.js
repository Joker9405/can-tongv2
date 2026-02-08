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
    return res.status(200).json({ ok: true, usage: "POST { word, is_r18, chs, en, source }" }); 
  }
  
  if (req.method !== "POST") { 
    setCors(res); 
    return res.status(200).json({ ok: false, error: "Method Not Allowed (use POST)" }); 
  }

  try {
    let body = req.body;
    if (typeof body === "string") body = body ? JSON.parse(body) : {};
    body = body || {};

    // 关键：使用 word 作为主字段（实际表中的列名）
    const word = String(body.word || "").trim().slice(0, 200);

    // Ensure required fields are provided
    if (!word) {
      setCors(res);
      return res.status(200).json({ ok: false, error: "Missing word" });
    }

    const payload = {
      word: word,  // 词汇本身（主字段）
      chs: body.chs ? String(body.chs).trim().slice(0, 400) : null,  // 中文同义词或翻译
      en: body.en ? String(body.en).trim().slice(0, 400) : null,     // 英文同义词或翻译
      source: body.source ? String(body.source).trim().slice(0, 40) : "web",  // 默认为 'web'
      status: 'pending',
      is_r18: typeof body.is_r18 === "boolean"
        ? (body.is_r18 ? 1 : 0)
        : typeof body.is_r18 === "number"
        ? (body.is_r18 ? 1 : 0)
        : (typeof body.is_r18 === "string" && body.is_r18.trim() === "1" ? 1 : 0),
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

    // Check if the word entry already exists in the lexeme_suggestions table
    const { data: existingData, error: existingError } = await supabase
      .from('lexeme_suggestions')
      .select('id, word, is_r18, chs, en, source')
      .eq('word', word)
      .limit(1);

    if (existingError) {
      setCors(res);
      return res.status(500).json({ ok: false, error: existingError.message });
    }

    // If entry exists, merge fields instead of inserting duplicate
    if (existingData && existingData.length > 0) {
      console.log("Duplicate detected, merging...", word);
      
      const existing = existingData[0];
      
      // Merge chs and en fields (avoid duplicates with /)
      const mergedChs = mergeSlashList(existing.chs, payload.chs);
      const mergedEn = mergeSlashList(existing.en, payload.en);
      const mergedR18 = Math.max(existing.is_r18 || 0, payload.is_r18 || 0);

      const { data: updated, error: updateError } = await supabase
        .from('lexeme_suggestions')
        .update({
          chs: mergedChs,
          en: mergedEn,
          is_r18: mergedR18,
        })
        .eq('id', existing.id)
        .select('id, word, is_r18, status, chs, en, source');

      if (updateError) {
        setCors(res);
        return res.status(500).json({ ok: false, error: updateError.message });
      }

      setCors(res);
      return res.status(200).json({ ok: true, merged: true, data: updated });
    }

    // Insert new entry if not duplicate
    const { data, error } = await supabase
      .from('lexeme_suggestions')
      .insert([payload])
      .select('id, word, is_r18, status, chs, en, source');

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

// Helper function to merge slash-separated values without duplicates
function mergeSlashList(current, incoming) {
  const next = (incoming ?? "").toString().trim();
  if (!next) return current;
  
  const items = (current ?? "")
    .toString()
    .split("/")
    .map((x) => x.trim())
    .filter(Boolean);
  
  if (!items.includes(next)) {
    items.push(next);
  }
  
  return items.length ? items.join("/") : null;
}

