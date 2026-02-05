import { useState, useEffect } from 'react';
import { Search } from './components/Search';
import { GreenCard } from './components/GreenCard';
import { MagentaCard } from './components/MagentaCard';
import { BlueCard } from './components/BlueCard';
import { AddWordDrawer } from './components/AddWordDrawer';
import supabase from './lib/supabaseClient';  // Ensure supabase client is imported

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
  const [isSubmitting, setIsSubmitting] = useState(false);  // State to manage adding state

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
    const v = String(raw ?? '').trim();
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
      return;
    }

    const queryEn = query.toLowerCase();

    const searchResults: LexemeEntry[] = lexemeData.filter(entry => {
      const chsTokens = splitTokens(entry.chs, false);
      const enTokens = splitTokens(entry.en, true);
      return chsTokens.includes(query) || enTokens.includes(queryEn);
    });

    if (searchResults.length > 0) {
      const selected = searchResults[Math.floor(Math.random() * searchResults.length)];
      setMatchedEntries(searchResults);
      setSelectedEntry(selected);
      setNotFound(false);
    } else {
      setMatchedEntries([]);
      setSelectedEntry(null);
      setRelatedWords([]);
      setNotFound(true);
    }
  };

  const handleAdd = async () => {
    setIsSubmitting(true);  // Show "adding..." state

    const word = selectedEntry?.zhh.trim();
    if (!word) {
      setIsSubmitting(false);
      return;
    }

    try {
      // Insert data into lexeme_suggestions
      const { data, error } = await supabase
        .from('lexeme_suggestions')
        .insert([
          {
            zhh: word,
            is_r18: selectedEntry.is_r18,
            chs: selectedEntry.chs,
            en: selectedEntry.en,
            owner_tag: '',
            register: '',
            intent: ''
          }
        ]);

      if (error) throw error;

      setIsSubmitting(false);  // Hide "adding..." state
      alert('Word added successfully');
    } catch (error) {
      console.error('Error inserting word: ', error);
      setIsSubmitting(false);  // Hide "adding..." state
    }
  };

  return (
    <div className="min-h-screen bg-black text-white pb-20">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-[#c8ff00]">Can-Tong</h1>
        </div>

        <Search value={searchTerm} onChange={handleSearch} placeholder="Search" />

        {selectedEntry && (
          <div className="mt-2 space-y-2">
            {selectedEntry.is_r18 === '1' ? (
              <MagentaCard entry={selectedEntry} />
            ) : (
              <GreenCard entry={selectedEntry} />
            )}

            <button onClick={handleAdd} disabled={isSubmitting} className="bg-gray-700 text-[#c8ff00] p-3 rounded-lg">
              {isSubmitting ? 'adding...' : 'add'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
