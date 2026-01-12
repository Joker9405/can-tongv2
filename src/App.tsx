import { useState, useEffect } from 'react';
import { Search } from './components/Search';
import { GreenCard } from './components/GreenCard';
import { MagentaCard } from './components/MagentaCard';
import { BlueCard } from './components/BlueCard';
import { AddWordDrawer } from './components/AddWordDrawer';

export interface LexemeEntry {
  id?: string;
  zhh: string;
  chs: string;
  en: string;
  jyutping: string;
  tags?: string;
  related?: string;
  is_r18?: string;
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
    // Load CSV data from GitHub
    const loadCSV = async () => {
      try {
        const url = 'YOUR_GITHUB_RAW_CSV_URL';
        const response = await fetch(url);
        const csvText = await response.text();
        const parsedData = parseCSV(csvText);
        setLexemeData(parsedData);
        setLoading(false);
      } catch (error) {
        console.error('Failed to load CSV data:', error);
        setLexemeData(mockData);
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
    
    return data;
  };

  const handleSearch = (term: string) => {
    setSearchTerm(term);
    
    if (!term.trim()) {
      setMatchedEntries([]);
      setSelectedEntry(null);
      setRelatedWords([]);
      setNotFound(false);
      return;
    }

    // Define keyword groups
    const keywordGroups = [
      {
        chs: ['笨蛋', '蠢货', '没用', '人头猪脑', '没有用的人'],
        en: ['dumb', 'imbecile', 'incredibly stupid', 'brain dead', 'fool', 'idiot', 'moron', 'stupid', 'retarded', 'doofus', 'dimwit', 'nitwit', 'stupid person', 'big sweet potato', 'pig brained', 'dumb person'],
        entries: mockData
      }
    ];

    let searchResults: LexemeEntry[] = [];
    
    // Check if matches any keyword group
    for (const group of keywordGroups) {
      const keywords = language === 'chs' ? group.chs : group.en;
      const isMatch = keywords.some(keyword => 
        keyword.toLowerCase().includes(term.toLowerCase()) ||
        term.toLowerCase().includes(keyword.toLowerCase())
      );
      
      if (isMatch) {
        searchResults = group.entries;
        break;
      }
    }

    if (searchResults.length > 0) {
      // Randomly select one to display
      const randomIndex = Math.floor(Math.random() * searchResults.length);
      const selected = searchResults[randomIndex];
      
      setMatchedEntries(searchResults);
      setSelectedEntry(selected);
      setNotFound(false);
      
      // Process related field
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

  // Separate vulgar and colloquial entries
  const vulgarEntries = matchedEntries.filter(e => e.is_r18 === '1');
  const colloquialEntries = matchedEntries.filter(e => e.is_r18 === '0');

  return (
    <div className="min-h-screen bg-black text-white pb-20">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
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

        {/* Search */}
        <Search
          value={searchTerm}
          onChange={handleSearch}
          placeholder="imbecile"
        />

        {/* Results */}
        {loading && (
          <div className="text-center text-gray-400 mt-8">
            Loading data...
          </div>
        )}

        {!loading && selectedEntry && !isSwearing && (
          <div className="mt-2 space-y-2">
            {/* Green Card for Colloquial */}
            <GreenCard entry={selectedEntry} />

            {/* Related Terms */}
            <div className="flex flex-wrap gap-2">
              {relatedWords.map((word, index) => (
                <button
                  key={`related-${index}`}
                  onClick={() => handleWordClick(word)}
                  className="px-4 py-2 bg-[#c8ff00] text-black rounded-full text-sm 
                            hover:scale-105 transition-transform font-medium"
                >
                  {word}
                </button>
              ))}
              
              {matchedEntries
                .filter(e => e !== selectedEntry)
                .map((entry, index) => (
                  <button
                    key={`entry-${index}`}
                    onClick={() => handleEntryClick(entry)}
                    className="px-4 py-2 bg-[#c8ff00] text-black rounded-full text-sm 
                              hover:scale-105 transition-transform font-medium"
                  >
                    {entry.zhh}
                  </button>
                ))}
            </div>

            {/* Add Button with Drawer */}
            <div className="relative">
              <button
                onClick={() => setShowAddDrawer(true)}
                className="px-5 py-2 bg-gray-700 text-[#c8ff00] rounded-full text-sm 
                          hover:bg-gray-600 transition-colors font-medium"
              >
                add
              </button>
              
              {/* Add Word Drawer - Positioned to cover the button */}
              {showAddDrawer && (
                <AddWordDrawer
                  isOpen={showAddDrawer}
                  onClose={() => setShowAddDrawer(false)}
                />
              )}
            </div>
          </div>
        )}

        {!loading && selectedEntry && isSwearing && (
          <div className="mt-2 space-y-2">
            {/* Main Display Card - Green or Magenta depending on selection */}
            {selectedEntry.is_r18 === '1' ? (
              <MagentaCard entry={selectedEntry} />
            ) : (
              <GreenCard entry={selectedEntry} />
            )}

            {/* Related Colloquial Terms (Green pills) */}
            <div className="flex flex-wrap gap-2">
              {relatedWords.map((word, index) => (
                <button
                  key={`related-${index}`}
                  onClick={() => handleWordClick(word)}
                  className="px-4 py-2 bg-[#c8ff00] text-black rounded-full text-lg hover:scale-105 transition-transform font-medium"
                >
                  {word}
                </button>
              ))}
              
              {matchedEntries
                .filter(e => e !== selectedEntry && e.is_r18 !== '1')
                .map((entry, index) => (
                  <button
                    key={`entry-${index}`}
                    onClick={() => handleEntryClick(entry)}
                    className="px-4 py-2 bg-[#c8ff00] text-black rounded-full text-sm 
                              hover:scale-105 transition-transform font-medium"
                  >
                    {entry.zhh}
                  </button>
                ))}
            </div>

            {/* Swearing Toggle - Always visible when results found */}
            {!swearingToggle ? (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSwearingToggle(true)}
                  className="px-5 py-2 bg-[#ff0090] text-white rounded-full text-lg hover:bg-[#ff1a9f] transition-colors font-medium font-bold font-[Anton]"
                >
                  Swearing
                </button>
              </div>
            ) : (
              /* Vulgar Terms - Slide in from left to right */
              <div className="flex flex-wrap gap-2">
                {vulgarEntries.map((entry, index) => (
                  <button
                    key={`vulgar-${index}`}
                    onClick={() => handleEntryClick(entry)}
                    className="px-4 py-2 bg-[#ff0090] text-white rounded-full text-lg 
                              hover:scale-105 transition-transform font-medium
                              animate-slide-in"
                    style={{ animationDelay: `${index * 0.05}s` }}
                  >
                    {entry.zhh}
                  </button>
                ))}
              </div>
            )}

            {/* Add Button - Always below swearing content */}
            <div className="relative">
              <button
                onClick={() => setShowAddDrawer(true)}
                className="px-5 py-2 bg-gray-700 text-[#c8ff00] rounded-full text-lg hover:bg-gray-600 transition-colors font-medium font-[Anton] font-bold"
              >
                add
              </button>
              
              {/* Add Word Drawer - Positioned to cover the button */}
              {showAddDrawer && (
                <AddWordDrawer
                  isOpen={showAddDrawer}
                  onClose={() => setShowAddDrawer(false)}
                />
              )}
            </div>
          </div>
        )}

        {/* Not Found - Blue Card */}
        {!loading && notFound && searchTerm && (
          <BlueCard searchTerm={searchTerm} />
        )}

        {/* Footer */}
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

// Mock data
const mockData: LexemeEntry[] = [
  {
    id: '1',
    zhh: '死蠢',
    chs: '笨蛋',
    en: 'dumb',
    jyutping: 'sei2 ceon2',
    tags: 'Swearing',
    related: '蠢材/茂利/磨碌/豬頭炳/大番薯/人頭豬腦',
    is_r18: '1'
  },
  {
    id: '2',
    zhh: '蠢材',
    chs: '蠢货',
    en: 'imbecile',
    jyutping: 'ceon2 coi4',
    tags: 'Swearing',
    related: '死蠢/茂利/磨碌/豬頭炳/大番薯/人頭豬腦',
    is_r18: '1'
  },
  {
    id: '3',
    zhh: '茂利',
    chs: '笨蛋',
    en: 'incredibly stupid',
    jyutping: 'mau6 lei6',
    tags: 'Swearing',
    related: '死蠢/蠢材/磨碌/豬頭炳/大番薯/人頭豬腦',
    is_r18: '1'
  },
  {
    id: '4',
    zhh: '磨碌',
    chs: '没用',
    en: 'brain dead',
    jyutping: 'mo4 luk1',
    tags: 'Swearing',
    related: '死蠢/蠢材/茂利/豬頭炳/大番薯/人頭豬腦',
    is_r18: '1'
  },
  {
    id: '5',
    zhh: '豬頭炳',
    chs: '笨蛋',
    en: 'fool',
    jyutping: 'zyu1 tau4 bing2',
    tags: 'Swearing',
    related: '死蠢/蠢材/茂利/磨碌/大番薯/人頭豬腦',
    is_r18: '1'
  },
  {
    id: '6',
    zhh: '大番薯',
    chs: '蠢货',
    en: 'idiot',
    jyutping: 'daai6 faan1 syu4',
    tags: 'Swearing',
    related: '死蠢/蠢材/茂利/磨碌/豬頭炳/人頭豬腦',
    is_r18: '1'
  },
  {
    id: '7',
    zhh: '人頭豬腦',
    chs: '人头猪脑',
    en: 'moron',
    jyutping: 'jan4 tau4 zyu1 nou5',
    tags: 'Swearing',
    related: '死蠢/蠢材/茂利/磨碌/豬頭炳/大番薯',
    is_r18: '1'
  }
];