import { useState, useEffect, useRef } from 'react';
import { Search } from './components/Search';
import { GreenCard } from './components/GreenCard';
import { MagentaCard } from './components/MagentaCard';
import { BlueCard } from './components/BlueCard';
import { AddWordDrawer } from './components/AddWordDrawer';

export interface LexemeEntry {
  id?: string;
  zhh: string;
  zhh_pron: string;
  is_r18: '0' | '1';
  chs: string;
  en: string;
  owner_tag?: string;
  register?: string;
  intent?: string;
  related?: string;
  tags?: string;
}

export default function App() {
  const [lexemeData, setLexemeData] = useState<LexemeEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [matchedEntries, setMatchedEntries] = useState<LexemeEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<LexemeEntry | null>(null);
  const [relatedWords, setRelatedWords] = useState<string[]>([]);
  const [language, setLanguage] = useState<'chs' | 'en'>('en');
  const [loading, setLoading] = useState(true);
  const [swearingToggle, setSwearingToggle] = useState(false);
  const [showAddDrawer, setShowAddDrawer] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const telemetryTimer = useRef<number | null>(null);
  const telemetryLastKey = useRef<string>('');

  // 发送数据到你的 api/search.js (Vercel 后端)
  const reportTelemetry = async (q: string, isHit: boolean) => {
    try {
      const body = {
        q,
        isHit,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
        source: 'web_search',
      };
      await fetch('/api/search', { // 这里的路径对应你 vercel 上的 search.js 路由
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true,
      });
    } catch (e) {
      console.error('Telemetry failed', e);
    }
  };

  const scheduleTelemetry = (q: string, isHit: boolean) => {
    const qq = String(q || '').trim();
    if (!qq) return;
    const key = `${qq}::${isHit ? '1' : '0'}`;
    if (telemetryTimer.current) window.clearTimeout(telemetryTimer.current);
    telemetryTimer.current = window.setTimeout(() => {
      if (telemetryLastKey.current === key) return;
      telemetryLastKey.current = key;
      reportTelemetry(qq, isHit);
    }, 1200);
  };

  useEffect(() => {
    const loadCSV = async () => {
      try {
        const response = await fetch('/lexeme.csv');
        const csvText = await response.text();
        const parsedData = parseCSV(csvText);
        setLexemeData(parsedData);
        setLoading(false);
      } catch (error) {
        console.error('Failed to load CSV data:', error);
        setLoading(false);
      }
    };
    loadCSV();
  }, []);

  const normalizeIsR18 = (raw: unknown): '0' | '1' => {
    const v = String(raw ?? '').replace(/^\uFEFF/, '').trim().replace(/^"+|"+$/g, '');
    return v === '1' ? '1' : '0';
  };

  const parseCsvRows = (text: string): string[][] => {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const next = text[i + 1];
      if (ch === '"') {
        if (inQuotes && next === '"') { field += '"'; i++; } else { inQuotes = !inQuotes; }
        continue;
      }
      if (ch === ',' && !inQuotes) { row.push(field); field = ''; continue; }
      if ((ch === '\n' || ch === '\r') && !inQuotes) {
        if (ch === '\r' && next === '\n') i++;
        row.push(field); rows.push(row); row = []; field = ''; continue;
      }
      field += ch;
    }
    row.push(field); rows.push(row);
    return rows;
  };

  const parseCSV = (csvText: string): LexemeEntry[] => {
    const rows = parseCsvRows(csvText);
    if (!rows.length) return [];
    const headers = rows[0].map(h => String(h ?? '').replace(/^\uFEFF/, '').trim());
    const data: LexemeEntry[] = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.every(c => String(c ?? '').trim() === '')) continue;
      const entry: any = {};
      headers.forEach((header, index) => { entry[header] = String(r[index] ?? '').trim(); });
      entry.is_r18 = normalizeIsR18(entry.is_r18);
      data.push(entry as LexemeEntry);
    }
    return data;
  };

  const splitTokens = (value: string, lower = false) =>
    String(value ?? '').split('/').map(s => s.trim()).filter(Boolean).map(s => (lower ? s.toLowerCase() : s));

  const handleSearch = (term: string) => {
    setSearchTerm(term);
    const query = term.trim();
    if (!query) {
      setMatchedEntries([]);
      setSelectedEntry(null);
      setNotFound(false);
      return;
    }
    const queryEn = query.toLowerCase();
    const searchResults = lexemeData.filter(entry => {
      const chsTokens = splitTokens(entry.chs, false);
      const enTokens = splitTokens(entry.en, true);
      return chsTokens.includes(query) || enTokens.includes(queryEn);
    });

    if (searchResults.length > 0) {
      const colloquialResults = searchResults.filter(e => e.is_r18 === '0');
      const selected = colloquialResults.length > 0 ? colloquialResults[0] : searchResults[0];
      setMatchedEntries(searchResults);
      setSelectedEntry(selected);
      setNotFound(false);
      if (selected.related) {
        setRelatedWords(selected.related.split(/[,/]/).map(w => w.trim()).filter(w => w));
      }
      scheduleTelemetry(query, true); // Bingo
    } else {
      setMatchedEntries([]);
      setSelectedEntry(null);
      setNotFound(true);
      scheduleTelemetry(query, false); // Miss
    }
  };

  const handleEntryClick = (entry: LexemeEntry) => {
    setSelectedEntry(entry);
  };

  const toggleLanguage = () => {
    setLanguage(prev => prev === 'chs' ? 'en' : 'chs');
  };

  const vulgarEntries = matchedEntries.filter(e => e.is_r18 === '1');
  const colloquialEntries = matchedEntries.filter(e => e.is_r18 === '0');

  return (
    <div className="min-h-screen bg-black text-white pb-20">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold text-[#c8ff00] font-[Architects_Daughter] text-[32px]">Can-Tong</h1>
            <div className="w-2 h-2 rounded-full bg-[#c8ff00]"></div>
          </div>
          <button onClick={toggleLanguage} className="text-sm text-gray-400 hover:text-gray-300 transition-colors font-[Inder]">chs‑zhh‑en</button>
        </div>
        <Search value={searchTerm} onChange={handleSearch} placeholder="imbecile" />
        {loading && <div className="text-center text-gray-400 mt-8">Loading data...</div>}
        {!loading && selectedEntry && (
          <div className="mt-2 space-y-2">
            {selectedEntry.is_r18 === '1' ? <MagentaCard entry={selectedEntry} /> : <GreenCard entry={selectedEntry} />}
            <div className="flex flex-wrap gap-2">
              {colloquialEntries.filter(e => e !== selectedEntry).map((entry, index) => (
                <button key={`green-${index}`} onClick={() => handleEntryClick(entry)} className="px-5 py-3 bg-[#c8ff00] text-black rounded-[28px] p-8 relative text-lg hover:scale-105 transition-transform font-medium">
                  {entry.zhh}
                </button>
              ))}
            </div>
            {vulgarEntries.length > 0 && !swearingToggle && (
              <button onClick={() => setSwearingToggle(true)} className="px-5 py-3 bg-[#ff0090] text-white rounded-[28px] p-8 relative text-lg font-[Anton] font-bold">Swearing</button>
            )}
            {swearingToggle && (
              <div className="flex flex-wrap gap-2">
                {vulgarEntries.map((entry, index) => (
                  <button key={`magenta-${index}`} onClick={() => handleEntryClick(entry)} className="px-5 py-3 bg-[#ff0090] text-white rounded-[28px] p-8 relative text-lg animate-slide-in">{entry.zhh}</button>
                ))}
              </div>
            )}
            <div className="relative">
              <button onClick={() => setShowAddDrawer(true)} className="px-5 py-3 bg-gray-700 text-[#c8ff00] rounded-[28px] p-8 relative text-lg font-[Anton] font-bold">add</button>
              {showAddDrawer && <AddWordDrawer isOpen={showAddDrawer} searchTerm={searchTerm} onClose={() => setShowAddDrawer(false)} />}
            </div>
          </div>
        )}
        {!loading && notFound && searchTerm && <BlueCard searchTerm={searchTerm} />}
        <div className="mt-16 pt-8 text-center text-xs text-gray-600">
          <p className="font-[Inder]">Vocabulary collected on that day: {lexemeData.length} Entry</p>
          <p className="mt-1 font-[ABeeZee]">CanTongMVP — Code MIT, Core Lexicons Closed (All Rights Reserved).</p>
        </div>
      </div>
    </div>
  );
}