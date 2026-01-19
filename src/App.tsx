
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
  is_r18?: string;      // 对应 is_r18 字段
  chs: string;          // 对应 chs 字段
  en: string;           // 对应 en 字段
  owner_tag?: string;   // 对应 owner_tag 字段
  register?: string;    // 对应 register 字段
  intent?: string;      // 对应 intent 字段
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

  const parseCSV = (csvText: string): LexemeEntry[] => {
   const lines = csvText.split('\n');
   const headers = lines[0].split(',').map(h => h.trim());
  
    const data: LexemeEntry[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
      
       const values = lines[i].split(',').map(v => v.trim());
       const entry: any = {};
      
      headers.forEach((header, index) => {
      entry[header] = values[index] || '';
    });
      
    data.push(entry as LexemeEntry);
  } 

    console.log('Parsed CSV Data:', data);  // 打印 CSV 解析后的数据
    return data;
  };

const handleSearch = (term: string) => {
  setSearchTerm(term);

  if (!term.trim()) {
    setMatchedEntries([]);
    setSelectedEntry(null);
    setRelatedWords([]);
    setNotFound(false);
    setSwearingToggle(false);
    return;
  }

  // 将输入的关键词通过 `/` 分割，处理多个关键词
  const keywords = term.split('/').map(keyword => keyword.trim().toLowerCase());

  console.log('Search Term:', term); // 打印搜索关键词
  console.log('Keywords:', keywords); // 打印分割后的关键词

  // 在 chs 和 en 列中进行匹配
  const searchResults: LexemeEntry[] = lexemeData.filter(entry => {
    // 获取当前选择的语言列（chs 和 en）
    const matchChs = entry.chs.toLowerCase();
    const matchEn = entry.en.toLowerCase();

    console.log('Matching chs:', matchChs);  // 打印当前匹配的中文词条
    console.log('Matching en:', matchEn);  // 打印当前匹配的英文词条

    // 确保每个关键词都能匹配到 chs 或 en 列
    return keywords.every(keyword =>
      matchChs.includes(keyword) || matchEn.includes(keyword)  // 在 chs 或 en 中进行匹配
    );
  });

  console.log('Search Results:', searchResults);  // 打印匹配到的结果

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
