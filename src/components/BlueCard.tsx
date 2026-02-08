import { useState, useRef, useEffect } from "react";
import { Volume2 } from "lucide-react";
import supabase from "../lib/supabaseClient";

interface BlueCardProps {
  searchTerm: string;
}

// merge values like "a/b/c" without duplicates
const mergeSlashList = (current: string | null, incoming: string | null) => {
  const next = (incoming ?? "").trim();
  if (!next) return current;
  const items = (current ?? "")
    .split("/")
    .map((x) => x.trim())
    .filter(Boolean);
  if (!items.includes(next)) items.push(next);
  return items.length ? items.join("/") : null;
};

export function BlueCard({ searchTerm }: BlueCardProps) {
  const [showDrawer, setShowDrawer] = useState(false);
  const [wordType, setWordType] = useState<"0" | "1">("0"); // 0=colloquial(green), 1=vulgar(magenta)
  const [inputValue, setInputValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
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

  // Handle the add button submission
  const handleAdd = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const inputWord = inputValue.trim();

    if (!inputWord || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Determine if input is Chinese (Han) or Latin characters
      const hasHan = /[\u4E00-\u9FFF]/.test(inputWord);
      const hasLatin = /[A-Za-z]/.test(inputWord);

      // Map to appropriate columns based on input language
      const chsVal = hasHan ? inputWord : null;
      const enVal = (hasLatin && !hasHan) ? inputWord : (hasLatin && hasHan ? inputWord : null);

      const payload: any = {
        zhh: inputWord,  // 关键：使用 zhh 作为主字段（词汇本身）
        is_r18: Number(wordType),
        status: "pending",
        chs: chsVal,     // 中文翻译/同义词
        en: enVal,       // 英文翻译/同义词
        source: "web",
      };

      // Try to insert first
      const { data, error } = await supabase
        .from("lexeme_suggestions")
        .insert([payload])
        .select("id,zhh,is_r18,status,chs,en,source");

      if (error) {
        // Handle duplicate constraint (23505) or conflict (409)
        if ((error as any).code === "23505" || (error as any).status === 409) {
          console.log("Duplicate detected, attempting merge...");
          
          const { data: existing, error: readErr } = await supabase
            .from("lexeme_suggestions")
            .select("id,zhh,is_r18,status,chs,en,source")
            .eq("zhh", inputWord)
            .maybeSingle();

          if (readErr || !existing) {
            console.error("Read existing failed:", readErr || "not found");
            setSubmitError("Failed to read existing entry");
            return;
          }

          // Merge the fields
          const mergedChs = mergeSlashList(existing.chs ?? null, chsVal);
          const mergedEn = mergeSlashList(existing.en ?? null, enVal);
          const mergedR18 = Math.max(Number(existing.is_r18 ?? 0), Number(wordType));

          const { data: upd, error: updErr } = await supabase
            .from("lexeme_suggestions")
            .update({ chs: mergedChs, en: mergedEn, is_r18: mergedR18 })
            .eq("id", existing.id)
            .select("id,zhh,is_r18,status,chs,en,source");

          if (updErr) {
            console.error("Merge update failed:", updErr);
            setSubmitError("Failed to merge entry");
            return;
          }

          console.log("Merge success:", upd);
        } else {
          console.error("Insert failed:", error);
          setSubmitError(error.message || "Failed to insert entry");
          return;
        }
      } else {
        console.log("Insert success:", data);
      }

      // Clear form and close drawer on success
      setShowDrawer(false);
      setInputValue("");
      setWordType("0");
      setSubmitError(null);
    } catch (e) {
      console.error("Unexpected error:", e);
      setSubmitError(e instanceof Error ? e.message : "An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle pronunciation
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
              className="absolute top-full left-4 right-4 -mt-16 bg-[#000080] rounded-[28px] p-8 p-6 z-50"
            >
              <div className="flex gap-3 mb-6 -pl-20 -pt-20">
                <button
                  onClick={() => setWordType("0")}
                  className="relative w-8 h-8 rounded-full bg-[#c8ff00] flex items-center justify-center
                             hover:scale-110 transition-transform"
                  aria-label="Colloquial term"
                  type="button"
                  disabled={isSubmitting}
                >
                  {wordType === "0" && <div className="w-4 h-4 rounded-full bg-black"></div>}
                </button>

                <button
                  onClick={() => setWordType("1")}
                  className="relative w-8 h-8 rounded-full bg-[#ff0090] flex items-center justify-center
                             hover:scale-110 transition-transform"
                  aria-label="Vulgar term"
                  type="button"
                  disabled={isSubmitting}
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
                            focus:outline-none placeholder:text-blue-400/50 disabled:opacity-50"
                  autoFocus
                  disabled={isSubmitting}
                />
              </div>

              {submitError && (
                <div className="mb-4 text-red-400 text-sm text-center">
                  Error: {submitError}
                </div>
              )}

              <div className="flex justify-end -pr-20 -pb-20">
                <button 
                  type="button"
                  onClick={handleAdd}
                  className="px-8 py-3 bg-black text-[#c8ff00] rounded-full text-xl hover:scale-105 transition-transform font-[Anton] font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isSubmitting || !inputValue.trim()}
                >
                  {isSubmitting ? "adding..." : "enter"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
