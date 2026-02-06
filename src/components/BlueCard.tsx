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
  const [isSubmitting, setIsSubmitting] = useState(false); // 按钮“adding...”状态
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
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showDrawer]);

  // Revise 抽屉里的 add/go 按钮逻辑：查重 + 插入 + adding... 状态
  const handleAdd = async () => {
    const word = inputValue.trim();

    // 空字符串或正在提交时，直接返回，避免重复点击
    if (!word || isSubmitting) return;

    setIsSubmitting(true);

    try {
      // 1）先查重，避免重复插入（这里用的是 lexeme_suggestions 的 word 字段）
      const { data: existingData, error: existingError } = await supabase
        .from("lexeme_suggestions")
        .select("id")
        .eq("word", word)
        .limit(1);

      if (existingError) {
        console.error("Supabase select error:", existingError);
        return;
      }

      if (existingData && existingData.length > 0) {
        console.log("Duplicate entry, not added.");
        // 这里选择关闭抽屉并清空输入，你也可以改成只提示不关闭
        setShowDrawer(false);
        setInputValue("");
        setWordType("0");
        return;
      }

      // 2）准备插入 payload（与 AddWordDrawer 保持一致）
      const payload = {
        word,
        is_r18: Number(wordType), // "0" / "1" → 0 / 1
        status: "pending",
      };

      // 3）插入 lexeme_suggestions，并 select 一下字段，方便在 Network 里看到 columns/select
      const { error } = await supabase
        .from("lexeme_suggestions")
        .insert([payload]); // 不要再链式 .select(...)

      if (error) {
        console.error("Supabase insert error:", error);
        return;
      }

      // 4）成功后重置状态并关闭抽屉
      setShowDrawer(false);
      setInputValue("");
      setWordType("0");
    } finally {
      // 无论成功/失败，都恢复按钮状态
      setIsSubmitting(false);
    }
  };

  // 原来就有的发音按钮逻辑，补回来
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
                  onChange={(e) => setInputValue(e.target.value)}
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