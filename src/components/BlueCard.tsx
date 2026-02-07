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

/**
 * 尝试插入：优先带上 source/chs/en（满足你的字段要求）
 * 若因为列不存在导致失败，则回退只插入基础字段（word/is_r18/status）
 */
async function insertSuggestionWithFallback(
  basePayload: { word: string; is_r18: number; status: string },
  extraPayload: { source: string; chs: string | null; en: string | null }
) {
  const fullPayload: any = { ...basePayload, ...extraPayload };

  let { error } = await supabase.from("lexeme_suggestions").insert([fullPayload]);

  if (error) {
    const msg = String(error?.message ?? "");
    const isUnknownColumn =
      msg.includes("schema cache") ||
      msg.includes("Could not find the") ||
      msg.includes("does not exist");

    if (isUnknownColumn) {
      const retry = await supabase.from("lexeme_suggestions").insert([basePayload]);
      error = retry.error;
    }
  }

  return error;
}

export function BlueCard({ searchTerm }: BlueCardProps) {
  const [showDrawer, setShowDrawer] = useState(false);
  const [wordType, setWordType] = useState<"0" | "1">("0"); // 0=colloquial(green), 1=vulgar(magenta)
  const [inputValue, setInputValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false); // 按钮“adding...”状态
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: globalThis.MouseEvent) => {
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

  // Revise 抽屉里的 add/go 按钮逻辑：查重 + 插入 + adding... 状态
  const handleAdd = async (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const word = inputValue.trim();
    if (!word || isSubmitting) return;

    setIsSubmitting(true);

    try {
      // 1）先查重，避免重复插入（按 lexeme_suggestions.word）
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
        // 保持你原行为：重复则关闭抽屉并清空
        setShowDrawer(false);
        setInputValue("");
        setWordType("0");
        return;
      }

      // 2）准备插入 payload
      const basePayload = {
        word,
        is_r18: Number(wordType), // "0" / "1" → 0 / 1
        status: "pending",
      };

      // 额外字段：把 searchTerm 简单归因到 chs/en（不改 UI，仅写库）
      const hasLatin = /[A-Za-z]/.test(searchTerm);
      const extraPayload = {
        source: "revise",
        chs: hasLatin ? null : (searchTerm || null),
        en: hasLatin ? (searchTerm || null) : null,
      };

      const insertErr = await insertSuggestionWithFallback(basePayload, extraPayload);

      if (insertErr) {
        logSupabaseError("Supabase insert error:", insertErr);
        return;
      }

      // 3）成功后重置状态并关闭抽屉
      setShowDrawer(false);
      setInputValue("");
      setWordType("0");
    } finally {
      // 无论成功/失败，都恢复按钮状态
      setIsSubmitting(false);
    }
  };

  // 发音按钮逻辑（保持原样）
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
                  {wordType === "0" && <div className="w-4 h-4 rounded-full bg-black"></div>}
                </button>
