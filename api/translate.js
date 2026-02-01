// api/translate.js
// Lexicon exact match (crossmap.csv -> lexeme.csv). If miss, Gemini fallback.
// Fix: robust CSV parser (quotes/newlines/commas), flexible column mapping, safer term splitting.

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// ---------------- Gemini ----------------
function geminiGenerate({ apiKey, model, promptText }) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: promptText }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 256 },
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

function buildGeminiPrompt(input, lang) {
  const langHint =
    lang === 'en' ? '輸入係英文'
    : lang === 'chs' ? '輸入係中文'
    : lang === 'mix' ? '輸入係中英混合'
    : '輸入語言不確定（自動判斷）';

  return [
    '你係一個講地道口語粵語嘅助理。',
    '請把以下輸入改寫成地道、自然、口語嘅粵語正字（繁體）。',
    '只輸出最終粵語一句/一段（不要解釋、不要加標題、不要列表、不要輸出粵拼）。',
    `(${langHint})`,
    '',
    `輸入：${input}`,
    '',
    '輸出：',
  ].join('\n');
}

async function geminiFallbackTranslate(query, lang = 'auto') {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return { yue: null, model: null, error: 'missing_key' };

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const promptText = buildGeminiPrompt(query, lang);

  try {
    const yue = await geminiGenerate({ apiKey, model, promptText });
    const out = String(yue || '').trim();
    return { yue: out || null, model, error: out ? null : 'empty' };
  } catch (e) {
    return { yue: null, model, error: String(e && e.message ? e.message : e) };
  }
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

// ---------------- CSV lookup ----------------
let CACHE = null;

function findFirstExisting(paths) {
  for (const p of paths) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch (_) {}
  }
  return null;
}

function buildData() {
  if (CACHE) return CACHE;

  const dataDir = path.join(process.cwd(), 'data');

  // lexeme.csv is required (try multiple common locations)
  const lexemePath = findFirstExisting([
    path.join(dataDir, 'lexeme.csv'),
    path.join(process.cwd(), 'lexeme.csv'),
    path.join(process.cwd(), 'public', 'lexeme.csv'),
  ]);
  if (!lexemePath) throw new Error('未找到 lexeme.csv（已尝试 data/lexeme.csv、/lexeme.csv、/public/lexeme.csv），请确认文件路径');

  // crossmap.csv is optional (if present, it maps synonyms/chs/en to lexeme id)
  const crossmapPath = findFirstExisting([
    path.join(dataDir, 'crossmap.csv'),
    path.join(process.cwd(), 'crossmap.csv'),
    path.join(process.cwd(), 'public', 'crossmap.csv'),
  ]);

  // examples.csv optional
  const examplesPath = findFirstExisting([
    path.join(dataDir, 'examples.csv'),
    path.join(process.cwd(), 'examples.csv'),
    path.join(process.cwd(), 'public', 'examples.csv'),
  ]);

  const lexemeRows = csvToObjects(fs.readFileSync(lexemePath, 'utf8'));
  const crossmapRows = crossmapPath ? csvToObjects(fs.readFileSync(crossmapPath, 'utf8')) : [];
  const exampleRows = examplesPath ? csvToObjects(fs.readFileSync(examplesPath, 'utf8')) : [];

  // Build lexeme map
  const lexemeById = new Map();
  for (const row of lexemeRows) {
    const id = (row.id || row.lexeme_id || row.lexemeId || '').trim();
    if (!id) continue;
    lexemeById.set(id, row);
  }

  // Examples map (optional)
  const examplesByLexemeId = {};
  for (const e of exampleRows) {
    const lid = (e.lexeme_id || e.target_id || e.lexemeId || e.lexeme || '').trim();
    if (!lid) continue;
    if (!examplesByLexemeId[lid]) examplesByLexemeId[lid] = [];
    examplesByLexemeId[lid].push(e);
  }

  // Index map: normalized term -> Set<lexemeId>
  const termIndex = new Map();

  if (crossmapRows.length) {
    // Build index from crossmap.csv (preferred when available)
    const termCols = ['term', 'terms', 'key_text', 'key', 'query', 'chs', 'en', 'text'];
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
      if (!collected.length) continue;

      for (const t of collected) {
        const key = normalizeKey(t);
        if (!key) continue;
        if (!termIndex.has(key)) termIndex.set(key, new Set());
        termIndex.get(key).add(targetId);
      }
    }
  } else {
    // Build index directly from lexeme.csv (works even when you only have one CSV)
    const termCols = ['zhh', 'chs', 'en'];
    for (const row of lexemeRows) {
      const id = (row.id || '').trim();
      if (!id) continue;

      let collected = [];
      for (const c of termCols) {
        if (row[c]) collected = collected.concat(splitTerms(row[c]));
      }
      // Always include the raw zhh (even if splitTerms didn't add anything)
      if (row.zhh) collected.push(String(row.zhh).trim());

      collected = collected.map((x) => String(x || '').trim()).filter(Boolean);

      for (const t of collected) {
        const key = normalizeKey(t);
        if (!key) continue;
        if (!termIndex.has(key)) termIndex.set(key, new Set());
        termIndex.get(key).add(id);
      }
    }
  }

  CACHE = { termIndex, lexemeById, examplesByLexemeId, crossmapRows, lexemeRows };
  return CACHE;
}

