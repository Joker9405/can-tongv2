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
    // 1）先查重
    console.log('检查重复...');
    const { data: existingData, error: existingError } = await supabase
      .from('lexeme_suggestions')
      .select("word,is_r18,status")
      .eq('zhh', word)
      .limit(1);

    if (existingError) {
      console.error('查询重复时出错:', existingError);
      setIsSubmitting(false);
      return;
    }

    if (existingData && existingData.length > 0) {
      console.log('词汇已存在');
      setIsSubmitting(false);
      return;
    }

    // 2）准备完整的数据
    const payload = {
      zhh: word,           // 粤语词汇
      chs: searchTerm || "", // 简体中文（使用搜索词或空）
      en: "",              // 英文翻译
      is_r18: wordType === "1" ? 1 : 0,
      status: 'pending',
      source: "user_suggestion",
      created_at: new Date().toISOString(),
    };

    console.log('插入数据:', payload);

    // 3）插入数据 - 确保只调用 insert
    const { data, error } = await supabase
      .from('lexeme_suggestions')
      .insert([payload]); // 不要链式调用 select

    if (error) {
      console.error('插入失败:', error);
      console.error('完整错误:', JSON.stringify(error, null, 2));
      setIsSubmitting(false);
      return;
    }

    console.log('插入成功:', data);
    
    // 4）成功后重置
    setInputValue('');
    setWordType('1');
    onClose();
    
    console.log("数据已写入 lexeme_suggestions 表");
    
  } catch (error) {
    console.error('意外错误:', error);
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
          placeholder=" "
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