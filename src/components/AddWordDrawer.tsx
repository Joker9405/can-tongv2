import { useState, useRef, useEffect, type MouseEvent } from 'react';
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
      document.addEventListener('mousedown', handleClickOutside as any);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside as any);
    };
  }, [isOpen, onClose]);

  const handleAdd = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const zhh = inputValue.trim();
    if (!zhh || isSubmitting) return;

    setIsSubmitting(true);

    try {
      // 1) 先按 zhh 查重，避免重复插入
      const { data: existingData, error: existingError } = await supabase
        .from('lexeme_suggestions')
        .select('id')
        .eq('zhh', zhh)
        .limit(1);

      if (existingError) {
        console.error('Supabase select error:', existingError);
        return;
      }

      if (existingData && existingData.length > 0) {
        console.log('Duplicate entry, not added.');
        onClose();
        setInputValue('');
        setWordType('1');
        return;
      }

      // 2) 准备 payload：完全对齐你在 suggest.js 里用的字段
      const payload = {
        seed_q: null,                        // 这里没有 seed_q，就传 null
        zhh,
        zhh_pron: null,                      // 暂时没有发音，前端先传 null
        chs: '',                             // 先留空，后面后台再补也行
        en: '',
        source: 'add-drawer',               // 标记来源，方便你后面分析
        status: 'pending',
        created_at: new Date().toISOString(),
        is_r18: Number(wordType),           // "0"/"1" → 0/1
      };

      const { error } = await supabase
        .from('lexeme_suggestions')
        .insert([payload]);                 // 不要 .select(...)

      if (error) {
        console.error('Supabase insert error:', error);
        return;
      }

      // 3) 成功后重置
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
          {isSubmitting ? 'adding...' : 'go'}
        </button>
      </div>
    </div>
  );
}