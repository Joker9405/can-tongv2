import { useMemo, useState } from "react";
import supabase from "../lib/supabaseClient";

type Props = {
  searchTerm: string;
};

// BlueCard：未命中时展示 + 允许把“当前搜索词”写入 lexeme_suggestions
export default function BlueCard({ searchTerm }: Props) {
  const [isAdding, setIsAdding] = useState(false);
  const [added, setAdded] = useState(false);

  // Revise drawer (保持你原有交互：仅保留状态，不强行改逻辑)
  const [isReviseOpen, setIsReviseOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const q = useMemo(() => (searchTerm || "").trim(), [searchTerm]);
  const isQueryChinese = useMemo(() => /[\u4E00-\u9FFF]/.test(q), [q]);

  const handleAdd = async () => {
    if (!q || isAdding || added) return;

    setIsAdding(true);

    // ✅ 通过 RPC：新增则 INSERT，重复则自动合并 chs/en（不会 409）
    const { data, error } = await supabase.rpc("submit_lexeme_suggestion", {
      p_word: q,
      p_is_r18: 0,
      p_status: "pending",
      p_chs: isQueryChinese ? q : null,
      p_en: !isQueryChinese ? q : null,
      p_source: "web",
    });

    if (error) {
      console.error("submit_lexeme_suggestion failed:", error);
      setIsAdding(false);
      return;
    }

    console.log("submit_lexeme_suggestion ok:", data);
    setAdded(true);
    setIsAdding(false);
  };

  return (
    <div className="relative w-[650px] max-w-[92vw] rounded-[20px] bg-gradient-to-b from-[#0a2cff] to-[#001066] p-8 shadow-[0_18px_45px_rgba(0,0,0,0.5)]">
      {/* header dots */}
      <div className="mb-4 flex items-center gap-3">
        <div className="h-5 w-5 rounded-full border-4 border-[#D7FF00] bg-transparent" />
        <div className="h-5 w-5 rounded-full bg-[#FF00A8]" />

        <button
          className="ml-auto rounded-full bg-black/60 px-4 py-2 text-sm font-semibold text-white hover:bg-black/75"
          onClick={() => setIsReviseOpen(true)}
        >
          revise
        </button>
      </div>

      {/* main */}
      <div className="min-h-[120px] rounded-[18px] bg-black/10 p-6">
        <div className="text-center text-4xl font-extrabold text-white drop-shadow">
          {q || "—"}
        </div>
      </div>

      {/* add */}
      <div className="mt-6 flex justify-end">
        <button
          onClick={handleAdd}
          disabled={!q || isAdding || added}
          className={`rounded-full px-5 py-2 text-sm font-bold ${
            added
              ? "bg-black/40 text-[#D7FF00]"
              : "bg-black text-[#D7FF00] hover:bg-black/85"
          } ${!q || isAdding ? "opacity-60" : ""}`}
        >
          {added ? "added" : isAdding ? "adding..." : "add"}
        </button>
      </div>

      {/* revise drawer (轻量保持) */}
      {isReviseOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-4">
          <div className="w-[650px] max-w-[92vw] rounded-[20px] bg-[#0b0b0b] p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-base font-bold text-white">Revise</div>
              <button
                className="rounded-full bg-white/10 px-3 py-1 text-sm text-white hover:bg-white/15"
                onClick={() => setIsReviseOpen(false)}
              >
                close
              </button>
            </div>

            <div className="flex items-center gap-3">
              <input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="type here..."
                className="flex-1 rounded-xl bg-white/10 px-4 py-3 text-white outline-none placeholder:text-white/40"
              />
              <button
                className="rounded-full bg-[#D7FF00] px-5 py-3 text-sm font-extrabold text-black"
                // 这里只保留原有“go”按钮；具体 revise 逻辑你后续再接
                onClick={() => {
                  console.log("revise go:", inputValue);
                  setIsReviseOpen(false);
                }}
              >
                go
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
