import { useState, useRef, useEffect } from "react";
import supabase from "../lib/supabaseClient";

interface AddWordDrawerProps {
  searchTerm: string;
  isOpen: boolean;
  onClose: () => void;
}

export function AddWordDrawer({ searchTerm, isOpen, onClose }: AddWordDrawerProps) {
  const [wordType, setWordType] = useState<"0" | "1">("0"); // 0=colloquial(green), 1=vulgar(magenta)
  const [inputValue, setInputValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false); // 按钮"adding..."状态
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        drawerRef.current &&
        !drawerRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  const handleAdd = async () => {
    const word = inputValue.trim();
    if (!word || isSubmitting) return;

    setIsSubmitting(true);

    try {
      // 1）先查重，避免重复插入（使用 zhh 字段检查）
      const { data: existingData, error: existingError } = await supabase
        .from('lexeme_suggestions')
        .select('id')
        .eq('zhh', word)
        .limit(1);

      if (existingError) {
        console.error('Supabase select error:', existingError);
        return;
      }

      if (existingData && existingData.length > 0) {
        console.log('Duplicate entry, not added.');
        alert('这个词已经存在了！');
        setIsSubmitting(false);
        return;
      }

      // 2）准备完整的数据 payload
      const payload = {
        zhh: word, // 粤语词汇
        is_r18: Number(wordType), // "0" / "1" → 0 / 1
        chs: "", // 简体中文
        en: "", // 英文翻译
        source: "user_suggestion",
        status: 'pending',
        created_at: new Date().toISOString(),
      };

      // 3）插入 lexeme_suggestions，并 select 指定字段
      const { data, error } = await supabase
        .from('lexeme_suggestions')
        .insert([payload])
        .select('zhh, is_r18, chs, en, source, status'); // 添加 select 以确保 Network 面板显示正确的路径

      if (error) {
        console.error('Supabase insert error:', error);
        setIsSubmitting(false);
        return;
      }

      console.log('Insert successful:', data);
      
      // 4）成功后重置状态并关闭抽屉
      setInputValue('');
      setWordType('1');
      onClose();
      
      // 可以添加成功提示
      alert('词汇已成功提交！');
      
    } catch (error) {
      console.error('Unexpected error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      ref={drawerRef}
      className="absolute top-0 left-0 bg-[#3a3a3a] w-full rounded-[28px] p-6 z-10"
    >
      {/* Type Selector - Top Left at corner radius center */}
      <div className="flex gap-3 mb-6 -pr-20 -pb-20">
        <button
          onClick={() => setWordType('0')}
          className="relative w-8 h-8 rounded-[28px] bg-[#c8ff00] flex items-center justify-center hover:scale-110 transition-transform disabled:opacity-50"
          aria-label="Green term"
          type="button"
          disabled={isSubmitting}
        >
          {wordType === '0' && <div className="w-4 h-4 rounded-[28px] bg-black"></div>}
        </button>

        <button
          onClick={() => setWordType('1')}
          className="relative w-8 h-8 rounded-[28px] bg-[#ff0090] flex items-center justify-center hover:scale-110 transition-transform disabled:opacity-50"
          aria-label="Pink term"
          type="button"
          disabled={isSubmitting}
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
          placeholder="输入粤语词汇..."
          className="w-full bg-transparent text-white text-4xl text-center focus:outline-none placeholder:text-gray-600 disabled:opacity-50"
          autoFocus
          disabled={isSubmitting}
        />
      </div>

      {/* Add Button - Bottom Right at corner radius center */}
      <div className="flex justify-end -pr-20 -pb-20">
        <button
          onClick={handleAdd}
          className="px-6 py-3 bg-black text-[#c8ff00] rounded-[28px] text-xl font-bold hover:scale-105 transition-transform font-[Anton] disabled:opacity-50 disabled:cursor-not-allowed"
          type="button"
          disabled={isSubmitting || !inputValue.trim()}
        >
          {isSubmitting ? 'adding...' : 'go'}
        </button>
      </div>
    </div>
  );
}