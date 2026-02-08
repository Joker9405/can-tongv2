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
      const q = (searchTerm || "").trim();
      const isQueryChinese = /[\u4E00-\u9FFF]/.test(q);

      // ⚠️ 不传 created_at（让 DB 默认 now()）
      const payload = {
        word,
        is_r18: wordType === "1" ? 1 : 0,
        status: "pending",
        chs: q ? (isQueryChinese ? q : null) : null,
        en: q ? (!isQueryChinese ? q : null) : null,
        source: "web",
      };

      // ✅ 统一走 RPC：新词插入；重复词合并 chs/en；不会再出现 409
      const { data, error } = await supabase.rpc("submit_lexeme_suggestion", {
        p_word: payload.word,
        p_is_r18: payload.is_r18,
        p_status: payload.status,
        p_chs: payload.chs,
        p_en: payload.en,
        p_source: payload.source,
      });

      if (error) {
        console.error("RPC failed:", error);
        console.error("RPC failed(full):", JSON.stringify(error, null, 2));
        return;
      }

      console.log("RPC ok:", data);

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
          type="button"
          disabled={isSubmitting || !inputValue.trim()}
        >
          {isSubmitting ? "adding..." : "go"}
        </button>
      </div>
    </div>
  );
}
