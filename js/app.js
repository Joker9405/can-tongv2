const PATH = '/data/';
let CROSS = [], LEX = {}, EXMAP = {};


// =================== Telemetry (first-party, Supabase via /api) ===================
// We do NOT rely on Vercel Web Analytics (can be blocked by extensions).
const T_ENDPOINT = {
  pv: '/api/t/pv',
  search: '/api/t/search',
  zero: '/api/t/zero',
  // optional LLM fallback endpoint
  fallback: '/api/translate',
  suggest: '/api/suggest',
};

// Search token to prevent late responses overwriting newer results
let _searchToken = 0;

function postJSON(url, data) {
  try {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      keepalive: true,
      cache: 'no-store',
      body: JSON.stringify(data || {}),
    }).catch(() => {});
  } catch (_) {}
}

let _pvSent = false;
function trackPV() {
  if (_pvSent) return;
  _pvSent = true;
  postJSON(T_ENDPOINT.pv, {
    path: location.pathname,
    ref: document.referrer || '',
  });
}

function guessLang(q) {
  const s = (q || '').trim();
  if (!s) return 'empty';
  if (/[A-Za-z]/.test(s) && !/[一-鿿]/.test(s)) return 'en';
  if (/[一-鿿]/.test(s)) return 'zh';
  return 'unknown';
}

function mapLangForApi(v) {
  // client guessLang -> api lang
  if (v === 'en') return 'en';
  if (v === 'zh') return 'chs';
  if (v === 'empty') return 'auto';
  return 'auto';
}

// Debounce helper
function debounce(fn, wait) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

// Search telemetry: send at most once per "final" input state (debounced)
const trackSearchDebounced = debounce((q, ids) => {
  const raw = (q || '').trim();
  if (!raw) return;

  // Ignore if a newer search has happened
  const myToken = Number(token || 0);
  if (!myToken || myToken !== _searchToken) return;
  postJSON(T_ENDPOINT.search, {
    q: raw, // server will hash + truncate; client never stores it
    q_len: raw.length,
    lang: guessLang(raw),
    hit_count: Array.isArray(ids) ? ids.length : 0,
    hit_id: Array.isArray(ids) && ids.length === 1 ? String(ids[0]) : '',
    path: location.pathname,
  });

  if (!ids || !ids.length) {
    postJSON(T_ENDPOINT.zero, {
      q: raw,
      q_len: raw.length,
      lang: guessLang(raw),
      path: location.pathname,
    });
  }
}, 450);

// Optional LLM fallback call (debounced, only on zero-hit)
// We call /api/translate so the server decides: lexicon hit or Gemini fallback.
let _fallbackCtl = null;
const runFallbackDebounced = debounce(async (q, token) => {
  const raw = (q || '').trim();
  if (!raw) return;

  // Ignore if a newer search has happened
  const myToken = Number(token || 0);
  if (!myToken || myToken !== _searchToken) return;

  // Abort previous
  try { _fallbackCtl?.abort(); } catch (_) {}
  _fallbackCtl = new AbortController();

  // Only fallback if still zero-hit AND input hasn't changed
  try {
    if ((qInput?.value || '').trim() !== raw) return;
    if (findLexemeIds(raw).length) return;
  } catch (_) {}

  // UI: show loading state
  try { renderFallbackLoading(raw); } catch (_) {}

  try {
    const lang = mapLangForApi(guessLang(raw));
    const url = `${T_ENDPOINT.fallback}?q=${encodeURIComponent(raw)}&lang=${encodeURIComponent(lang)}`;

    const r = await fetch(url, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: _fallbackCtl.signal,
    });

    const j = await r.json().catch(() => ({}));

    // Late response protection: only update UI if this search is still current and still zero-hit
    try {
      if (myToken !== _searchToken) return;
      if ((qInput?.value || '').trim() !== raw) return;
      if (findLexemeIds(raw).length) return;
    } catch (_) {}

    // /api/translate returns: { ok, from, items:[...] }
    const item = j?.items?.[0] || null;

    if (!j || !j.ok || !item) {
      try { renderFallbackUnavailable(raw); } catch (_) {}
      return;
    }
    try {
      if (myToken !== _searchToken) return;
      renderFallbackResult(raw, item, j.from || 'draft');
    } catch (_) {}
  } catch (e) {
    if (String(e && e.name) === 'AbortError') return;
    try { renderFallbackUnavailable(raw); } catch (_) {}
  }
}, 650);



