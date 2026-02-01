// api/translate.js
// CanTong v2: CSV lexicon lookup + optional Supabase-approved suggestions + multi-LLM fallback.
// Also: server-side telemetry logging (telemetry_pv + telemetry_search) via Supabase REST API.
// Works even if crossmap.csv is missing; searches directly in lexeme.csv.
// Compatible query params: q / query / text / input / term / keyword (GET) and same keys in JSON body (POST).

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

// ----------------- small utils -----------------
function nowIso() { return new Date().toISOString(); }

function trimSlash(s) { return String(s || '').replace(/\/+$/, ''); }

function normalizeKey(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function splitTerms(s) {
  const raw = String(s || '').trim();
  if (!raw) return [];
  return raw
    .split(/[/;；|、\n\r\t]+/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

function safeJsonParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function getHeader(req, name) {
  const v = req.headers?.[name] || req.headers?.[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

function parseUrl(req) {
  // Vercel provides req.url as path+query. We add a base for URL parsing.
  const u = String(req.url || '/');
  try { return new URL(u, 'http://localhost'); } catch { return new URL('http://localhost/'); }
}

function getOrSetSid(req, res) {
  const cookie = String(getHeader(req, 'cookie') || '');
  const m = cookie.match(/(?:^|;\s*)ct_sid=([^;]+)/);
  let sid = m ? decodeURIComponent(m[1]) : '';
  if (!sid) {
    // stable but random
    sid = (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));
    // 1 year
    res.setHeader('Set-Cookie', `ct_sid=${encodeURIComponent(sid)}; Path=/; Max-Age=31536000; SameSite=Lax`);
  }
  return sid;
}

function parseRefPath(req) {
  const ref = String(getHeader(req, 'referer') || getHeader(req, 'referrer') || '');
  if (!ref) return '';
  try { return new URL(ref).pathname || ''; } catch { return ''; }
}

function getCountry(req) {
  // Vercel header
  return String(getHeader(req, 'x-vercel-ip-country') || getHeader(req, 'x-vercel-ip-country-region') || '').trim();
}

function getLang(req) {
  const al = String(getHeader(req, 'accept-language') || '');
  // keep short
  return al ? al.split(',')[0].trim() : '';
}

// ----------------- HTTP helper -----------------
function httpPostJson({ hostname, reqPath, headers = {}, bodyObj, timeoutMs = 20000 }) {
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
        resolve({ status: res.statusCode || 0, json: safeJsonParse(data || '{}'), raw: data });
      });
    });

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('request_timeout')));
    req.write(body);
    req.end();
  });
}

