import { useState, useRef, useEffect } from 'react';
import supabase from '../lib/supabaseClient';

interface AddWordDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddWordDrawer({ isOpen, onClose }: AddWordDrawerProps) {
  const [wordType, setWordType] = useState<'0' | '1'>('1'); // 0=green, 1=pink
  const [inputValue, setInputValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  const handleAdd = async () => {
    const zhh = inputValue.trim();
    if (!zhh || isSubmitting) return;

    setIsSubmitting(true);

    try {
      // 1) 先检查是否已存在相同 zhh，避免重复插入
      const { data: existingData, error: existingError } = await supabase
        .from('lexeme_suggestions')
        .select('id')
        .eq('zhh', zhh)
        .limit(1);

      if (existingError) {
        console.error('Supabase duplicate check error:', existingError);
        return;
      }

      if (existingData && existingData.length > 0) {
        console.warn('Duplicate entry, not added.');
        return;
      }

      // 2) 插入 lexeme_suggestions
      const payload = {
        zhh,
        is_r18: Number(wordType), // 0 = green, 1 = pink
        chs: '',
        en: '',
        source: 'revise-ui',
        status: 'pending',
      };

      const { error } = await supabase
        .from('lexeme_suggestions')
        .insert([payload])
        // 触发 REST 路径中带 columns=...，方便在 Network 面板中确认
        .select('zhh,is_r18,chs,en,source,status');

      if (error) {
        console.error('Supabase insert error:', error);
        return;
      }

      // Reset form
      setInputValue('');
      setWordType('1');
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      ref={drawerRef}
      className="absolute top-0 left-0 bg-[#3a3a3a] w-full rounded-[28px] p-8 p-6 z-10"
    >
      {/* Type Selector - Top Left at corner radius center */}
      <div className="flex gap-3 mb-6 -pr-20 -pb-20">
        <button
          onClick={() => setWordType('0')}
          className="relative w-8 h-8 rounded-[28px] bg-[#c8ff00] flex items-center justify-center hover:scale-110 transition-transform"
          aria-label="Green term"
          type="button"
        >
          {wordType === '0' && <div className="w-4 h-4 rounded-[28px] bg-black"></div>}
        </button>

        <button
          onClick={() => setWordType('1')}
          className="relative w-8 h-8 rounded-[28px] bg-[#ff0090] flex items-center justify-center hover:scale-110 transition-transform"
          aria-label="Pink term"
          type="button"
        >
          {wordType === '1' && <div className="w-4 h-4 rounded-[28px] bg-black"></div>}
        </button>
      </div>

      {/* Large Text Input */}
      <div className="mb-6">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder=""
          className="w-full bg-transparent text-white text-4xl text-center focus:outline-none placeholder:text-gray-600"
          autoFocus
        />
      </div>

      {/* Add Button - Bottom Right at corner radius center */}
      <div className="flex justify-end -pr-20 -pb-20">
        <button
          onClick={handleAdd}
          className="px-6 py-3 bg-black text-[#c8ff00] rounded-[28px] text-xl font-bold hover:scale-105 transition-transform font-[Anton]"
          type="button"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'adding...' : 'add'}
        </button>
      </div>
    </div>
  );
}
