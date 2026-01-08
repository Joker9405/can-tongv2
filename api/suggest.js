// api/suggest.js
const { buildCommon, insertRow, readJson, sha256Hex } = require('./_lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end(JSON.stringify({ ok: false, error: 'Method Not Allowed' }));
    return;
  }

  try {
    const body = await readJson(req);
    const c = buildCommon(req, res);

    // Only accept headword and lang
    const headword = String(body.headword || '').trim();
    const lang = String(body.lang || 'unknown').slice(0, 16);

    if (!headword) {
      res.statusCode = 200;
      res.end(JSON.stringify({ ok: false, error: 'empty' }));
      return;
    }

    const salt = process.env.TELEMETRY_SALT || '';
    const headwordPrefix = headword.slice(0, 12);
    const headwordHash = headword ? sha256Hex(`${salt}:${headword}`) : '';

    const row = {
      cid: c.cid,
      ip_hash: c.ip_hash,
      device: c.device,
      path: String(body.path || '').slice(0, 180),

      headword: headword,         // Store headword
      lang: lang,                 // Store language (lang)
      headword_prefix: headwordPrefix, // Store prefix of headword
      headword_hash: headwordHash, // Store hash for privacy
      status: 'pending',         // Default status as 'pending'
      country: c.country,
      region: c.region,
      city: c.city,
    };

    // Insert the suggestion into the user_contrib table
    await insertRow('user_contrib', row);
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true }));
  } catch (e) {
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: false }));
  }
};
