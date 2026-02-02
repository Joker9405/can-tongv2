// api/telemetry/search.js
// Robust search logger for Vercel Serverless (non-Next) + Supabase

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

function normalizeQuery(q) {
  return safeStr(q).trim();
}

function coercePath(v) {
  let s = safeStr(v).trim();
  if (!s || s.toUpperCase() === 'EMPTY') return '/';
  try {
    if (s.startsWith('http://') || s.startsWith('https://')) {
      const u = new URL(s);
      s = `${u.pathname}${u.search}${u.hash}`;
    }
  } catch (_) {
    // ignore
  }
  if (!s.startsWith('/')) s = `/${s}`;
  return s;
}

async function readRawBody(req) {
  return await new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk.toString('utf8');
    });
    req.on('end', () => resolve(data));
    req.on('error', () => resolve(''));
  });
}

async function getJsonBody(req) {
  try {
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      return req.body;
    }
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body);
      } catch (_) {
        return {};
      }
    }
    if (Buffer.isBuffer(req.body)) {
      try {
        return JSON.parse(req.body.toString('utf8'));
      } catch (_) {
        return {};
      }
    }

    const raw = await readRawBody(req);
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch (_) {
      return {};
    }
  } catch (_) {
    return {};
  }
}

function inferFromHeaders(req) {
  const referer = safeStr(req.headers['referer'] || req.headers['referrer'] || '');
  let path = '';
  if (referer) {
    try {
      const u = new URL(referer);
      path = `${u.pathname}${u.search}${u.hash}`;
    } catch (_) {
      // ignore
    }
  }
  return { referer, path };
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) {
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

async function insertWithSchemaFallback(supabase, table, payload, allowKeys) {
  let { error } = await supabase.from(table).insert([payload]);
  if (!error) return null;

  const msg = safeStr(error.message).toLowerCase();
  if (msg.includes('column') && msg.includes('does not exist')) {
    const minimal = pick(payload, allowKeys);
    ({ error } = await supabase.from(table).insert([minimal]));
    if (!error) return null;
  }

  return error;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return respond(res, 405, { ok: false, error: 'Method Not Allowed' });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return respond(res, 500, { ok: false, error: 'Missing Supabase env vars' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const body = await getJsonBody(req);
    const inferred = inferFromHeaders(req);

    const sid = safeStr(body.sid || '');
    const q = normalizeQuery(body.q || body.query || body.text || body.input || '');
    const q_norm = normalizeQuery(body.q_norm || body.qNorm || body.qn || q);

    const result_count_raw = body.result_count ?? body.resultCount ?? body.count ?? 0;
    const result_count = Number.isFinite(Number(result_count_raw)) ? Number(result_count_raw) : 0;

    // hit: if explicitly provided, use it; else infer from result_count
    let hit = body.hit;
    if (hit === undefined || hit === null) {
      hit = result_count > 0;
    }

    const from_src = safeStr(body.from_src || body.fromSrc || body.from || body.src || 'ui');
    const path = coercePath(body.path || inferred.path);

    // Optional context (inserted only if your table has these columns)
    const referrer = safeStr(body.referrer || body.referer || inferred.referer || '');
    const lang = safeStr(body.lang || req.headers['accept-language'] || '');
    const ua = safeStr(body.ua || req.headers['user-agent'] || '');
    const country = safeStr(body.country || req.headers['x-vercel-ip-country'] || req.headers['cf-ipcountry'] || '');

    const payload = {
      sid: sid || null,
      q: q || null,
      q_norm: q_norm || null,
      hit: !!hit,
      result_count,
      from_src: from_src || null,
      path,
      referrer: referrer || null,
      lang: lang || null,
      ua: ua || null,
      country: country || null,
    };

    // Try full payload; if schema differs, fallback to minimal known columns.
    const error = await insertWithSchemaFallback(
      supabase,
      'telemetry_search',
      payload,
      ['sid', 'q', 'q_norm', 'hit', 'result_count', 'from_src', 'path']
    );

    if (error) {
      return respond(res, 500, { ok: false, error: error.message || 'insert failed' });
    }

    return respond(res, 200, { ok: true });
  } catch (err) {
    return respond(res, 500, { ok: false, error: safeStr(err?.message || err) });
  }
}
