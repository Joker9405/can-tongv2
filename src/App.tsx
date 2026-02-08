
import { useState, useEffect } from 'react';
import { Search } from './components/Search';
import { GreenCard } from './components/GreenCard';
import { MagentaCard } from './components/MagentaCard';
import { BlueCard } from './components/BlueCard';
import { AddWordDrawer } from './components/AddWordDrawer';

export interface LexemeEntry {
  id?: string;          // 对应 id 字段
  zhh: string;          // 对应 zhh 字段
  zhh_pron: string;     // 对应 zhh_pron（粤拼）字段
  // 统一规范为 '0' | '1'，避免出现 "1" / 1 / 1\r 导致的粉卡不稳定
  is_r18: '0' | '1';    // 对应 is_r18 字段
  chs: string;          // 对应 chs 字段
  en: string;           // 对应 en 字段
  owner_tag?: string;   // 对应 owner_tag 字段
  register?: string;    // 对应 register 字段
  intent?: string;      // 对应 intent 字段
  // 兼容旧 UI 逻辑（即便 CSV 不提供这些列，也不会影响）
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

  useEffect(() => {
    const loadCSV = async () => {
      try {
        // Load the CSV file from local public directory
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

  // 规范化 is_r18：兼容 1 / "1" / 1\r / 空值
  const normalizeIsR18 = (raw: unknown): '0' | '1' => {
    const v = String(raw ?? '')
      .replace(/^\uFEFF/, '')
      .trim()
      .replace(/^"+|"+$/g, '');
    return v === '1' ? '1' : '0';
  };

  // RFC4180 兼容 CSV 解析：解决含引号/逗号/换行导致的列错位（粉卡不稳定的根因）
  const parseCsvRows = (text: string): string[][] => {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const next = text[i + 1];

      if (ch === '"') {
        if (inQuotes && next === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (ch === ',' && !inQuotes) {
        row.push(field);
        field = '';
        continue;
      }

      if ((ch === '\n' || ch === '\r') && !inQuotes) {
        if (ch === '\r' && next === '\n') i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        continue;
      }

      field += ch;
    }

    // flush last field/row
    row.push(field);
    rows.push(row);
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
      headers.forEach((header, index) => {
        entry[header] = String(r[index] ?? '').trim();
      });

      // 必填字段兜底，避免空值导致渲染异常
      entry.id = entry.id || '';
      entry.zhh = entry.zhh || '';
      entry.zhh_pron = entry.zhh_pron || '';
      entry.chs = entry.chs || '';
      entry.en = entry.en || '';
      entry.is_r18 = normalizeIsR18(entry.is_r18);

      data.push(entry as LexemeEntry);
    }

    return data;
  };

  // 词条字段里用 / 分隔多个同义词：只允许“完全一致”命中某一个 token（取消 includes/模糊）
  const splitTokens = (value: string, lower = false) =>
    String(value ?? '')
      .split('/')
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => (lower ? s.toLowerCase() : s));

  const handleSearch = (term: string) => {
    setSearchTerm(term);

    const query = term.trim();
    if (!query) {
      setMatchedEntries([]);
      setSelectedEntry(null);
      setRelatedWords([]);
      setNotFound(false);
      setSwearingToggle(false);
      return;
    }

    const queryEn = query.toLowerCase();

    // 只允许 chs 或 en 精确 token 命中（完全相等），否则不算命中
    const searchResults: LexemeEntry[] = lexemeData.filter(entry => {
      const chsTokens = splitTokens(entry.chs, false);
      const enTokens = splitTokens(entry.en, true);
      return chsTokens.includes(query) || enTokens.includes(queryEn);
    });

    if (searchResults.length > 0) {
      const colloquialResults = searchResults.filter(e => e.is_r18 === '0');
      const entriesToChooseFrom = colloquialResults.length > 0 ? colloquialResults : searchResults;
      const randomIndex = Math.floor(Math.random() * entriesToChooseFrom.length);
      const selected = entriesToChooseFrom[randomIndex];

      setMatchedEntries(searchResults);
      setSelectedEntry(selected);
      setNotFound(false);
      setSwearingToggle(false);

      if (selected.related) {
        const words = selected.related.split(/[,/]/).map(w => w.trim()).filter(w => w);
        setRelatedWords(words);
      } else {
        setRelatedWords([]);
      }
    } else {
      setMatchedEntries([]);
      setSelectedEntry(null);
      setRelatedWords([]);
      setNotFound(true);
      setSwearingToggle(false);
    }
  };


  const handleWordClick = (word: string) => {
    const found = matchedEntries.find(entry => entry.zhh === word);
    if (found) {
      setSelectedEntry(found);
      if (found.related) {
        const words = found.related.split(/[,/]/).map(w => w.trim()).filter(w => w);
        setRelatedWords(words);
      }
    }
  };

  const handleEntryClick = (entry: LexemeEntry) => {
    setSelectedEntry(entry);
    if (entry.related) {
      const words = entry.related.split(/[,/]/).map(w => w.trim()).filter(w => w);
      setRelatedWords(words);
    }
  };

  const toggleLanguage = () => {
    setLanguage(prev => prev === 'chs' ? 'en' : 'chs');
  };

  const isSwearing = selectedEntry?.is_r18 === '1' || selectedEntry?.tags?.includes('Swearing');
  const isColloquial = selectedEntry?.is_r18 === '0';

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
          
          <button
            onClick={toggleLanguage}
            className="text-sm text-gray-400 hover:text-gray-300 transition-colors font-[Inder]"
          >
            chs‑zhh‑en
          </button>
        </div>

        <Search
          value={searchTerm}
          onChange={handleSearch}
          placeholder="imbecile"
        />

        {loading && <div className="text-center text-gray-400 mt-8">Loading data...</div>}

        {!loading && selectedEntry && (
          <div className="mt-2 space-y-2">
            {selectedEntry.is_r18 === '1' ? (
              <MagentaCard entry={selectedEntry} />
            ) : (
              <GreenCard entry={selectedEntry} />
            )}

            <div className="flex flex-wrap gap-2">
              {colloquialEntries
                .filter(e => e !== selectedEntry)
                .map((entry, index) => (
                  <button
                    key={`green-${index}`}
                    onClick={() => handleEntryClick(entry)}
                    className="px-5 py-3 bg-[#c8ff00] text-black rounded-[28px] p-8 relative text-lg 
                              hover:scale-105 transition-transform font-medium"
                  >
                    {entry.zhh} 
                  </button>
                ))}
            </div>

            {vulgarEntries.length > 0 && !swearingToggle && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSwearingToggle(true)}
                  className="px-5 py-3 bg-[#ff0090] text-white rounded-[28px] p-8 relative text-lg 
                            hover:bg-[#ff1a9f] transition-colors font-medium font-bold font-[Anton]"
                >
                  Swearing
                </button>
              </div>
            )}

            {swearingToggle && vulgarEntries.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {vulgarEntries
                  .filter(e => e !== selectedEntry)
                  .map((entry, index) => (
                    <button
                      key={`magenta-${index}`}
                      onClick={() => handleEntryClick(entry)}
                      className="px-5 py-3 bg-[#ff0090] text-white rounded-[28px] p-8 relative text-lg 
                                hover:scale-105 transition-transform font-medium animate-slide-in"
                      style={{ animationDelay: `${index * 0.05}s` }}
                    >
                      {entry.zhh} 
                    </button>
                  ))}
              </div>
            )}

            <div className="relative">
              <button
                onClick={() => setShowAddDrawer(true)}
                className="px-5 py-3 bg-gray-700 text-[#c8ff00] rounded-[28px] p-8 relative text-lg 
                          hover:bg-gray-600 transition-colors font-medium font-[Anton] font-bold"
              >
                add
              </button>
              
              {showAddDrawer && (
                <AddWordDrawer
                  isOpen={showAddDrawer}
                  searchTerm={searchTerm}
                  onClose={() => setShowAddDrawer(false)}
                />
              )}
            </div>
          </div>
        )}

        {!loading && notFound && searchTerm && (
          <BlueCard searchTerm={searchTerm} />
        )}

        <div className="mt-16 pt-8 text-center text-xs text-gray-600">
          <p className="font-[Inder]">Vocabulary collected on that day: {lexemeData.length} Entry</p>
          <p className="mt-1 font-[ABeeZee]">
            CanTongMVP — Code MIT, Core Lexicons Closed (All Rights Reserved).
          </p>
        </div>
      </div>
    </div>
  );
}
