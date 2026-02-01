// api/translate.js
// Lexicon lookup (lexeme.csv + optional crossmap.csv). If miss, multi-LLM fallback (DeepSeek/OpenAI/Gemini).
// Fix: robust CSV parser (quotes/newlines/commas), flexible column mapping, safer term splitting.
// NEW: works even if crossmap.csv is missing (index from lexeme.csv). LLM fallback returns Cantonese + jyutping.

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

// ---------------- HTTP helper ----------------
function httpPostJson({ hostname, path: reqPath, headers = {}, bodyObj, timeoutMs = 20000 }) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(bodyObj || {});
    const options = {
      method: 'POST',
      hostname,
      path: reqPath,
      headers: Object.assign(
        {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        headers
      ),
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (d) => (data += d));
      res.on('end', () => {
        let json;
        try { json = JSON.parse(data || '{}'); } catch { json = null; }
        resolve({ status: res.statusCode || 0, json, raw: data });
      });
    });

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('request_timeout'));
    });
    req.write(body);
    req.end();
  });
}

// ---------------- Gemini ----------------
function geminiGenerate({ apiKey, model, promptText }) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: promptText }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 256 },
    });

    const options = {
      method: 'POST',
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'x-goog-api-key': apiKey,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (d) => (data += d));
      res.on('end', () => {
        try {
          const j = JSON.parse(data || '{}');
          if (res.statusCode && res.statusCode >= 400) {
            return reject(new Error(j.error?.message || `Gemini HTTP ${res.statusCode}`));
          }
          const text =
            j?.candidates?.[0]?.content?.parts?.map((p) => p?.text || '').join('')?.trim() || '';
          resolve(text);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function buildCantonesePrompt(input, lang) {
  const langHint =
    lang === 'en' ? '輸入係英文'
    : lang === 'chs' ? '輸入係中文'
    : lang === 'mix' ? '輸入係中英混合'
    : '輸入語言不確定（自動判斷）';

  return [
    '你係一個講地道口語粵語嘅助理（香港用字，繁體）。',
    '請把以下輸入改寫成地道、自然、口語嘅粵語正字（繁體），保留原意。',
    '硬性要求：',
    '1) 只輸出最終粵語一句/一段（不要解釋、不要加標題、不要列表）。',
    '2) 禁止輸出普通話書面語句式（例如：我們/你們/正在/沒有/怎麼/什麼/但是…）。',
    '3) 輸出必須係香港常用粵語用字（例如：我哋/你哋/佢哋/喺/冇/咗/緊/啫/啦/喎/咩/嘅…）。',
    `(${langHint})`,
    '',
    `輸入：${input}`,
    '',
    '輸出：',
  ].join('\n');
}

function getGeminiKey() {
  return (
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_AI_API_KEY ||
    ''
  ).trim();
}

async function geminiFallbackTranslate(query, lang = 'auto') {
  const apiKey = getGeminiKey();
  if (!apiKey) return { yue: null, provider: 'gemini', model: null, error: 'missing_key' };

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const promptText = buildCantonesePrompt(query, lang);

  try {
    const yue = await geminiGenerate({ apiKey, model, promptText });
    const out = String(yue || '').trim();
    return { yue: out || null, provider: 'gemini', model, error: out ? null : 'empty' };
  } catch (e) {
    return { yue: null, provider: 'gemini', model, error: String(e && e.message ? e.message : e) };
  }
}

// ---------------- OpenAI ----------------
async function openaiTranslate(query, lang = 'auto') {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) return { yue: null, provider: 'openai', model: null, error: 'missing_key' };

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const system = '你係粵語翻譯器。請用香港常用繁體口語粵語改寫輸入，保留原意。只輸出最終粵語，不要解釋，不要列表。';
  const user = buildCantonesePrompt(query, lang);

  const { status, json } = await httpPostJson({
    hostname: 'api.openai.com',
    path: '/v1/chat/completions',
    headers: { Authorization: `Bearer ${apiKey}` },
    bodyObj: {
      model,
      temperature: 0.3,
      max_tokens: 256,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    },
  });

  if (status >= 400) {
    const msg = json?.error?.message || `OpenAI HTTP ${status}`;
    return { yue: null, provider: 'openai', model, error: msg };
  }

  const text = String(json?.choices?.[0]?.message?.content || '').trim();
  return { yue: text || null, provider: 'openai', model, error: text ? null : 'empty' };
}

// ---------------- DeepSeek (OpenAI-compatible) ----------------
async function deepseekTranslate(query, lang = 'auto') {
  const apiKey = String(process.env.DEEPSEEK_API_KEY || '').trim();
  if (!apiKey) return { yue: null, provider: 'deepseek', model: null, error: 'missing_key' };

  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
  const system = '你係粵語翻譯器。請用香港常用繁體口語粵語改寫輸入，保留原意。只輸出最終粵語，不要解釋，不要列表。';
  const user = buildCantonesePrompt(query, lang);

  const { status, json } = await httpPostJson({
    hostname: 'api.deepseek.com',
    path: '/v1/chat/completions',
    headers: { Authorization: `Bearer ${apiKey}` },
    bodyObj: {
      model,
      temperature: 0.3,
      max_tokens: 256,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    },
  });

  if (status >= 400) {
    const msg = json?.error?.message || `DeepSeek HTTP ${status}`;
    return { yue: null, provider: 'deepseek', model, error: msg };
  }

  const text = String(json?.choices?.[0]?.message?.content || '').trim();
  return { yue: text || null, provider: 'deepseek', model, error: text ? null : 'empty' };
}

// ---------------- Cantonese quality gate ----------------
function looksLikeCantonese(text) {
  const s = String(text || '').trim();
  if (!s) return false;

  const must = ['唔', '冇', '喺', '咗', '緊', '嘅', '佢', '我哋', '你哋', '佢哋', '咩', '喎', '啫', '呀', '啦'];
  const bad = ['我們', '你們', '他們', '正在', '沒有', '怎麼', '什麼', '但是', '這裡', '那裡'];

  const hitMust = must.some((w) => s.includes(w));
  const hitBad = bad.some((w) => s.includes(w));
  return hitMust && !hitBad;
}

// ---------------- Jyutping generator ----------------
function toJyutpingSafe(zhh) {
  const s = String(zhh || '').trim();
  if (!s) return '';
  try {
    // prefer commonjs require
    const ToJyutping = require('to-jyutping');
    if (ToJyutping && typeof ToJyutping.getJyutpingText === 'function') {
      return String(ToJyutping.getJyutpingText(s) || '').trim();
    }
    // some builds export default
    if (ToJyutping && ToJyutping.default && typeof ToJyutping.default.getJyutpingText === 'function') {
      return String(ToJyutping.default.getJyutpingText(s) || '').trim();
    }
  } catch (_) {}
  return '';
}

// ---------------- Robust CSV parser ----------------
function parseCSV(text) {
  const rows = [];
  let curField = '';
  let curRow = [];
  let inQuotes = false;

  // Strip BOM
  if (text && text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      // Escaped quote: ""
      if (inQuotes && text[i + 1] === '"') {
        curField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && (ch === ',')) {
      curRow.push(curField);
      curField = '';
      continue;
    }

    if (!inQuotes && (ch === '\n')) {
      curRow.push(curField);
      rows.push(curRow);
      curRow = [];
      curField = '';
      continue;
    }

    if (!inQuotes && (ch === '\r')) {
      continue;
    }

    curField += ch;
  }

  // last field
  curRow.push(curField);
  rows.push(curRow);

  // remove trailing empty lines
  while (rows.length && rows[rows.length - 1].every((c) => String(c || '').trim() === '')) {
    rows.pop();
  }
  return rows;
}

function csvToObjects(csvText) {
  const rows = parseCSV(csvText || '');
  if (!rows.length) return [];
  const headers = rows[0].map((h) => String(h || '').trim());
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every((c) => String(c || '').trim() === '')) continue;
    const obj = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]] = String(row[i] ?? '').trim();
    }
    out.push(obj);
  }
  return out;
}