// =================== CSV 解析（支持换行 & 引号） ===================
function parseCSV(text) {
  const rows = [];
  let curField = '';
  let curRow = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      // 处理转义引号 ""
      if (inQuotes && text[i + 1] === '"') {
        curField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    // 逗号分隔字段（不在引号内）
    if (ch === ',' && !inQuotes) {
      curRow.push(curField);
      curField = '';
      continue;
    }

    // 换行分隔行（不在引号内）
    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i++; // 兼容 \r\n
      curRow.push(curField);
      curField = '';
      if (curRow.some(c => c.trim() !== '')) {
        rows.push(curRow);
      }
      curRow = [];
      continue;
    }

    curField += ch;
  }

  // 收尾最后一行
  if (curField.length || curRow.length) {
    curRow.push(curField);
    if (curRow.some(c => c.trim() !== '')) {
      rows.push(curRow);
    }
  }

  if (!rows.length) return [];

  const head = rows[0].map(s => s.trim());
  const dataRows = rows.slice(1);

  return dataRows.map(cells => {
    const obj = {};
    head.forEach((k, i) => {
      obj[k] = (cells[i] || '').trim();
    });
    return obj;
  });
}

async function loadCSV(name) {
  const r = await fetch(PATH + name, { cache: 'no-store' });
  if (!r.ok) throw new Error('load ' + name + ' failed');
  return parseCSV(await r.text());
}

// 保留工具函数（当前不再用 fuzzy，只是预留）
function norm(s) {
  return (s || '').toLowerCase().replace(/\s+/g, '');
}

function fuzzy(text, q) {
  text = norm(text);
  q = norm(q);
  if (!q) return false;
  let i = 0;
  for (const c of text) {
    if (c === q[i]) i++;
  }
  return i === q.length || text.includes(q);
}

// =================== 语音 ===================
let VOICE = null;
function pickVoice() {
  const L = speechSynthesis.getVoices();
  VOICE =
    L.find(v => /yue|Cantonese|zh[-_]HK/i.test(v.lang + v.name)) ||
    L.find(v => /zh[-_]HK/i.test(v.lang)) ||
    L.find(v => /zh/i.test(v.lang)) ||
    null;
}
if ('speechSynthesis' in window) {
  speechSynthesis.onvoiceschanged = pickVoice;
  pickVoice();
}