// ----------------- Supabase REST insert (telemetry) -----------------
async function supabaseInsert(table, row) {
  const urlBase = trimSlash(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '');
  const key =
    String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();

  if (!urlBase || !key) return { ok: false, error: 'missing_supabase_env' };

  const { status, json, raw } = await httpPostJson({
    hostname: urlBase.replace(/^https?:\/\//, '').split('/')[0],
    reqPath: urlBase.replace(/^https?:\/\//, '').includes('/')
      ? ('/' + urlBase.replace(/^https?:\/\//, '').split('/').slice(1).join('/') + `/rest/v1/${encodeURIComponent(table)}`)
      : (`/rest/v1/${encodeURIComponent(table)}`),
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: 'return=minimal',
    },
    bodyObj: row,
    timeoutMs: 8000,
  });

  if (status >= 400) return { ok: false, error: `supabase_http_${status}`, detail: json?.message || raw || '' };
  return { ok: true };
}

// ----------------- CSV parsing (robust enough for quoted commas/newlines) -----------------
function parseCSV(csvText) {
  const text = String(csvText || '');
  const rows = [];
  let curRow = [];
  let curField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { curField += '"'; i++; continue; }
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && ch === ',') {
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

    if (!inQuotes && ch === '\r') continue;
    curField += ch;
  }

  curRow.push(curField);
  rows.push(curRow);

  while (rows.length && rows[rows.length - 1].every((c) => String(c || '').trim() === '')) rows.pop();
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
    for (let i = 0; i < headers.length; i++) obj[headers[i]] = String(row[i] ?? '').trim();
    out.push(obj);
  }
  return out;
}

// ----------------- data loading + indexing -----------------
let CACHE = null;

function findFile(filename) {
  const candidates = [
    path.join(process.cwd(), 'data', filename),
    path.join(process.cwd(), 'public', filename),
    path.join(process.cwd(), filename),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return '';
}

function buildData() {
  if (CACHE) return CACHE;

  const lexemePath = findFile('lexeme.csv');
  const crossmapPath = findFile('crossmap.csv'); // optional
  const examplesPath = findFile('examples.csv'); // optional

  if (!lexemePath) throw new Error('未找到 lexeme.csv（请放在 /data 或 /public 或仓库根目录）');

  const lexemeRows = csvToObjects(fs.readFileSync(lexemePath, 'utf8'));
  const crossmapRows = crossmapPath ? csvToObjects(fs.readFileSync(crossmapPath, 'utf8')) : [];
  const exampleRows = examplesPath ? csvToObjects(fs.readFileSync(examplesPath, 'utf8')) : [];

  const lexemeById = new Map();
  for (const row of lexemeRows) {
    const id = (row.id || row.lexeme_id || row.lexemeId || '').trim();
    if (!id) continue;
    lexemeById.set(id, row);
  }

  const examplesByLexemeId = {};
  for (const e of exampleRows) {
    const lid = (e.lexeme_id || e.target_id || e.lexemeId || e.lexeme || '').trim();
    if (!lid) continue;
    if (!examplesByLexemeId[lid]) examplesByLexemeId[lid] = [];
    examplesByLexemeId[lid].push(e);
  }

  // term -> Set<lexemeId>
  const termIndex = new Map();

  function addToIndex(term, id) {
    const k = normalizeKey(term);
    if (!k || !id) return;
    if (!termIndex.has(k)) termIndex.set(k, new Set());
    termIndex.get(k).add(id);
  }

  // If crossmap exists, index it (term->id)
  if (crossmapRows.length) {
    const termCols = ['term', 'terms', 'key_text', 'key', 'query', 'chs', 'en', 'text'];
    const idCols = ['target_id', 'targetId', 'lexeme_id', 'lexemeId', 'to_id', 'id'];

    for (const row of crossmapRows) {
      let targetId = '';
      for (const c of idCols) if (row[c]) { targetId = String(row[c]).trim(); break; }
      if (!targetId) continue;

      let collected = [];
      for (const c of termCols) if (row[c]) collected = collected.concat(splitTerms(row[c]));
      if (!collected.length) continue;

      for (const t of collected) addToIndex(t, targetId);
    }
  }

  // Always index from lexeme itself (supports your “只有一个 CSV” 运行模式)
  const lexemeTermCols = [
    'zhh', 'chs', 'en',
    'alias_zhh', 'alias_zhh_r18',
    'variants_chs', 'variants_en',
    'note_chs', 'note_en',
  ];

  for (const row of lexemeRows) {
    const id = (row.id || row.lexeme_id || row.lexemeId || '').trim();
    if (!id) continue;
    for (const col of lexemeTermCols) {
      if (!row[col]) continue;
      const terms = splitTerms(row[col]);
      if (!terms.length) addToIndex(row[col], id);
      else for (const t of terms) addToIndex(t, id);
    }
  }

  CACHE = { termIndex, lexemeById, examplesByLexemeId };
  return CACHE;
}

function lookupLexemeItemsByQuery(query) {
  const { termIndex, lexemeById, examplesByLexemeId } = buildData();
  const key = normalizeKey(query);
  if (!key) return [];

  const idSet = termIndex.get(key);
  if (!idSet || !idSet.size) return [];

  const out = [];
  for (const id of idSet) {
    const lexeme = lexemeById.get(id);
    if (!lexeme) continue;
    const item = Object.assign({}, lexeme);
    item.examples = examplesByLexemeId[id] || [];
    out.push(item);
  }
  return out;
}

// ----------------- LLM fallback (DeepSeek / OpenAI / Gemini) -----------------
function buildCantonesePrompt(input, langHint = '') {
  const langLine = langHint ? `（輸入語言：${langHint}）` : '（輸入語言：自動判斷）';
  return [
    '你係一個講地道口語粵語嘅助理（香港用字，繁體）。',
    '請把以下輸入改寫成地道、自然、口語嘅粵語正字（繁體），保留原意。',
    '硬性要求：',
    '1) 只輸出最終粵語一句/一段（不要解釋、不要加標題、不要列表）。',
    '2) 禁止輸出普通話書面語句式（例如：我們/你們/正在/沒有/怎麼/什麼/但是…）。',
    '3) 輸出必須係香港常用粵語用字（例如：我哋/你哋/佢哋/喺/冇/咗/緊/啫/啦/喎/咩/嘅…）。',
    langLine,
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
        const j = safeJsonParse(data || '{}') || {};
        if (res.statusCode && res.statusCode >= 400) return reject(new Error(j.error?.message || `Gemini HTTP ${res.statusCode}`));
        const text = j?.candidates?.[0]?.content?.parts?.map((p) => p?.text || '').join('')?.trim() || '';
        resolve(text);
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function geminiTranslate(query, lang = 'auto') {
  const apiKey = getGeminiKey();
  if (!apiKey) return { yue: null, provider: 'gemini', model: null, error: 'missing_key' };

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const promptText = buildCantonesePrompt(query, lang === 'auto' ? '' : lang);

  try {
    const yue = await geminiGenerate({ apiKey, model, promptText });
    const out = String(yue || '').trim();
    return { yue: out || null, provider: 'gemini', model, error: out ? null : 'empty' };
  } catch (e) {
    return { yue: null, provider: 'gemini', model, error: String(e?.message || e) };
  }
}

async function openaiTranslate(query, lang = 'auto') {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) return { yue: null, provider: 'openai', model: null, error: 'missing_key' };

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const system = '你係粵語翻譯器。請用香港常用繁體口語粵語改寫輸入，保留原意。只輸出最終粵語，不要解釋，不要列表。';
  const user = buildCantonesePrompt(query, lang === 'auto' ? '' : lang);

  const { status, json } = await httpPostJson({
    hostname: 'api.openai.com',
    reqPath: '/v1/chat/completions',
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

  if (status >= 400) return { yue: null, provider: 'openai', model, error: json?.error?.message || `OpenAI HTTP ${status}` };
  const text = String(json?.choices?.[0]?.message?.content || '').trim();
  return { yue: text || null, provider: 'openai', model, error: text ? null : 'empty' };
}

async function deepseekTranslate(query, lang = 'auto') {
  const apiKey = String(process.env.DEEPSEEK_API_KEY || '').trim();
  if (!apiKey) return { yue: null, provider: 'deepseek', model: null, error: 'missing_key' };

  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
  const system = '你係粵語翻譯器。請用香港常用繁體口語粵語改寫輸入，保留原意。只輸出最終粵語，不要解釋，不要列表。';
  const user = buildCantonesePrompt(query, lang === 'auto' ? '' : lang);

  const { status, json } = await httpPostJson({
    hostname: 'api.deepseek.com',
    reqPath: '/v1/chat/completions',
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

  if (status >= 400) return { yue: null, provider: 'deepseek', model, error: json?.error?.message || `DeepSeek HTTP ${status}` };
  const text = String(json?.choices?.[0]?.message?.content || '').trim();
  return { yue: text || null, provider: 'deepseek', model, error: text ? null : 'empty' };
}

function pickProviderOrder(query) {
  // deterministic shuffle based on query hash
  const h = crypto.createHash('sha256').update(String(query || '')).digest();
  const seed = h.readUInt32BE(0);
  const providers = ['deepseek', 'openai', 'gemini'];
  // Fisher–Yates with seeded RNG
  let x = seed >>> 0;
  function rnd() { x = (x * 1664525 + 1013904223) >>> 0; return x / 0xffffffff; }
  for (let i = providers.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [providers[i], providers[j]] = [providers[j], providers[i]];
  }
  return providers;
}

async function llmFallback(query, lang) {
  const order = pickProviderOrder(query);
  let last = null;
  for (const p of order) {
    if (p === 'deepseek') last = await deepseekTranslate(query, lang);
    else if (p === 'openai') last = await openaiTranslate(query, lang);
    else last = await geminiTranslate(query, lang);

    if (last && last.yue) return last;
  }
  return last || { yue: null, provider: 'none', model: null, error: 'no_provider' };
}

// ----------------- jyutping helper (optional) -----------------
async function toJyutpingSafe(text) {
  const s = String(text || '').trim();
  if (!s) return '';
  try {
    const mod = await import('to-jyutping');
    const fn = mod?.toJyutping || mod?.default || null;
    if (typeof fn !== 'function') return '';
    return String(fn(s) || '').trim();
  } catch {
    return '';
  }
}

// ----------------- request parsing -----------------
function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(safeJsonParse(data || '{}') || {}));
    req.on('error', (err) => reject(err));
  });
}

function getQueryFromReq(req, body) {
  const u = parseUrl(req);
  const q =
    u.searchParams.get('q') ||
    u.searchParams.get('query') ||
    u.searchParams.get('text') ||
    u.searchParams.get('input') ||
    u.searchParams.get('term') ||
    u.searchParams.get('keyword') ||
    body?.q ||
    body?.query ||
    body?.text ||
    body?.input ||
    body?.term ||
    body?.keyword ||
    '';
  return String(q || '').trim();
}

function getLangFromReq(req, body) {
  const u = parseUrl(req);
  const l = u.searchParams.get('lang') || u.searchParams.get('language') || body?.lang || body?.language || 'auto';
  return String(l || 'auto');
}

// ----------------- handler -----------------
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  const method = req.method || 'GET';
  if (method !== 'POST' && method !== 'GET') {
    res.statusCode = 405;
    res.end(JSON.stringify({ ok: false, error: 'Method Not Allowed' }));
    return;
  }

  const sid = getOrSetSid(req, res);
  const pagePath = parseRefPath(req);
  const country = getCountry(req);
  const langHdr = getLang(req);
  const ua = String(getHeader(req, 'user-agent') || '');

  // record PV (best-effort, never break translate)
  supabaseInsert('telemetry_pv', {
    sid,
    path: pagePath || '',
    referrer: String(getHeader(req, 'referer') || getHeader(req, 'referrer') || ''),
    lang: langHdr,
    ua,
    country,
  }).catch(() => {});

  try {
    const body = method === 'POST' ? await readJsonBody(req) : {};
    const query = getQueryFromReq(req, body);
    const lang = getLangFromReq(req, body);

    if (!query) {
      res.statusCode = 200;
      res.end(JSON.stringify({ ok: true, from: 'empty', query: '', count: 0, items: [] }));
      return;
    }

    // 1) CSV exact match
    let items = [];
    try { items = lookupLexemeItemsByQuery(query); } catch (e) {
      // If lexeme.csv path wrong, still allow LLM fallback (so product keeps working)
      items = [];
    }

    if (items && items.length > 0) {
      // telemetry search
      supabaseInsert('telemetry_search', {
        sid,
        q: query,
        q_norm: normalizeKey(query),
        hit: true,
        result_count: items.length,
        from_src: 'csv',
        path: pagePath || '',
        country,
      }).catch(() => {});

      res.statusCode = 200;
      res.end(JSON.stringify({ ok: true, from: 'lexeme-exact', query, count: items.length, items }));
      return;
    }

    // 2) Miss -> LLM fallback (multi-provider)
    const fb = await llmFallback(query, lang);
    const yue = fb?.yue ? String(fb.yue).trim() : '';

    const pron = yue ? await toJyutpingSafe(yue) : '';

    const item = {
      id: 'CT-FALLBACK',
      zhh: yue || '（未收錄：你可以提交更地道嘅講法）',
      zhh_pron: pron || '',
      alias_zhh: '',
      alias_zhh_r18: '',
      chs: '',
      en: '',
      note_chs: '',
      note_en: '',
      variants_chs: '',
      variants_en: '',
      examples: [],
      _fallback_provider: fb?.provider || null,
      _fallback_model: fb?.model || null,
      _fallback_error: fb?.error || null,
    };

    // telemetry miss
    supabaseInsert('telemetry_search', {
      sid,
      q: query,
      q_norm: normalizeKey(query),
      hit: false,
      result_count: 0,
      from_src: `llm:${fb?.provider || 'none'}`,
      path: pagePath || '',
      country,
    }).catch(() => {});

    res.statusCode = 200;
    res.end(JSON.stringify({
      ok: true,
      from: 'llm-fallback',
      model: fb?.model || null,
      provider: fb?.provider || null,
      query,
      count: 1,
      items: [item],
    }));
  } catch (err) {
    res.statusCode = 500;
    res.end(JSON.stringify({
      ok: false,
      error: 'Internal Server Error',
      detail: err && err.message ? err.message : String(err),
      ts: nowIso(),
    }));
  }
};
