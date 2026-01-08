// api/_lib/supabase.js
// Minimal Supabase insert via PostgREST (no external deps).
const crypto = require('crypto');

function env(name, required = true) {
  const v = process.env[name];
  if (required && (!v || String(v).trim() === '')) {
    throw new Error(`Missing env: ${name}`);
  }
  return v;
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

function getSalt() {
  return env('TELEMETRY_SALT', true);
}

function ipFromReq(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) ? String(req.socket.remoteAddress) : '';
}

function uaFromReq(req) {
  return String(req.headers['user-agent'] || '');
}

function deviceFromUA(ua) {
  return /mobile|android|iphone|ipad|ipod/i.test(ua) ? 'mobile' : 'desktop';
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i < 0) return;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (!k) return;
    out[k] = decodeURIComponent(v || '');
  });
  return out;
}

function ensureClientId(req, res) {
  const cookies = parseCookies(req);
  let cid = cookies.cid;
  if (!cid || cid.length < 8) {
    // lightweight random id (not PII)
    cid = crypto.randomBytes(16).toString('hex');
    // 180 days
    res.setHeader('Set-Cookie', `cid=${encodeURIComponent(cid)}; Path=/; Max-Age=${180*24*60*60}; SameSite=Lax; Secure`);
  }
  return cid;
}

async function insertRow(table, row) {
  const url = env('SUPABASE_URL', true).replace(/\/+$/, '');
  const key = env('SUPABASE_SERVICE_ROLE_KEY', true);

  const endpoint = `${url}/rest/v1/${table}`;
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify([row]),
  });

  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`Supabase insert failed (${table}): ${r.status} ${t}`);
  }
}

function buildCommon(req, res) {
  const ua = uaFromReq(req);
  const cid = ensureClientId(req, res);
  const salt = getSalt();
  const ip = ipFromReq(req);

  return {
    cid,
    ua_trunc: ua.slice(0, 180),
    device: deviceFromUA(ua),
    ip_hash: ip ? sha256Hex(`${salt}:${ip}`) : '',
    // Vercel geo headers (best-effort; may be empty)
    country: String(req.headers['x-vercel-ip-country'] || ''),
    region: String(req.headers['x-vercel-ip-country-region'] || ''),
    city: String(req.headers['x-vercel-ip-city'] || ''),
  };
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;

  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

module.exports = {
  sha256Hex,
  buildCommon,
  insertRow,
  readJson,
};
