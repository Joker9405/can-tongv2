// api/fallback.js
// Zero-hit fallback using Gemini (Google AI).
// Env:
//   GEMINI_API_KEY (required)
//   GEMINI_MODEL   (optional, default: gemini-2.5-flash)
// Also best-effort writes a draft row to Supabase table `drafts` (if you have it).

const https = require('https');
const { buildCommon, insertRow, readJson, sha256Hex } = require('./_lib/supabase');

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
          resolve({ raw: j, text });
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

function buildPrompt(q, lang = 'auto') {
  const langHint =
    lang === 'en' ? '輸入係英文' : lang === 'chs' ? '輸入係中文' : lang === 'mix' ? '輸入係中英混合' : '輸入語言不確定（自動判斷）';
  return [
    '你係一個講地道口語粵語嘅助理。',
    '請把以下輸入改寫成地道、自然、口語嘅粵語正字（繁體）。',
    '只輸出最終粵語一句/一段（不要解釋、不要加標題、不要列表、不要輸出粵拼）。',
    `(${langHint})`,
    '',
    `輸入：${q}`,
    '',
    '輸出：',
  ].join('\n');
}

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
    const q = String(body.q || body.query || body.text || '').trim();
    const lang = String(body.lang || body.language || 'auto');

    if (!q) {
      res.statusCode = 200;
      res.end(JSON.stringify({ ok: false, mode: 'missing_q' }));
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      res.statusCode = 200;
      res.end(JSON.stringify({ ok: false, mode: 'missing_key' }));
      return;
    }

    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const promptText = buildPrompt(q, lang);
    const out = await geminiGenerate({ apiKey, model, promptText });

    const yue = String(out.text || '').trim();
    if (!yue) {
      res.statusCode = 200;
      res.end(JSON.stringify({ ok: false, mode: 'empty' }));
      return;
    }

    // Build an item compatible with translate.js items shape
    const item = {
      id: 'CT-FALLBACK',
      zhh: yue,
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
    };

    // Best-effort write draft
    try {
      const c = buildCommon(req, res);
      const salt = process.env.TELEMETRY_SALT || '';
      const qPrefix = q.slice(0, 24);
      const qHash = q ? sha256Hex(`${salt}:${q}`) : '';
      await insertRow('drafts', {
        cid: c.cid,
        ip_hash: c.ip_hash,
        device: c.device,
        q_prefix: qPrefix,
        q_hash: qHash,
        lang: lang,
        model: model,
        output: item,
        status: 'pending_review',
        country: c.country,
        region: c.region,
        city: c.city,
      });
    } catch (_) {
      // ignore
    }

    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true, mode: 'draft', source: 'gemini', model, item }));
  } catch (e) {
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: false, mode: 'error', error: String(e && e.message ? e.message : e) }));
  }
};
