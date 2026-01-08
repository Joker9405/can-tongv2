// api/t/search.js
const { buildCommon, insertRow, readJson, sha256Hex } = require('../_lib/supabase');

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

    const q = String(body.q || '').trim();
    const qLen = Number(body.q_len || q.length || 0);
    const lang = String(body.lang || 'unknown').slice(0, 16);

    // Privacy: store only prefix + length + salted hash (never store full query)
    const salt = process.env.TELEMETRY_SALT || '';
    const qPrefix = q.slice(0, 12);
    const qHash = q ? sha256Hex(`${salt}:${q}`) : '';

    const hitCount = Math.max(0, Math.min(99, Number(body.hit_count || 0)));
    const hitId = String(body.hit_id || '').slice(0, 40);

    const row = {
      cid: c.cid,
      ip_hash: c.ip_hash,
      device: c.device,
      path: String(body.path || '').slice(0, 180),

      q_prefix: qPrefix,
      q_len: qLen,
      q_hash: qHash,
      lang,

      hit_count: hitCount,
      hit_id: hitId,
      is_zero: hitCount === 0,
      country: c.country,
      region: c.region,
      city: c.city,
    };

    await insertRow('telemetry_search', row);
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true }));
  } catch (e) {
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: false }));
  }
};