function normalizeKey(s) {
  return String(s || '').trim().toLowerCase();
}

function splitTerms(s) {
  const raw = String(s || '').trim();
  if (!raw) return [];
  // common separators: / ; ； | 、 \n
  return raw
    .split(/[/;；|、\n]+/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

function findFirstExisting(paths) {
  for (const p of paths) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}


// ---------------- telemetry (Supabase REST) ----------------

function getOrSetSid(req, res) {
  // Backward compatible:
  // - Prefer `cid` (shared with telemetry endpoints)
  // - Fall back to older `ct_sid` cookie if present
  const cookie = String(req.headers?.cookie || '');
  const mCid = cookie.match(/(?:^|;\s*)cid=([^;]+)/);
  const mOld = cookie.match(/(?:^|;\s*)ct_sid=([^;]+)/);
  let sid = mCid ? decodeURIComponent(mCid[1]) : (mOld ? decodeURIComponent(mOld[1]) : '');
  if (!sid) sid = (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));

  // 180 days (avoid permanent tracking)
  const maxAge = 180 * 24 * 60 * 60;
  const cookieStr = `cid=${encodeURIComponent(sid)}; Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure; HttpOnly`;
  const existing = res.getHeader('Set-Cookie');
  if (!existing) {
    res.setHeader('Set-Cookie', cookieStr);
  } else if (Array.isArray(existing)) {
    if (!existing.some(v => String(v).includes('cid='))) {
      res.setHeader('Set-Cookie', existing.concat([cookieStr]));
    }
  } else if (!String(existing).includes('cid=')) {
    res.setHeader('Set-Cookie', [String(existing), cookieStr]);
  }
  return sid;
}

function getClientMeta(req) {
  const ua = String(req.headers?.['user-agent'] || '');
  const lang = String(req.headers?.['accept-language'] || '').split(',')[0] || '';
  const country =
    String(req.headers?.['x-vercel-ip-country'] || req.headers?.['cf-ipcountry'] || '') || '';

  const region = String(req.headers?.['x-vercel-ip-country-region'] || '') || '';
  const city = String(req.headers?.['x-vercel-ip-city'] || '') || '';

  const ref = String(req.headers?.referer || req.headers?.referrer || '');
  let path = '';
  try { path = ref ? (new URL(ref)).pathname : ''; } catch { path = ''; }

  return { ua, lang, country, region, city, referrer: ref, path };
}

function getSupabaseEnv() {
  const url = (process.env.SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
  return { url, key };
}

async function supabaseInsert(table, rowObj, timeoutMs = 1500) {
  const { url, key } = getSupabaseEnv();
  if (!url || !key) return { ok: false, error: 'missing_supabase_env' };

  const u = new URL(url);
  const headers = {
    'content-type': 'application/json',
    'apikey': key,
    'authorization': `Bearer ${key}`,
    'prefer': 'return=minimal',
  };

  // PostgREST is happiest with an array for inserts.
  const bodyObj = Array.isArray(rowObj) ? rowObj : [rowObj];
  const p = httpPostJson({
    hostname: u.hostname,
    path: `${u.pathname.replace(/\/+$/, '')}/rest/v1/${table}`,
    headers,
    bodyObj,
    timeoutMs: Math.max(1000, timeoutMs),
  }).then((resp) => {
    // Supabase REST insert returns 201/204 typically, body may be empty
    const sc = resp?.status || 0;
    if (sc >= 200 && sc < 300) return { ok: true, status: sc };
    return { ok: false, status: sc, body: (resp?.raw || '') };
  }).catch((e) => ({ ok: false, error: e?.message || String(e) }));

  // IMPORTANT: In serverless, do NOT "fire-and-forget" network writes.
  // If we return before the request finishes, Vercel may freeze the function and the insert never happens.
  return await p;
}

async function logTelemetry({ sid, meta, q, hit, count, fromSrc }) {
  const pvRowA = {
    sid,
    path: meta.path || '',
    referrer: meta.referrer || '',
    lang: meta.lang || '',
    ua: meta.ua || '',
    country: meta.country || '',
  };

  const qNorm = normalizeKey(q);
  const searchRowA = {
    sid,
    q,
    q_norm: qNorm,
    hit: !!hit,
    result_count: Number.isFinite(count) ? count : 0,
    from_src: fromSrc || '',
    path: meta.path || '',
    country: meta.country || '',
  };

  // Alternate schema (older/newer iterations). Best-effort fallback if the primary insert fails.
  const pvRowB = {
    cid: sid,
    path: meta.path || '',
    ref: meta.referrer || '',
    ua: (meta.ua || '').slice(0, 180),
    device: /mobile|android|iphone|ipad|ipod/i.test(meta.ua || '') ? 'mobile' : 'desktop',
    ip_hash: '',
    country: meta.country || '',
    region: meta.region || '',
    city: meta.city || '',
  };
  const searchRowB = {
    cid: sid,
    ip_hash: '',
    device: /mobile|android|iphone|ipad|ipod/i.test(meta.ua || '') ? 'mobile' : 'desktop',
    path: meta.path || '',
    q_prefix: String(q || '').slice(0, 3),
    q_len: String(q || '').length,
    q_hash: sha256Hex(qNorm),
    lang: meta.lang || '',
    hit_count: Number.isFinite(count) ? count : 0,
    hit_id: '',
    is_zero: !hit,
    country: meta.country || '',
    region: meta.region || '',
    city: meta.city || '',
  };

  let pv = await supabaseInsert('telemetry_pv', pvRowA);
  if (!pv.ok && (pv.body || '').includes('column') ) {
    pv = await supabaseInsert('telemetry_pv', pvRowB);
  }

  let search = await supabaseInsert('telemetry_search', searchRowA);
  if (!search.ok && (search.body || '').includes('column')) {
    search = await supabaseInsert('telemetry_search', searchRowB);
  }
  return { pv, search };
}

// ---------------- CSV lookup ----------------
let CACHE = null;

function buildDataSafe() {
  if (CACHE) return CACHE;

  const cwd = process.cwd();
  const dataDir = path.join(cwd, 'data');

  const lexemePath = findFirstExisting([
    path.join(dataDir, 'lexeme.csv'),
    path.join(cwd, 'lexeme.csv'),
    path.join(cwd, 'public', 'lexeme.csv'),
  ]);

  const crossmapPath = findFirstExisting([
    path.join(dataDir, 'crossmap.csv'),
    path.join(cwd, 'crossmap.csv'),
    path.join(cwd, 'public', 'crossmap.csv'),
  ]);

  const examplesPath = findFirstExisting([
    path.join(dataDir, 'examples.csv'),
    path.join(cwd, 'examples.csv'),
    path.join(cwd, 'public', 'examples.csv'),
  ]);

  const lexemeRows = lexemePath ? csvToObjects(fs.readFileSync(lexemePath, 'utf8')) : [];
  const crossmapRows = crossmapPath ? csvToObjects(fs.readFileSync(crossmapPath, 'utf8')) : [];
  const exampleRows = examplesPath ? csvToObjects(fs.readFileSync(examplesPath, 'utf8')) : [];

  // Build lexeme map
  const lexemeById = new Map();
  for (const row of lexemeRows) {
    const id = (row.id || row.lexeme_id || row.lexemeId || '').trim();
    if (!id) continue;
    lexemeById.set(id, row);
  }

  // Examples map
  const examplesByLexemeId = {};
  for (const e of exampleRows) {
    const lid = (e.lexeme_id || e.target_id || e.lexemeId || e.lexeme || '').trim();
    if (!lid) continue;
    if (!examplesByLexemeId[lid]) examplesByLexemeId[lid] = [];
    examplesByLexemeId[lid].push(e);
  }

  // Index map: term -> Set<lexemeId>
  const termIndex = new Map();

  if (crossmapRows.length) {
    // Use crossmap if present
    const termCols = ['term', 'terms', 'key_text', 'key', 'query', 'chs', 'en', 'text']; // try these
    const idCols = ['target_id', 'targetId', 'lexeme_id', 'lexemeId', 'to_id', 'id'];

    for (const row of crossmapRows) {
      // find id
      let targetId = '';
      for (const c of idCols) {
        if (row[c]) { targetId = String(row[c]).trim(); break; }
      }
      if (!targetId) continue;

      // collect terms
      let collected = [];
      for (const c of termCols) {
        if (row[c]) collected = collected.concat(splitTerms(row[c]));
      }
      // fallback: if none, try any column that looks like a term list
      if (!collected.length) {
        for (const [k, v] of Object.entries(row)) {
          if (!v) continue;
          const kk = k.toLowerCase();
          if (kk.includes('term') || kk.includes('key')) {
            collected = collected.concat(splitTerms(v));
          }
        }
      }
      if (!collected.length) continue;

      for (const t of collected) {
        const key = normalizeKey(t);
        if (!key) continue;
        if (!termIndex.has(key)) termIndex.set(key, new Set());
        termIndex.get(key).add(targetId);
      }
    }
  } else {
    // No crossmap: index directly from lexeme columns (MVP-friendly)
    const cols = ['zhh', 'alias_zhh', 'alias_zhh_r18', 'chs', 'en'];
    for (const row of lexemeRows) {
      const id = (row.id || row.lexeme_id || row.lexemeId || '').trim();
      if (!id) continue;

      let collected = [];
      for (const c of cols) {
        if (row[c]) collected = collected.concat(splitTerms(row[c]));
      }
      // Also index zhh_pron as query if user types jyutping
      if (row.zhh_pron) collected = collected.concat(splitTerms(row.zhh_pron));

      for (const t of collected) {
        const key = normalizeKey(t);
        if (!key) continue;
        if (!termIndex.has(key)) termIndex.set(key, new Set());
        termIndex.get(key).add(id);
      }
    }
  }

  CACHE = { termIndex, lexemeById, examplesByLexemeId, crossmapRows, hasCrossmap: !!crossmapRows.length, hasLexeme: !!lexemeRows.length };
  return CACHE;
}

function lookupLexemeItemsByQuery(query) {
  const { termIndex, lexemeById, examplesByLexemeId } = buildDataSafe();
  const key = normalizeKey(query);
  if (!key) return [];

  const idSet = termIndex.get(key);
  if (idSet && idSet.size) {
    const out = [];
    for (const id of idSet) {
      const lexeme = lexemeById.get(id);
      if (!lexeme) continue;
      const item = Object.assign({}, lexeme);
      item.examples = examplesByLexemeId[id] || [];
      out.push(item);
    }
    if (out.length) return out;
  }
  return [];
}

// ---------------- helpers ----------------
function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data.toString('utf8'))); }
      catch (err) { reject(err); }
    });
    req.on('error', (err) => reject(err));
  });
}

