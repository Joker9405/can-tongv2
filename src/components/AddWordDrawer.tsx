import { useState, useRef, useEffect } from "react";
import { Volume2 } from "lucide-react";
import supabase from "../lib/supabaseClient";

interface BlueCardProps {
  searchTerm: string;
}

export function BlueCard({ searchTerm }: BlueCardProps) {
  const [showDrawer, setShowDrawer] = useState(false);
  const [wordType, setWordType] = useState<"0" | "1">("0"); // 0=colloquial(green), 1=vulgar(magenta)
  const [inputValue, setInputValue] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        drawerRef.current &&
        !drawerRef.current.contains(event.target as Node)
      ) {
        setShowDrawer(false);
      }
    };

    if (showDrawer) {
      document.addEventListener(
        "mousedown",
        handleClickOutside,
      );
    }

    return () => {
      document.removeEventListener(
        "mousedown",
        handleClickOutside,
      );
    };
  }, [showDrawer]);

  const handleAdd = async () => {
    const word = inputValue.trim();
    if (!word || isAdding) return;

    setIsAdding(true);
    setError(null);

    try {
      // 检查是否存在重复数据（基于word字段）
      const { data: existingData, error: checkError } = await supabase
        .from('lexeme_suggestions')
        .select('word')
        .eq('word', word)
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') {
        // PGRST116是"未找到数据"的错误，这是正常的
        throw checkError;
      }

      if (existingData) {
        const errorMsg = '该词汇已存在于lexeme_suggestions表中';
        setError(errorMsg);
        setIsAdding(false);
        return;
      }

      // 准备要插入的数据
      const insertData: any = {
        word: word,
        is_r18: Number(wordType),
        status: 'pending',
      };

      // 构建查询参数，用于在Network面板中显示正确的路径
      const columns = ['word', 'is_r18', 'status'];

      // 插入数据到lexeme_suggestions表
      // 使用select()来确保在Network面板中显示正确的路径
      // 这会在F12控制台中显示类似: lexeme_suggestions?columns=word,is_r18,status
      const { data, error: insertError } = await supabase
        .from('lexeme_suggestions')
        .insert(insertData)
        .select(columns.join(','));

      if (insertError) {
        throw insertError;
      }

      // 成功插入
      console.log('数据成功插入:', data);
      setShowDrawer(false);
      setInputValue("");
      setWordType("0");
    } catch (err: any) {
      const errorMsg = err.message || '插入数据失败';
      setError(errorMsg);
      console.error('插入数据错误:', err);
    } finally {
      setIsAdding(false);
    }
  };

  const handleSpeak = () => {
    if ("speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(
        searchTerm,
      );
      utterance.lang = "zh-HK";
      speechSynthesis.speak(utterance);
    }
  };

  return (
    <>
      <div className="mt-2 space-y-2">
        {/* AI Generated Blue Card */}
        <div className="bg-[#0000ff] rounded-[28px] p-8 relative">
          <div className="text-center">
            <h2 className="text-6xl font-bold text-white mb-2">
              {searchTerm}
            </h2>
            <p className="text-lg text-gray-300">sei2 ceon2</p>
          </div>

          {/* Speaker Button - Bottom Right, inside corner, white icon */}
          <button
            onClick={handleSpeak}
            className="absolute bottom-4 right-4 w-12 h-12 bg-black rounded-full 
                       flex items-center justify-center hover:scale-110 transition-transform"
            aria-label="Play pronunciation"
          >
            <Volume2 className="w-6 h-6 text-white" />
          </button>

          {/* Revise Button - Bottom Left, inside corner */}
          {!showDrawer && (
            <button
              onClick={() => setShowDrawer(true)}
              className="absolute bottom-4 left-4 px-5 py-2 bg-[#1e40af] text-[#ffffff] rounded-full text-lg hover:bg-[#1e4ea8] transition-colors font-medium font-[Anton] font-bold"
            >
              Revise
            </button>
          )}

          {/* Revise Drawer - Positioned below, width from left edge to right edge within card padding */}
          {showDrawer && (
            <div
              ref={drawerRef}
              className="absolute top-full left-4 right-4 -mt-16 bg-[#000080] rounded-[28px] p-8 p-6"
            >
              {/* Type Selector - Top Left at corner */}
              <div className="flex gap-3 mb-6 -pl-20 -pt-20">
                <button
                  onClick={() => setWordType("0")}
                  className="relative w-8 h-8 rounded-full bg-[#c8ff00] flex items-center justify-center
                             hover:scale-110 transition-transform"
                  aria-label="Colloquial term"
                >
                  {wordType === "0" && (
                    <div className="w-4 h-4 rounded-full bg-black"></div>
                  )}
                </button>

                <button
                  onClick={() => setWordType("1")}
                  className="relative w-8 h-8 rounded-full bg-[#ff0090] flex items-center justify-center
                             hover:scale-110 transition-transform"
                  aria-label="Vulgar term"
                >
                  {wordType === "1" && (
                    <div className="w-4 h-4 rounded-full bg-black"></div>
                  )}
                </button>
              </div>

              {/* Large Text Input */}
              <div className="mb-6">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) =>
                    setInputValue(e.target.value)
                  }
                  placeholder=""
                  className="w-full bg-transparent text-white text-4xl text-center
                            focus:outline-none placeholder:text-blue-400/50"
                  autoFocus
                />
              </div>

              {/* Add Button - Bottom Right at corner */}
              <div className="flex justify-end -pr-20 -pb-20">
                <button
                  onClick={handleAdd}
                  disabled={isAdding}
                  className="px-8 py-3 bg-black text-[#c8ff00] rounded-full text-xl hover:scale-105 transition-transform font-[Anton] font-bold disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isAdding ? 'adding...' : 'add'}
                </button>
              </div>
              {error && (
                <div className="text-red-400 text-sm mt-2 text-center">
                  {error}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}