function lookupLexemeItemsByQuery(query) {
  const { termIndex, lexemeById, examplesByLexemeId, crossmapRows } = buildData();
  const key = normalizeKey(query);
  if (!key) return [];

  // 1) indexed exact match
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

  // 2) brute-force exact match (in case columns differ or index missed something)
  const out2 = [];
  const idCols = ['target_id', 'targetId', 'lexeme_id', 'lexemeId', 'to_id', 'id'];
  for (const row of crossmapRows) {
    const values = Object.values(row).map((v) => normalizeKey(v));
    if (!values.includes(key)) continue;

    let targetId = '';
    for (const c of idCols) {
      if (row[c]) { targetId = String(row[c]).trim(); break; }
    }
    if (!targetId) continue;

    const lexeme = lexemeById.get(targetId);
    if (!lexeme) continue;

    const item = Object.assign({}, lexeme);
    item.examples = examplesByLexemeId[targetId] || [];
    out2.push(item);
  }
  return out2;
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
  const qFromQuery = req.query?.q || req.query?.query || req.query?.text || req.query?.input || req.query?.term || req.query?.keyword;
  const qFromBody = body?.q || body?.query || body?.term || body?.keyword || body?.input || body?.text;
  return String(qFromQuery || qFromBody || '').trim();
}

function getLangFromReq(req, body) {
  const l = req.query?.lang || req.query?.language || body?.lang || body?.language || 'auto';
  return String(l || 'auto');
}


// ---------------- telemetry (Supabase) ----------------
let SB_CLIENT = null;

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!SB_CLIENT) {
    SB_CLIENT = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return SB_CLIENT;
}

function parseCookies(cookieHeader) {
  const out = {};
  const s = String(cookieHeader || '');
  if (!s) return out;
  const parts = s.split(';');
  for (const p of parts) {
    const idx = p.indexOf('=');
    if (idx === -1) continue;
    const k = p.slice(0, idx).trim();
    const v = p.slice(idx + 1).trim();
    if (!k) continue;
    out[k] = decodeURIComponent(v || '');
  }
  return out;
}

function ensureSid(req, res) {
  const cookies = parseCookies(req.headers?.cookie || '');
  let sid = cookies.ct_sid;
  if (!sid) {
    sid = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
    // 30 days
    res.setHeader('Set-Cookie', `ct_sid=${encodeURIComponent(sid)}; Path=/; Max-Age=2592000; SameSite=Lax`);
  }
  return sid;
}

function getPagePathFromReferer(req) {
  const ref = req.headers?.referer || req.headers?.referrer || '';
  if (!ref) return '';
  try {
    const u = new URL(ref);
    return u.pathname || '';
  } catch (_) {
    return '';
  }
}

function normalizeForStats(q) {
  return String(q || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

async function safeInsert(table, payload) {
  const sb = getSupabaseClient();
  if (!sb) return;
  try {
    await sb.from(table).insert(payload);
  } catch (_) {
    // ignore telemetry errors (never break core API)
  }
}

async function logPv({ sid, req }) {
  const path = getPagePathFromReferer(req) || '';
  if (!path) return; // without referer, it's likely a direct API test
  await safeInsert('telemetry_pv', [{
    sid,
    path,
    referrer: req.headers?.referer || req.headers?.referrer || null,
    lang: req.headers?.['accept-language'] ? String(req.headers['accept-language']).split(',')[0] : null,
    ua: req.headers?.['user-agent'] || null,
    country: req.headers?.['x-vercel-ip-country'] || req.headers?.['x-vercel-ip-country-region'] || null,
  }]);
}

async function logSearch({ sid, req, q, hit, result_count, from_src }) {
  const path = getPagePathFromReferer(req) || '';
  await safeInsert('telemetry_search', [{
    sid,
    q,
    q_norm: normalizeForStats(q),
    hit: !!hit,
    result_count: Number(result_count || 0),
    from_src: from_src || null,
    path: path || null,
    country: req.headers?.['x-vercel-ip-country'] || req.headers?.['x-vercel-ip-country-region'] || null,
  }]);
}

// ---------------- handler ----------------
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  const sid = ensureSid(req, res);

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

    // telemetry: page view (best-effort)
    await logPv({ sid, req });

    if (!query) {
      res.statusCode = 200;
      res.end(JSON.stringify({ ok: true, from: 'crossmap-exact', query: '', count: 0, items: [] }));
      return;
    }

    const items = lookupLexemeItemsByQuery(query);

    // telemetry: search (hit/miss)
    // (do not block the main flow if telemetry fails)

    if (items && items.length > 0) {
      await logSearch({ sid, req, q: query, hit: true, result_count: items.length, from_src: 'crossmap-exact' });
      res.statusCode = 200;
      res.end(JSON.stringify({ ok: true, from: 'crossmap-exact', query, count: items.length, items }));
      return;
    }

    // Miss -> Gemini fallback
    const fb = await geminiFallbackTranslate(query, lang);
    const yue = fb?.yue ? String(fb.yue).trim() : '';

    const item = {
      id: 'CT-FALLBACK',
      zhh: yue || '（未收錄：你可以提交更地道嘅講法）',
      zhh_pron: '',
      alias_zhh: '',
      alias_zhh_r18: '',
      chs: '',
      en: '',
      note_chs: '',
      note_en: '',
      variants_chs: '',
      variants_en: '',
      examples: [],
      _fallback_error: fb?.error || null,
    };

    await logSearch({ sid, req, q: query, hit: false, result_count: 1, from_src: 'gemini-fallback' });

    res.statusCode = 200;
    res.end(JSON.stringify({
      ok: true,
      from: 'gemini-fallback',
      model: fb?.model || null,
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
    }));
  }
};
