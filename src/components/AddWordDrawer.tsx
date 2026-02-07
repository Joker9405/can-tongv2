import { useState, useRef, useEffect, type MouseEvent } from "react";
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

 const handleAdd = async (event: MouseEvent<HTMLButtonElement>) => {
  event.preventDefault();
  event.stopPropagation();

  const word = inputValue.trim();
  if (!word || isSubmitting) return;

  setIsSubmitting(true);

  try {
    const payload = {
      word,
      is_r18: Number(wordType),
      status: "pending",
    };

    const { error } = await supabase
      .from("lexeme_suggestions")
      .insert([payload]);

    if (error) {
      const code = (error as any)?.code;
      const msg = String((error as any)?.message ?? "");

      if (code === "23505" || msg.includes("duplicate key")) {
        console.log("Duplicate entry, ignored:", word);
        // 不插入也当完成，恢复按钮即可
        return;
      }

      console.error("Supabase insert error:", error);
      return;
    }

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
