import { useState, useRef, useEffect } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import supabase from "../lib/supabaseClient";

interface AddWordDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

function logSupabaseError(label: string, error: any) {
  console.error(label, {
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
    code: error?.code,
  });
}

/**
 * 尝试插入：优先带上 source/chs/en（若你表有 NOT NULL 需求可避免 400）
 * 如果因为“列不存在(schema cache)”导致失败，则回退只插入基础字段（word/is_r18/status）
 */
async function insertSuggestionWithFallback(basePayload: {
  word: string;
  is_r18: number;
  status: string;
}) {
  // 先尝试“全字段”（满足你要求：source/chs/en）
  const fullPayload: any = {
    ...basePayload,
    source: "drawer",
    chs: null,
    en: null,
  };

  let { error } = await supabase.from("lexeme_suggestions").insert([fullPayload]);

  if (error) {
    const msg = String(error?.message ?? "");
    // 常见：PGRST204 schema cache column not found / column does not exist
    const isUnknownColumn =
      msg.includes("schema cache") ||
      msg.includes("Could not find the") ||
      msg.includes("does not exist");

    if (isUnknownColumn) {
      // 回退：只插入基础字段，避免因为你表没这些列而 400
      const retry = await supabase
        .from("lexeme_suggestions")
        .insert([basePayload]);
      error = retry.error;
    }
  }

  return error;
}

export function AddWordDrawer({ isOpen, onClose }: AddWordDrawerProps) {
  const [wordType, setWordType] = useState<"0" | "1">("1"); // 0=green, 1=pink
  const [inputValue, setInputValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: globalThis.MouseEvent) => {
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

  const handleAdd = async (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const word = inputValue.trim();
    if (!word || isSubmitting) return;

    setIsSubmitting(true);

    try {
      // 1) 插入前查重（按 word 字段）
      const { data: existing, error: existErr } = await supabase
        .from("lexeme_suggestions")
        .select("id")
        .eq("word", word)
        .limit(1);

      if (existErr) {
        logSupabaseError("Supabase duplicate-check error:", existErr);
        return;
      }

      if (existing && existing.length > 0) {
        console.log("[lexeme_suggestions] duplicated:", word);
        // 不强制关闭抽屉，避免改变你原交互（只是不插入）
        return;
      }

      // 2) 插入
      const basePayload = {
        word,
        is_r18: Number(wordType),
        status: "pending",
      };

      const insertErr = await insertSuggestionWithFallback(basePayload);

      if (insertErr) {
        logSupabaseError("Supabase insert error:", insertErr);
        return;
      }

      // 3) 成功：重置 & 关闭
      setInputValue("");
      setWordType("1");
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      ref={drawerRef}
      className="absolute top-0 left-0 bg-[#3a3a3a] w-full rounded-[28px] p-8 p-6 z-10"
    >
      {/* Type Selector - Top Left at corner radius center */}
      <div className="flex gap-3 mb-6 -pr-20 -pb-20">
        <button
          onClick={() => setWordType("0")}
          className="relative w-8 h-8 rounded-[28px] bg-[#c8ff00] flex items-center justify-center hover:scale-110 transition-transform"
          aria-label="Green term"
          type="button"
        >
          {wordType === "0" && <div className="w-4 h-4 rounded-[28px] bg-black"></div>}
        </button>

        <button
          onClick={() => setWordType("1")}
          className="relative w-8 h-8 rounded-[28px] bg-[#ff0090] flex items-center justify-center hover:scale-110 transition-transform"
          aria-label="Pink term"
          type="button"
        >
          {wordType === "1" && <div className="w-4 h-4 rounded-[28px] bg-black"></div>}
        </button>
      </div>

      {/* Large Text Input */}
      <div className="mb-6">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder=""
          className="w-full bg-transparent text-white text-4xl text-center focus:outline-none placeholder:text-gray-600"
          autoFocus
        />
      </div>

      {/* Add Button - Bottom Right at corner radius center */}
      <div className="flex justify-end -pr-20 -pb-20">
        <button
          onClick={handleAdd}
          className="px-6 py-3 bg-black text-[#c8ff00] rounded-[28px] text-xl font-bold hover:scale-105 transition-transform font-[Anton]"
          type="button"
          disabled={isSubmitting}
        >
          {isSubmitting ? "adding..." : "go"}
        </button>
      </div>
    </div>
  );
}
