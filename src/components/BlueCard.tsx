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
      if (drawerRef.current && !drawerRef.current.contains(event.target as Node)) {
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

  // Revise 抽屉里的 add/go 按钮逻辑：插入 + adding... 状态
  const handleAdd = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const word = inputValue.trim();

    if (!word || isSubmitting) return;

    setIsSubmitting(true);

    try {
      const isChineseQuery = /[\u4E00-\u9FFF]/.test(searchTerm);
      const { data, error } = await supabase.rpc("upsert_lexeme_suggestion", {
        p_word: word,
        p_is_r18: Number(wordType) || 0,
        p_chs: isChineseQuery ? searchTerm : null,
        p_en: isChineseQuery ? null : searchTerm,
        p_source: "web",
      });

      if (error) {
        // 只在 Console 打印真实原因，前端不显示 DB 错误串
        console.error("upsert_lexeme_suggestion failed:", error);
        console.error("upsert_lexeme_suggestion failed(full):", JSON.stringify(error, null, 2));
        return;
      }

      console.log("upsert ok:", data);

      setShowDrawer(false);
      setInputValue("");
      setWordType("0");
    } catch (e) {
      console.error("Unexpected error:", e);
    } finally {
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
            <h2 className="text-6xl font-bold text-white mb-2">{searchTerm}</h2>
            <p className="text-lg text-gray-300">sei2 ceon2</p>
          </div>

          {/* Speaker Button */}
          <button
            onClick={handleSpeak}
            className="absolute bottom-4 right-4 w-12 h-12 bg-black rounded-full 
                       flex items-center justify-center hover:scale-110 transition-transform"
            aria-label="Play pronunciation"
          >
            <Volume2 className="w-6 h-6 text-white" />
          </button>

          {/* Revise Button */}
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
              <div className="flex gap-3 mb-6 -pl-20 -pt-20">
                <button
                  onClick={() => setWordType("0")}
                  className="relative w-8 h-8 rounded-full bg-[#c8ff00] flex items-center justify-center
                             hover:scale-110 transition-transform"
                  aria-label="Colloquial term"
                >
                  {wordType === "0" && <div className="w-4 h-4 rounded-full bg-black"></div>}
                </button>

                <button
                  onClick={() => setWordType("1")}
                  className="relative w-8 h-8 rounded-full bg-[#ff0090] flex items-center justify-center
                             hover:scale-110 transition-transform"
                  aria-label="Vulgar term"
                >
                  {wordType === "1" && <div className="w-4 h-4 rounded-full bg-black"></div>}
                </button>
              </div>

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
