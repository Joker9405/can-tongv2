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

  const handleAdd = async (isRevise: boolean = false) => {
    const word = inputValue.trim();
    if (!word || isSubmitting) return;

    setIsSubmitting(true);

    try {
        // 创建提交数据的 payload，确保所有必要字段都包含在内
        const payload = {
            word,
            is_r18: Number(wordType),  // 假设 wordType 用来判断是否是粗俗语言
            status: 'pending',  // 假设状态为 'pending'，如果有其他状态需求请修改
        };

        // 将新词条插入到 lexeme_suggestions 表
        const { data, error } = await supabase
            .from('lexeme_suggestions')
            .insert([payload]);

        // 检查插入过程中是否有错误
        if (error) {
            console.error('插入数据时发生错误:', error);
            throw error;
        }

        // 输出成功插入的数据到控制台
        console.log('成功插入的数据:', data);

        // 提交成功后重置输入框和状态
        setInputValue('');
        setIsSubmitting(false);
        
        if (!isRevise) {
            // 如果是普通添加，不是修订，可以在这里处理相关逻辑
        }
    } catch (error) {
        console.error('handleAdd 函数中的错误:', error);
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
