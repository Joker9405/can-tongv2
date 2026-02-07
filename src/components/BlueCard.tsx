import { useState, useRef, useEffect, MouseEvent } from "react";
import { Volume2 } from "lucide-react";
import supabase from "../lib/supabaseClient";

interface BlueCardProps {
  searchTerm: string;
}

export function BlueCard({ searchTerm }: BlueCardProps) {
  const [showDrawer, setShowDrawer] = useState(false);
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
        setShowDrawer(false);
      }
    };

    if (showDrawer) {
      document.addEventListener("mousedown", handleClickOutside as any);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside as any);
    };
  }, [showDrawer]);

  // 修复后的 add 按钮逻辑
  const handleAdd = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const word = inputValue.trim();
    if (!word || isSubmitting) return;

    setIsSubmitting(true);

    try {
      // 1）先查重，避免重复插入（使用 zhh 字段检查）
      const { data: existingData, error: existingError } = await supabase
        .from("lexeme_suggestions")
        .select("id")
        .eq("zhh", word)
        .limit(1);

      if (existingError) {
        console.error("Supabase select error:", existingError);
        setIsSubmitting(false);
        return;
      }

      if (existingData && existingData.length > 0) {
        console.log("Duplicate entry, not added.");
        alert("这个词已经存在了！");
        setIsSubmitting(false);
        return;
      }

      // 2）准备完整的数据 payload
      const payload = {
        zhh: word, // 粤语词汇
        is_r18: Number(wordType), // "0" / "1" → 0 / 1
        chs: "", // 简体中文（可以根据需要添加输入框）
        en: "", // 英文翻译（可以根据需要添加输入框）
        source: "user_suggestion", // 来源标识
        status: "pending", // 状态
        created_at: new Date().toISOString(),
      };

      // 3）插入 lexeme_suggestions，并 select 指定字段以在 Network 中显示 columns
      const { data, error } = await supabase
        .from("lexeme_suggestions")
        .insert([payload])
        .select("zhh, is_r18, chs, en, source, status"); // 添加 select 以确保 Network 面板显示正确的路径

      if (error) {
        console.error("Supabase insert error:", error);
        setIsSubmitting(false);
        return;
      }

      console.log("Insert successful:", data);
      
      // 4）成功后重置状态并关闭抽屉
      setShowDrawer(false);
      setInputValue("");
      setWordType("0");
      
      // 可以添加成功提示
      alert("词汇已成功提交！");
      
    } catch (error) {
      console.error("Unexpected error:", error);
    } finally {
      // 无论成功/失败，都恢复按钮状态
      setIsSubmitting(false);
    }
  };

  // 原来就有的发音按钮逻辑
  const handleSpeak = () => {
    if ("speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(searchTerm);
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
            type="button"
          >
            <Volume2 className="w-6 h-6 text-white" />
          </button>

          {/* Revise Button - Bottom Left, inside corner */}
          {!showDrawer && (
            <button
              onClick={() => setShowDrawer(true)}
              className="absolute bottom-4 left-4 px-5 py-2 bg-[#1e40af] text-[#ffffff] rounded-full text-lg hover:bg-[#1e4ea8] transition-colors font-medium font-[Anton] font-bold"
              type="button"
            >
              Revise
            </button>
          )}

          {/* Revise Drawer - Positioned below, width from left edge to right edge within card padding */}
          {showDrawer && (
            <div
              ref={drawerRef}
              className="absolute top-full left-4 right-4 -mt-16 bg-[#000080] rounded-[28px] p-8"
            >
              {/* Type Selector - Top Left at corner */}
              <div className="flex gap-3 mb-6 -pl-20 -pt-20">
                <button
                  onClick={() => setWordType("0")}
                  className="relative w-8 h-8 rounded-full bg-[#c8ff00] flex items-center justify-center
                             hover:scale-110 transition-transform"
                  aria-label="Colloquial term"
                  type="button"
                  disabled={isSubmitting}
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
                  type="button"
                  disabled={isSubmitting}
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
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="输入粤语词汇..."
                  className="w-full bg-transparent text-white text-4xl text-center
                            focus:outline-none placeholder:text-blue-400/50"
                  autoFocus
                  disabled={isSubmitting}
                />
              </div>

              {/* Add Button - Bottom Right at corner */}
              <div className="flex justify-end -pr-20 -pb-20">
                <button
                  type="button"
                  onClick={handleAdd}
                  className="px-8 py-3 bg-black text-[#c8ff00] rounded-full text-xl hover:scale-105 transition-transform font-[Anton] font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isSubmitting || !inputValue.trim()}
                >
                  {isSubmitting ? "adding..." : "go"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}