function speak(t) {
  if (!('speechSynthesis' in window) || !t) return;
  const u = new SpeechSynthesisUtterance(t);
  if (VOICE) u.voice = VOICE;
  u.lang = VOICE?.lang || 'zh-HK';
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

const ICON = `<svg viewBox="0 0 24 24"><path d="M3 10v4h4l5 4V6L7 10H3zm13.5 2a3.5 3.5 0 0 0-2.5-3.34v6.68A3.5 3.5 0 0 0 16.5 12zm0-7a9.5 9.5 0 0 1 0 14l1.5 1.5A11.5 11.5 0 0 0 18 3.5L16.5 5z"/></svg>`;

// =================== 载入数据 ===================
async function boot() {
  const [cm, lx, ex] = await Promise.all([
    loadCSV('crossmap.csv'),
    loadCSV('lexeme.csv'),
    loadCSV('examples.csv'),
  ]);
  CROSS = cm;

  lx.forEach(r => {
    if (r.id != null && r.id !== '') {
      LEX[String(r.id).trim()] = r;
    }
  });

  EXMAP = ex.reduce((m, r) => {
    const lid = (r.lexeme_id || '').trim();
    if (!lid) return m;
    (m[lid] || (m[lid] = [])).push(r);
    return m;
  }, {});
}

// =================== 搜索逻辑（只看 crossmap.term） ===================
function termKey(s) {
  return (s || '').trim().toLowerCase();
}

/**
 * 只在 crossmap.csv 的 term 字段里做精确匹配：
 * - 用 / ; ； 分隔多写法
 * - 忽略大小写
 * - 不做模糊匹配
 * 返回匹配到的 target_id 列表（去重）
 */
function findLexemeIds(q) {
  const rawQuery = (q || '').trim();
  if (!rawQuery) return [];

  const key = termKey(rawQuery);
  const set = new Set();

  CROSS.forEach(r => {
    const rawTerm = (r.term || '').trim();
    if (!rawTerm) return;

    const parts = rawTerm
      .split(/[\/;；]/)
      .map(s => s.trim())
      .filter(Boolean);

    for (const p of parts) {
      if (termKey(p) === key) {
        const id = (r.target_id || '').trim();
        if (id) set.add(id);
        break;
      }
    }
  });

  return Array.from(set);
}

// =================== UI ===================
const grid = document.getElementById('grid');
const examples = document.getElementById('examples');
const examplesList = document.getElementById('examples-list');
const candidateBar = document.getElementById('candidate-bar'); // 新增：候选 zhh 按钮区域

function resetUI() {
  if (grid) grid.innerHTML = '';
  if (examples) examples.hidden = true;
  if (examplesList) examplesList.innerHTML = '';
}


// ---------- Zero-hit & Fallback UI (never leave the user with a blank screen) ----------
function renderNoHit(q) {
  resetUI();
  clearCandidateBar();

  const card = document.createElement('div');
  card.className = 'card gray right-bottom';
  card.innerHTML = `
    <div class="note">
      <div><b>No exact match</b>（未命中）</div>
      <div style="margin-top:6px; opacity:.85;">你输入：<code>${escapeHtml(q)}</code></div>
      <div style="margin-top:6px; opacity:.85;">正在尝试 AI 兜底（如已开启）…</div>
    </div>
    <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
      <button class="btn-suggest" type="button">建议说法</button>
    </div>
  `;
  grid.appendChild(card);
  requestAnimationFrame(() => card.classList.add('show'));

  card.querySelector('.btn-suggest').onclick = () => openSuggest(q);
}

function renderFallbackLoading(q) {
  // update the existing no-hit card if present
  const note = grid.querySelector('.card.gray.right-bottom .note');
  if (note) {
    note.innerHTML = `
      <div><b>No exact match</b>（未命中）</div>
      <div style="margin-top:6px; opacity:.85;">你输入：<code>${escapeHtml(q)}</code></div>
      <div style="margin-top:6px; opacity:.85;">AI 生成中…</div>
    `;
  } else {
    renderNoHit(q);
  }
}

function renderFallbackUnavailable(q) {
  const note = grid.querySelector('.card.gray.right-bottom .note');
  if (note) {
    note.innerHTML = `
      <div><b>No exact match</b>（未命中）</div>
      <div style="margin-top:6px; opacity:.85;">你输入：<code>${escapeHtml(q)}</code></div>
      <div style="margin-top:6px; opacity:.85;">AI 兜底未开启或暂时不可用。你可以点“建议说法”提交补充。</div>
    `;
  } else {
    renderNoHit(q);
  }
}

function renderFallbackResult(q, item, mode) {
  // Keep the no-hit card, and also render a "draft result" card if available.
  if (!item) {
    renderFallbackUnavailable(q);
    return;
  }

  // clear existing grid then show draft cards
  resetUI();
  clearCandidateBar();

  // left: draft yue + aliases
  const aliases = (item.alias_zhh || '').split(/[;；]/).map(s => s.trim()).filter(Boolean);

  const left = document.createElement('div');
  left.className = 'card yellow left';
  left.innerHTML = `
    <div class="badge">AI 草稿（未审核）</div>
    <div class="h-head">
      <div class="h-title">${escapeHtml(item.zhh || '—')}</div>
      <button class="tts t-head" title="发音">${ICON}</button>
    </div>
    ${aliases.map(a => `
      <div class="row">
        <div class="alias">${escapeHtml(a)}</div>
        <button class="tts">${ICON}</button>
      </div>
    `).join('')}
  `;
  grid.appendChild(left);
  requestAnimationFrame(() => left.classList.add('show'));

  left.querySelector('.t-head').onclick = () => speak(item.zhh || '');
  left.querySelectorAll('.row .tts').forEach((b, i) => b.onclick = () => speak(aliases[i]));

  // right: explanation + suggest button
  setTimeout(() => {
    const rb = document.createElement('div');
    rb.className = 'card gray right-bottom';
    const noteHtml =
      (item.note_en ? escapeHtml(item.note_en) : '') +
      (item.note_chs ? ('<br>' + escapeHtml(item.note_chs)) : '');

    const variantsHtml =
      (item.variants_en ? escapeHtml(item.variants_en) : '') +
      (item.variants_chs ? ('<br>' + escapeHtml(item.variants_chs)) : '');

    rb.innerHTML = `
      <div class="note">
        <div style="opacity:.8; font-size:12px;">输入：<code>${escapeHtml(q)}</code> · ${mode === 'draft' ? 'AI 兜底（未审核）' : ''}</div>
        <div style="margin-top:8px;">${variantsHtml || ''}</div>
        <div style="margin-top:10px; opacity:.9;">${noteHtml || ''}</div>
      </div>
      <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
        <button class="btn-suggest" type="button">建议说法</button>
      </div>
    `;
    grid.appendChild(rb);
    requestAnimationFrame(() => rb.classList.add('show'));

    rb.querySelector('.btn-suggest').onclick = () => openSuggest(q);
  }, 120);
}

// Minimal safe HTML escaping for user input rendering
function escapeHtml(s) {
  return String(s || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function openSuggest(q) {
  const raw = (q || '').trim();
  const tip = '请提交你认为更好的粤语说法（例如：粤语正字 / 同义写法 / 用法说明）。\n\n注意：不要提交个人敏感信息。';
  const suggestion = window.prompt(tip, '');
  if (!suggestion) return;

  postJSON(T_ENDPOINT.suggest, {
    q: raw,
    q_len: raw.length,
    lang: guessLang(raw),
    suggestion: String(suggestion).trim().slice(0, 800),
    path: location.pathname,
  });

  // UX feedback
  try {
    alert('已收到，谢谢！我会在后台审核后加入词库。');
  } catch (_) {}
}


// 清空候选区
function clearCandidateBar() {
  if (!candidateBar) return;
  candidateBar.innerHTML = '';
  candidateBar.style.display = 'none';
}

// 显示 term 重叠时的候选 zhh 按钮（图一）
function renderCandidateBar(ids) {
  if (!candidateBar) return;

  candidateBar.innerHTML = '';
  candidateBar.style.display = 'flex';

  ids.forEach(id => {
    const lex = LEX[id];
    if (!lex) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'candidate-btn'; // 在 CSS 里按图一样式去设计
    btn.textContent = lex.zhh || lex.alias_zhh || id;

    btn.addEventListener('click', () => {
      // 用户选择具体 zhh 后，进入图二界面
      resetUI();
      clearCandidateBar();
      
    if (ids.length) {
        // Display matched lexeme
        const lex = LEX[ids[0]];
        renderPhased(lex);
    } else {
        // If no match is found, call the Gemini API fallback
        fetch('/api/translate_fallback?q=' + encodeURIComponent(q))
            .then(response => response.json())
            .then(data => {
                if (data.ok && data.items && data.items.length > 0) {
                    const item = data.items[0];
                    const lex = {
                        zhh: item.zhh || '（未收录：你可以提交更地道嘅讲法）',
                        alias_zhh: item.alias_zhh || '',
                        note_chs: item.note_chs || '',
                        note_en: item.note_en || ''
                    };
                    renderPhased(lex);
                } else {
                    renderEmpty();  // In case fallback returns no results
                }
            })
            .catch(error => {
                console.error('Error fetching fallback data:', error);
                renderEmpty();
            });
    }
    
    });

    candidateBar.appendChild(btn);
  });
}

function renderEmpty() {
  resetUI();
  clearCandidateBar();
}

// 这个 pairedVariants 保留，以后要恢复旧样式可以用，现在不再调用
function pairedVariants(chs, en) {
  const A = (chs || '').split(/[;；]/).map(s => s.trim()).filter(Boolean);
  const B = (en || '').split(/[;；]/).map(s => s.trim()).filter(Boolean);
  const n = Math.max(A.length, B.length);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ zh: A[i] || '', en: B[i] || '' });
  }
  return out;
}

