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
  const [isSubmitting, setIsSubmitting] = useState(false); // 按钮"adding..."状态
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
    const word = inputValue.trim();
    if (!word || isSubmitting) return;

    setIsSubmitting(true);

    try {
      // ⚠️ 不传 created_at（让 DB 默认 now()）
      
const term = (searchTerm || '').trim();
const hasHan = /[\u4E00-\u9FFF]/.test(term);
const hasLatin = /[A-Za-z]/.test(term);

// 只存一种最可靠：中文 -> chs；英文 -> en；两者都有就两个都存
const chsVal = hasHan ? term : null;
const enVal = (hasLatin && !hasHan) ? term : (hasLatin && hasHan ? term : null);

      const payload = {
  word,
  is_r18: Number(wordType),
  status: "pending",
  // 记录本次搜索词（命中/未命中都可用）
  chs: chsVal,
  en: enVal,
  // 只要你表里有该列才保留；没有就删掉这一行 + select 里的 source
  source: "web",
};

      const { data, error } = await supabase
        .from("lexeme_suggestions")
        .insert([payload])
        .select("id,word,is_r18,status,chs,en,source");

      if (error) {
        // 409 / 23505: word 已存在（unique constraint），把搜索词合并进 chs/en
        if ((error as any).code === "23505" || (error as any).status === 409) {
          const { data: existing, error: readErr } = await supabase
            .from("lexeme_suggestions")
            .select("id,word,is_r18,status,chs,en,source")
            .eq("word", word)
            .maybeSingle();

          if (readErr || !existing) {
            console.error("Read existing failed:", readErr || "not found");
            return;
          }

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
            console.error("Merge update failed(full):", JSON.stringify(updErr, null, 2));
            return;
          }

          console.log("Merge update ok:", upd);
        } else {
          console.error("Insert failed:", error);
          console.error("Insert failed(full):", JSON.stringify(error, null, 2));
          return;
        }
      }

      console.log("Insert ok:", data);

      setInputValue("");
      setWordType("0");
      onClose();
    } catch (e) {
      console.error("Unexpected error:", e);
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
          placeholder=" "
          className="w-full bg-transparent text-white text-4xl text-center focus:outline-none placeholder:text-gray-600 disabled:opacity-50"
          autoFocus
          disabled={isSubmitting}
        />
      </div>

      <div className="flex justify-end -pr-20 -pb-20">
        <button
          onClick={handleAdd}
          className="px-6 py-3 bg-black text-[#c8ff00] rounded-[28px] text-xl font-bold hover:scale-105 transition-transform font-[Anton] disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isSubmitting || !inputValue.trim()}
        >
          {isSubmitting ? "adding..." : "enter"}
        </button>
      </div>
    </div>
  );
}
