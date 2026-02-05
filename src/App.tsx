import { useState, useEffect } from 'react';
import { Search } from './components/Search';
import { GreenCard } from './components/GreenCard';
import { MagentaCard } from './components/MagentaCard';
import { BlueCard } from './components/BlueCard';
import { AddWordDrawer } from './components/AddWordDrawer';
import supabase from './lib/supabaseClient';

export interface LexemeEntry {
  id?: string;          // 对应 id 字段
  zhh: string;          // 对应 zhh 字段
  zhh_pron: string;     // 对应 zhh_pron（粤拼）字段
  is_r18: '0' | '1';    // 对应 is_r18 字段
  chs: string;          // 对应 chs 字段
  en: string;           // 对应 en 字段
  owner_tag?: string;   // 对应 owner_tag 字段
  register?: string;    // 对应 register 字段
  intent?: string;      // 对应 intent 字段
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
  const [isSubmitting, setIsSubmitting] = useState(false);  // New state for "adding..." effect

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
    const v = String(raw ?? '')
      .replace(/^\uFEFF/, '')
      .trim()
      .replace(/^"+|"+$/g, '');
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
      setSwearingToggle(false);
      return;
    }

    const queryEn = query.toLowerCase();

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

  const handleAdd = async () => {
    setIsSubmitting(true);  // Show loading state

    const word = selectedEntry?.zhh.trim();
    if (!word || isSubmitting) return;

    try {
      const { data: existingData } = await supabase
        .from('lexeme_suggestions')
        .select('*')
        .eq('zhh', word)
        .single();

      if (existingData) {
        setIsSubmitting(false);
        return alert('Duplicate entry, not added.');
      }

      const { data, error } = await supabase
        .from('lexeme_suggestions')
        .insert([
          {
            zhh: word,
            is_r18: selectedEntry?.is_r18,  // 1 or 0 based on word type
            chs: selectedEntry?.chs || '',
            en: selectedEntry?.en || '',
            owner_tag: '',
            register: '',
            intent: ''
          }
        ]);

      if (error) throw error;

      setInputValue('');  // Clear input after successful add
      setShowAddDrawer(false); // Close the drawer
    } catch (error) {
      console.error("Error inserting word: ", error);
    } finally {
      setIsSubmitting(false);  // Hide loading state
    }
  };

  return (
    <div className="min-h-screen bg-black text-white pb-20">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Existing UI and structure remains the same */}
      </div>
    </div>
  );
}