function renderPhased(lex) {
  if (!lex) {
    resetUI();
    return;
  }

  resetUI();

  // alias_zhh：保留「；」拆行逻辑
  const aliases = (lex.alias_zhh || '').split(/[;；]/).map(s => s.trim()).filter(Boolean);

  // note：保持原有逻辑（英文在上，中文在下）
  const noteHtml =
    (lex.note_en || '') +
    (lex.note_chs ? ('<br>' + lex.note_chs) : '');

  // variants：不再按「；」拆分，只当成两段文本和 note 一样展示
  const variantsHtml =
    (lex.variants_en || '') +
    (lex.variants_chs ? ('<br>' + lex.variants_chs) : '');

  // ---------- 左侧：粤语 + alias ----------
  const left = document.createElement('div');
  left.className = 'card yellow left';
  left.innerHTML = `
    <div class="badge">粤语zhh：</div>
    <div class="h-head">
      <div class="h-title">${lex.zhh || '—'}</div>
      <button class="tts t-head" title="发音">${ICON}</button>
    </div>
    ${aliases.map(a => `
      <div class="row">
        <div class="alias">${a}</div>
        <button class="tts">${ICON}</button>
      </div>
    `).join('')}
  `;
  grid.appendChild(left);
  requestAnimationFrame(() => left.classList.add('show'));

  left.querySelector('.t-head').onclick = () => speak(lex.zhh || '');
  left.querySelectorAll('.row .tts').forEach((b, i) => b.onclick = () => speak(aliases[i]));

  // ---------- 右上：variants（样式跟 note 一样的块文本） ----------
  setTimeout(() => {
    const rt = document.createElement('div');
    rt.className = 'card pink right-top';
    rt.innerHTML = `
      <div class="note">${variantsHtml || ''}</div>
    `;
    grid.appendChild(rt);
    requestAnimationFrame(() => rt.classList.add('show'));

    // ---------- 右下：note + example 按钮 ----------
    const rb = document.createElement('div');
    rb.className = 'card gray right-bottom';
    rb.innerHTML = `
      <div class="note">${noteHtml || ''}</div>
      <button id="example-btn">example 扩展</button>
    `;
    grid.appendChild(rb);
    requestAnimationFrame(() => rb.classList.add('show'));

    rb.querySelector('#example-btn').onclick =
      () => toggleExamples(lex, rb.querySelector('#example-btn'));
  }, 120);
}