function getQueryFromReq(req, body) {
  const qFromQuery =
    req.query?.q || req.query?.query || req.query?.term || req.query?.keyword || req.query?.text;
  const qFromBody = body?.q || body?.query || body?.term || body?.keyword || body?.input || body?.text;
  return String(qFromQuery || qFromBody || '').trim();
}

function getLangFromReq(req, body) {
  const l = req.query?.lang || req.query?.language || body?.lang || body?.language || 'auto';
  return String(l || 'auto');
}

// ---------------- Multi-LLM fallback ----------------
function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

async function multiLLMFallback(query, lang) {
  // Build provider pool based on available keys
  const pool = [];
  if (String(process.env.DEEPSEEK_API_KEY || '').trim()) pool.push('deepseek');
  if (String(process.env.OPENAI_API_KEY || '').trim()) pool.push('openai');
  if (getGeminiKey()) pool.push('gemini');

  if (!pool.length) {
    return { yue: null, jyutping: '', provider: null, model: null, error: 'no_provider_key' };
  }

  // pseudo-random start per query (stable, but feels random across different queries)
  const start = hash32(query) % pool.length;

  const tried = [];
  for (let k = 0; k < pool.length; k++) {
    const provider = pool[(start + k) % pool.length];
    tried.push(provider);

    let r;
    if (provider === 'deepseek') r = await deepseekTranslate(query, lang);
    else if (provider === 'openai') r = await openaiTranslate(query, lang);
    else r = await geminiFallbackTranslate(query, lang);

    const yue = String(r?.yue || '').trim();
    if (!yue) continue;
    if (!looksLikeCantonese(yue)) continue;

    const jyutping = toJyutpingSafe(yue);
    return { yue, jyutping, provider: r.provider, model: r.model, error: null, tried };
  }

  return { yue: null, jyutping: '', provider: tried[tried.length - 1] || null, model: null, error: 'all_failed', tried };
}

