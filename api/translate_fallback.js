// api/translate_fallback.js
// Gemini fallback endpoint (CommonJS).
// Env:
//   GEMINI_API_KEY   (required)  - Google AI Studio key
//   GEMINI_MODEL     (optional)  - default: gemini-2.5-flash
//
// Request:
//   GET  /api/translate_fallback?q=...
//   POST /api/translate_fallback  { "q": "...", "lang": "en|chs|mix|auto" }
//
// Response:
//   { ok:true, source:"gemini", model, input, yue }

const https = require('https');

function readJsonBody(req) {
  return new Promise((resolve) => {
    let buf = '';
    req.on('data', (chunk) => (buf += chunk));
    req.on('end', () => {
      if (!buf) return resolve({});
      try {
        resolve(JSON.parse(buf));
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function geminiGenerate({ apiKey, model, promptText }) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: promptText }] }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 256,
      },
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

function buildPrompt(input, lang) {
  const langHint =
    lang === 'en'
      ? '輸入係英文'
      : lang === 'chs'
      ? '輸入係中文'
      : lang === 'mix'
      ? '輸入係中英混合'
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

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_AI_API_KEY;
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    const body = req.method === 'POST' ? await readJsonBody(req) : {};
    const q = (req.method === 'GET' ? (req.query?.q || req.query?.query) : (body.q || body.query || body.text)) || '';
    const lang = (req.method === 'GET' ? (req.query?.lang || 'auto') : (body.lang || 'auto')) || 'auto';

    const input = String(q || '').trim();
    if (!input) {
      res.statusCode = 400;
      res.end(JSON.stringify({ ok: false, error: 'Missing q' }));
      return;
    }
    if (!apiKey) {
      res.statusCode = 500;
      res.end(JSON.stringify({ ok: false, error: 'Missing GEMINI_API_KEY' }));
      return;
    }

    const promptText = buildPrompt(input, lang);
    const out = await geminiGenerate({ apiKey, model, promptText });

    if (!out.text) {
      res.statusCode = 500;
      res.end(JSON.stringify({ ok: false, error: 'Empty Gemini response', model }));
      return;
    }

    res.statusCode = 200;
    res.end(
      JSON.stringify({
        ok: true,
        source: 'gemini',
        model,
        input,
        yue: out.text,
      }),
    );
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e) }));
  }
};