function toggleExamples(lex, btn) {
  if (!examples || !examplesList) return;
  const exs = EXMAP[lex.id] || [];
  if (!exs.length) return;

  if (examples.hidden) {
    examplesList.innerHTML = '';
    exs.forEach(e => {
      const row = document.createElement('div');
      row.className = 'example';
      row.innerHTML = `
        <div class="yue">${e.ex_zhh || ''}</div>
        <div class="right">
          <div class="en">${e.ex_en || ''}</div>
          <div class="chs">${e.ex_chs || ''}</div>
        </div>
        <div class="btns">
          <button class="tts" title="粤语">${ICON}</button>
        </div>
      `;
      row.querySelector('.tts').onclick = () => speak(e.ex_zhh || '');
      examplesList.appendChild(row);
    });
    examples.hidden = false;
    btn.remove();
  } else {
    examples.hidden = true;
  }
}


// =================== 输入监听 ===================
const qInput = document.getElementById('q');

// track PV once page is interactive
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', trackPV, { once: true });
} else {
  trackPV();
}

qInput.addEventListener('input', e => {
  const q = e.target.value;
  const token = ++_searchToken;

  if (!q) {
    try { _fallbackCtl?.abort(); } catch (_) {}
    renderEmpty();
    return;
  }

  // 每次输入用当前完整 query 去 crossmap 精确匹配
  const ids = findLexemeIds(q);

  // Telemetry (debounced)
  trackSearchDebounced(q, ids);

  // 先清空详情 & 候选，后面根据情况再渲染
  resetUI();
  clearCandidateBar();

  // If we have any lexicon hit, abort any in-flight fallback to prevent UI overwrite
  if (ids.length) {
    try { _fallbackCtl?.abort(); } catch (_) {}
  }

  if (!ids.length) {
    // 不要留空白：给出未命中提示，并尝试 AI 兜底（如已开启）
    renderNoHit(q);
    runFallbackDebounced(q, token);
    return;
  }

  if (ids.length === 1) {
    const lex = LEX[ids[0]];
    
    if (ids.length) {
        // Display matched lexeme
        const lex = LEX[ids[0]];
        renderPhased(lex);
    } else {
        // If no match is found, call the Gemini API fallback
        fetch('/api/translate_fallback?q=' + encodeURIComponent(q))
            .then(response => response.json())
            .then(data => {
                if (data.ok && data.items && data.items.length > 0) {
                    const item = data.items[0];
                    const lex = {
                        zhh: item.zhh || '（未收录：你可以提交更地道嘅讲法）',
                        alias_zhh: item.alias_zhh || '',
                        note_chs: item.note_chs || '',
                        note_en: item.note_en || ''
                    };
                    renderPhased(lex);
                } else {
                    renderEmpty();  // In case fallback returns no results
                }
            })
            .catch(error => {
                console.error('Error fetching fallback data:', error);
                renderEmpty();
            });
    }
    
    return;
  }

  // 多个 target_id：显示图一候选界面
  renderCandidateBar(ids);
});

boot().then(() => {
  // Optional: send PV after data ready (no harm; trackPV is idempotent)
  trackPV();
}).catch(() => {});
