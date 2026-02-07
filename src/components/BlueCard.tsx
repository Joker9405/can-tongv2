import { useState, useRef, useEffect } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { Volume2 } from "lucide-react";
import supabase from "../lib/supabaseClient";

interface BlueCardProps {
  searchTerm: string;
}

function logSupabaseError(label: string, error: any) {
  console.error(label, {
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
    code: error?.code,
  });
}

export function BlueCard({ searchTerm }: BlueCardProps) {
  const [showDrawer, setShowDrawer] = useState(false);
  const [wordType, setWordType] = useState<"0" | "1">("0"); // 0=green, 1=pink
  const [inputValue, setInputValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  const handleAdd = async (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const word = inputValue.trim();
    if (!word || isSubmitting) return;

    setIsSubmitting(true);

    try {
      // 1) 查重：避免重复插入（按 word 字段）
      const { data: existingData, error: existingError } = await supabase
        .from("lexeme_suggestions")
        .select("id")
        .eq("word", word)
        .limit(1);

      if (existingError) {
        logSupabaseError("Supabase duplicate-check error:", existingError);
        return;
      }

      if (existingData && existingData.length > 0) {
        console.log("[lexeme_suggestions] duplicated:", word);
        setShowDrawer(false);
        setInputValue("");
        setWordType("0");
        return;
      }

      // 2) 插入（保持 columns=word,is_r18,status 的路径一致性：只传这 3 个字段）
      const payload = {
        word,
        is_r18: Number(wordType),
        status: "pending",
      };

      const { error } = await supabase
        .from("lexeme_suggestions")
        .insert([payload])
        .select("word,is_r18,status");

      if (error) {
        logSupabaseError("Supabase insert error:", error);
        return;
      }

      // 3) 成功后重置
      setShowDrawer(false);
      setInputValue("");
      setWordType("0");
    } finally {
      setIsSubmitting(false);
    }
  };

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
        <div className="bg-[#0000ff] rounded-[28px] p-8 relative">
          <div className="text-center">
            <h2 className="text-6xl font-bold text-white mb-2">{searchTerm}</h2>
            <p className="text-lg text-gray-300">sei2 ceon2</p>
          </div>

          <button
            onClick={handleSpeak}
            className="absolute bottom-4 right-4 w-12 h-12 bg-black rounded-full 
                       flex items-center justify-center hover:scale-110 transition-transform"
            aria-label="Play pronunciation"
            type="button"
          >
            <Volume2 className="w-6 h-6 text-white" />
          </button>

          {!showDrawer && (
            <button
              onClick={() => setShowDrawer(true)}
              className="absolute bottom-4 left-4 px-5 py-2 bg-[#1e40af] text-[#ffffff] rounded-full text-lg hover:bg-[#1e4ea8] transition-colors font-medium font-[Anton] font-bold"
              type="button"
            >
              Revise
            </button>
          )}

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
                  type="button"
                >
                  {wordType === "0" && <div className="w-4 h-4 rounded-full bg-black"></div>}
                </button>

                <button
                  onClick={() => setWordType("1")}
                  className="relative w-8 h-8 rounded-full bg-[#ff0090] flex items-center justify-center
                             hover:scale-110 transition-transform"
                  aria-label="Vulgar term"
                  type="button"
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