// ---------------- handler ----------------
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  const method = req.method || 'GET';
  if (method !== 'POST' && method !== 'GET') {
    res.statusCode = 405;
    res.end(JSON.stringify({ ok: false, error: 'Method Not Allowed' }));
    return;
  }

  try {
    const body = method === 'POST' ? await readJsonBody(req) : {};
    const query = getQueryFromReq(req, body);
    const lang = getLangFromReq(req, body);
    const u = new URL(String(req.url || '/'), 'http://localhost');
    const debug = u.searchParams.get('debug') === '1';
    const sid = getOrSetSid(req, res);
    const meta = getClientMeta(req);

    if (!query) {
      res.statusCode = 200;
      res.end(JSON.stringify({ ok: true, from: 'empty', query: '', count: 0, items: [] }));
      return;
    }

    const items = lookupLexemeItemsByQuery(query);

    if (items && items.length > 0) {
      const t = await logTelemetry({ sid, meta, q: query, hit: true, count: items.length, fromSrc: 'lexeme-csv' });
      const payload = { ok: true, from: 'lexeme-csv', query, count: items.length, items };
      if (debug) payload._telemetry = t;
      res.statusCode = 200;
      res.end(JSON.stringify(payload));
      return;
    }

    // Miss -> multi-LLM fallback (DeepSeek/OpenAI/Gemini)
    const fb = await multiLLMFallback(query, lang);
    const yue = fb?.yue ? String(fb.yue).trim() : '';
    const jyutping = fb?.jyutping ? String(fb.jyutping).trim() : '';

    const item = {
      id: 'CT-FALLBACK',
      zhh: yue || '（未收錄：你可以提交更地道嘅講法）',
      zhh_pron: jyutping,
      is_r18: 0,
      alias_zhh: '',
      alias_zhh_r18: '',
      chs: '',
      en: '',
      owner_tag: fb?.provider ? `llm:${fb.provider}` : 'llm',
      register: 'colloquial',
      intent: 'fallback',
      note_chs: '',
      note_en: '',
      variants_chs: '',
      variants_en: '',
      examples: [],
      _fallback_error: fb?.error || null,
      _fallback_tried: fb?.tried || [],
    };

    const fromSrc = `llm:${(fb && fb.provider) ? fb.provider : 'unknown'}`;
    const t = await logTelemetry({ sid, meta, q: query, hit: false, count: 1, fromSrc });
    const payload = {
      ok: true,
      from: 'llm-fallback',
      provider: fb?.provider || null,
      model: fb?.model || null,
      query,
      count: 1,
      items: [item],
    };
    if (debug) payload._telemetry = t;
    res.statusCode = 200;
    res.end(JSON.stringify(payload));
  } catch (err) {
    res.statusCode = 500;
    res.end(JSON.stringify({
      ok: false,
      error: 'Internal Server Error',
      detail: err && err.message ? err.message : String(err),
    }));
  }
};
