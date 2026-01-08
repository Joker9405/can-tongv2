// api/t/pv.js
const { buildCommon, insertRow, readJson } = require('../_lib/supabase');

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

    const row = {
      cid: c.cid,
      ip_hash: c.ip_hash,
      ua: c.ua_trunc,
      device: c.device,
      path: String(body.path || req.url || '').slice(0, 180),
      ref: String(body.ref || '').slice(0, 300),
      country: c.country,
      region: c.region,
      city: c.city,
    };

    await insertRow('telemetry_pv', row);
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true }));
  } catch (e) {
    res.statusCode = 200;
    // do not break UX if telemetry fails
    res.end(JSON.stringify({ ok: false }));
  }
};
