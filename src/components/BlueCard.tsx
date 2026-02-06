import { useState, useRef, useEffect, type MouseEvent } from "react";
import { Volume2 } from "lucide-react";
import supabase from "../lib/supabaseClient";

interface BlueCardProps {
  searchTerm: string;
}

export function BlueCard({ searchTerm }: BlueCardProps) {
  const [showDrawer, setShowDrawer] = useState(false);
  const [wordType, setWordType] = useState<"0" | "1">("0"); // 0=colloquial(green), 1=vulgar(magenta)
  const [inputValue, setInputValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  // 判断字符串是否主要是中文
  const isChinese = (text: string): boolean => {
    return /[\u4e00-\u9fa5]/.test(text);
  };

  // 判断字符串是否主要是英文（包含字母）
  const isEnglish = (text: string): boolean => {
    return /[a-zA-Z]/.test(text) && !/[\u4e00-\u9fa5]/.test(text);
  };

  // Revise 抽屉里的 add/go 按钮逻辑：查重 + 插入 + adding... 状态
  const handleAdd = async (event: MouseEvent<HTMLButtonElement>) => {
    // 防止触发表单 submit，避免跟随 search
    event.preventDefault();
    event.stopPropagation();

    const zhh = inputValue.trim();
    if (!zhh || isSubmitting) return;

    setIsSubmitting(true);

    try {
      // 1) 先按 zhh 查重
      const { data: existingData, error: existingError } = await supabase
        .from("lexeme_suggestions")
        .select("id")
        .eq("zhh", zhh)
        .limit(1);

      if (existingError) {
        console.error("Supabase select error:", existingError);
        return;
      }

      if (existingData && existingData.length > 0) {
        console.log("Duplicate entry, not added.");
        setShowDrawer(false);
        setInputValue("");
        setWordType("0");
        return;
      }

      // 2) 根据 searchTerm 判断是中文还是英文，填充到对应字段
      // 如果 searchTerm 是中文，填到 chs；如果是英文，填到 en
      let chs = "";
      let en = "";
      const trimmedSearchTerm = searchTerm.trim();
      
      if (trimmedSearchTerm) {
        if (isChinese(trimmedSearchTerm)) {
          chs = trimmedSearchTerm; // 搜索词是中文，填到 chs
        } else if (isEnglish(trimmedSearchTerm)) {
          en = trimmedSearchTerm; // 搜索词是英文，填到 en
        } else {
          // 混合或其他情况，优先填到 chs（作为标签）
          chs = trimmedSearchTerm;
        }
      }

      // 3) payload：完全对齐 suggest.js 的结构，移除 created_at（数据库可能自动生成）
      const payload = {
        seed_q: searchTerm || null,          // 把当前查询词作为 seed_q 记录下来
        zhh,
        zhh_pron: null,
        chs: chs || "",                      // 根据搜索词填充
        en: en || "",                        // 根据搜索词填充
        source: "revise-bluecard",
        status: "pending",
        is_r18: Number(wordType),
      };

      const { error } = await supabase
        .from("lexeme_suggestions")
        .insert([payload]);                 // 不要 .select(...)

      if (error) {
        console.error("Supabase insert error:", error);
        return;
      }

      setShowDrawer(false);
      setInputValue("");
      setWordType("0");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 发音按钮
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

          {/* Revise Drawer */}
          {showDrawer && (
            <div
              ref={drawerRef}
              className="absolute top-full left-4 right-4 -mt-16 bg-[#000080] rounded-[28px] p-8 p-6"
            >
              {/* Type Selector */}
              <div className="flex gap-3 mb-6 -pl-20 -pt-20">
                <button
                  onClick={() => setWordType("0")}
                  className="relative w-8 h-8 rounded-full bg-[#c8ff00] flex items-center justify-center
                             hover:scale-110 transition-transform"
                  aria-label="Colloquial term"
                  type="button"
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
                  placeholder=""
                  className="w-full bg-transparent text-white text-4xl text-center
                            focus:outline-none placeholder:text-blue-400/50"
                  autoFocus
                />
              </div>

              {/* Add Button */}
              <div className="flex justify-end -pr-20 -pb-20">
                <button
                  type="button"
                  onClick={handleAdd}
                  className="px-8 py-3 bg-black text-[#c8ff00] rounded-full text-xl hover:scale-105 transition-transform font-[Anton] font-bold"
                  disabled={isSubmitting}
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