import { useState, useRef, useEffect } from "react";
import supabase from "../lib/supabaseClient";

interface AddWordDrawerProps {
  searchTerm: string;
  isOpen: boolean;
  onClose: () => void;
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

export function AddWordDrawer({ searchTerm, isOpen, onClose }: AddWordDrawerProps) {
  const [wordType, setWordType] = useState<"0" | "1">("0"); // 0=colloquial(green), 1=vulgar(magenta)
  const [inputValue, setInputValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(event.target as Node)) {
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
    const inputWord = inputValue.trim();
    if (!inputWord || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Get the search term context (chs and en values from the displayed card)
      const term = (searchTerm || '').trim();
      const hasHan = /[\u4E00-\u9FFF]/.test(term);
      const hasLatin = /[A-Za-z]/.test(term);

      // Determine chs and en based on searchTerm (not inputWord)
      const chsVal = hasHan ? term : null;
      const enVal = (hasLatin && !hasHan) ? term : (hasLatin && hasHan ? term : null);

      const payload = {
        word: inputWord,  // 关键：实际表中的字段是 word，不是 zhh
        is_r18: Number(wordType),
        status: "pending",
        chs: chsVal,      // 从搜索词提取的中文
        en: enVal,        // 从搜索词提取的英文
        source: "web",
      };

      // Try to insert first
      const { data, error } = await supabase
        .from("lexeme_suggestions")
        .insert([payload])
        .select("id,word,is_r18,status,chs,en,source");

      if (error) {
        // Handle duplicate constraint (23505) or conflict (409)
        if ((error as any).code === "23505" || (error as any).status === 409) {
          console.log("Duplicate detected, attempting merge...");
          
          const { data: existing, error: readErr } = await supabase
            .from("lexeme_suggestions")
            .select("id,word,is_r18,status,chs,en,source")
            .eq("word", inputWord)
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
            .select("id,word,is_r18,status,chs,en,source");

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
      setInputValue("");
      setWordType("0");
      setSubmitError(null);
      onClose();
    } catch (e) {
      console.error("Unexpected error:", e);
      setSubmitError(e instanceof Error ? e.message : "An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isSubmitting && inputValue.trim()) {
      handleAdd();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      ref={drawerRef}
      className="absolute top-0 left-0 bg-[#3a3a3a] w-full rounded-[28px] p-6 z-10"
    >
      <div className="flex gap-3 mb-6 -pr-20 -pb-20">
        <button
          onClick={() => setWordType("0")}
          className="relative w-8 h-8 rounded-[28px] bg-[#c8ff00] flex items-center justify-center hover:scale-110 transition-transform disabled:opacity-50"
          aria-label="Green term"
          type="button"
          disabled={isSubmitting}
        >
          {wordType === "0" && <div className="w-4 h-4 rounded-[28px] bg-black"></div>}
        </button>

        <button
          onClick={() => setWordType("1")}
          className="relative w-8 h-8 rounded-[28px] bg-[#ff0090] flex items-center justify-center hover:scale-110 transition-transform disabled:opacity-50"
          aria-label="Pink term"
          type="button"
          disabled={isSubmitting}
        >
          {wordType === "1" && <div className="w-4 h-4 rounded-[28px] bg-black"></div>}
        </button>
      </div>

      <div className="mb-6">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder=" "
          className="w-full bg-transparent text-white text-4xl text-center focus:outline-none placeholder:text-gray-600 disabled:opacity-50"
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
          onClick={handleAdd}
          type="button"
          className="px-6 py-3 bg-black text-[#c8ff00] rounded-[28px] text-xl font-bold hover:scale-105 transition-transform font-[Anton] disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isSubmitting || !inputValue.trim()}
        >
          {isSubmitting ? "adding..." : "enter"}
        </button>
      </div>
    </div>
  );
}
