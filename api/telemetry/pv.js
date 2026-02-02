// api/telemetry/pv.js
// Robust PV logger for Vercel Serverless (non-Next) + Supabase

import { createClient } from '@supabase/supabase-js';

function respond(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function safeStr(v) {
  if (v === null || v === undefined) return '';
  return String(v);
}

function coercePath(v) {
  let s = safeStr(v).trim();
  if (!s || s.toUpperCase() === 'EMPTY') return '/';

  // If client accidentally sends a full URL, normalize to pathname
  try {
    if (s.startsWith('http://') || s.startsWith('https://')) {
      const u = new URL(s);
      s = `${u.pathname}${u.search}${u.hash}`;
    }
  } catch {
    // ignore
  }

  if (!s.startsWith('/')) s = `/${s}`;
  return s;
}

async function readRawBody(req) {
  return await new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk?.toString ? chunk.toString('utf8') : String(chunk);
    });
    req.on('end', () => resolve(data));
    req.on('error', () => resolve(''));
  });
}

async function getJsonBody(req) {
  // Vercel runtime differs by project type; be defensive.
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;

  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  if (Buffer.isBuffer(req.body)) {
    try {
      return JSON.parse(req.body.toString('utf8'));
    } catch {
      return {};
    }
  }

  const raw = await readRawBody(req);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function inferFromHeaders(req) {
  const referer = safeStr(req.headers?.referer || req.headers?.referrer || '');
  let path = '';
  if (referer) {
    try {
      const u = new URL(referer);
      path = `${u.pathname}${u.search}${u.hash}`;
    } catch {
      // ignore
    }
  }
  return { referer, path };
}

function stripPayload(payload, allowKeys) {
  const out = {};
  for (const k of allowKeys) {
    if (payload[k] !== undefined) out[k] = payload[k];
  }
  return out;
}

async function insertWithSchemaFallback(supabase, table, payload, allowKeys) {
  let { error } = await supabase.from(table).insert([payload]);
  if (!error) return null;

  const msg = safeStr(error.message).toLowerCase();
  // When schema differs, try inserting a minimal subset (avoid “column does not exist”).
  if (msg.includes('column') && msg.includes('does not exist')) {
    const minimal = stripPayload(payload, allowKeys);
    ({ error } = await supabase.from(table).insert([minimal]));
    if (!error) return null;
  }

  return error;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return respond(res, 405, { ok: false, error: 'Method Not Allowed' });

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return respond(res, 500, { ok: false, error: 'Missing Supabase env vars' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const body = await getJsonBody(req);
    const inferred = inferFromHeaders(req);

    const sid = safeStr(body.sid || '');
    const path = coercePath(body.path || inferred.path);

    // Prefer client-provided referrer; fallback to HTTP Referer
    const referrer = safeStr(body.referrer || body.referer || inferred.referer || '');

    const lang = safeStr(body.lang || req.headers['accept-language'] || '');
    const ua = safeStr(body.ua || req.headers['user-agent'] || '');
    const country = safeStr(body.country || req.headers['x-vercel-ip-country'] || req.headers['cf-ipcountry'] || '');

    const payload = {
      sid: sid || null,
      path,
      referrer: referrer || null,
      lang: lang || null,
      ua: ua || null,
      country: country || null,
    };

    const error = await insertWithSchemaFallback(
      supabase,
      'telemetry_pv',
      payload,
      ['sid', 'path', 'referrer', 'lang', 'ua', 'country']
    );

    if (error) {
      return respond(res, 500, { ok: false, error: error.message || 'insert failed' });
    }

    return respond(res, 200, { ok: true });
  } catch (err) {
    return respond(res, 500, { ok: false, error: safeStr(err?.message || err) });
  }
}
