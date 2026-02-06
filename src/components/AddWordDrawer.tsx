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
  const [isAdding, setIsAdding] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        drawerRef.current &&
        !drawerRef.current.contains(event.target as Node)
      ) {
        setShowDrawer(false);
      }
    };

    if (showDrawer) {
      document.addEventListener(
        "mousedown",
        handleClickOutside,
      );
    }

    return () => {
      document.removeEventListener(
        "mousedown",
        handleClickOutside,
      );
    };
  }, [showDrawer]);

  const handleAdd = async () => {
    if (!inputValue.trim() || isAdding) {
      return;
    }

    const zhh = inputValue.trim();

    try {
      setIsAdding(true);

      // 1. 先检查是否已存在相同 zhh，避免重复插入
      const { data: existing, error: checkError } = await supabase
        .from("lexeme_suggestions")
        .select("id")
        .eq("zhh", zhh)
        .limit(1);

      if (checkError) {
        console.error("Failed to check duplicate lexeme_suggestions", checkError);
        alert("检查是否已存在该词时出错，请稍后重试。");
        return;
      }

      if (existing && existing.length > 0) {
        // 已存在，给出提示，不再插入
        alert("该词已经存在于候选列表中。");
        return;
      }

      // 2. 插入新的建议词汇
      const { error: insertError } = await supabase
        .from("lexeme_suggestions")
        .insert([
          {
            zhh,
            // 按照后端设计：0=colloquial, 1=vulgar，对应是否为 R18
            is_r18: wordType === "1",
            chs: "",
            en: "",
            source: "cantong-web",
          },
        ])
        // 带上 select，可以在 Network 中看到 ?columns=... 的请求路径
        .select("zhh,is_r18");

      if (insertError) {
        console.error("Failed to insert into lexeme_suggestions", insertError);
        alert("提交失败，请稍后再试。");
        return;
      }

      console.log("Adding suggested term:", {
        original: searchTerm,
        suggested: zhh,
        is_r18: wordType,
      });

      // 成功后收起抽屉并重置输入
      setShowDrawer(false);
      setInputValue("");
      setWordType("0");
    } finally {
      setIsAdding(false);
    }
  };

  const handleSpeak = () => {
    if ("speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(
        searchTerm,
      );
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
            <h2 className="text-6xl font-bold text-white mb-2">
              {searchTerm}
            </h2>
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
                  {wordType === "0" && (
                    <div className="w-4 h-4 rounded-full bg-black"></div>
                  )}
                    </button>

                <button
                  onClick={() => setWordType("1")}
                  className="relative w-8 h-8 rounded-full bg-[#ff0090] flex items-center justify-center
                             hover:scale-110 transition-transform"
                  aria-label="Vulgar term"
                >
                  {wordType === "1" && (
                    <div className="w-4 h-4 rounded-full bg-black"></div>
                  )}
                </button>
              </div>

              {/* Large Text Input */}
              <div className="mb-6">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) =>
                    setInputValue(e.target.value)
                  }
                  placeholder=""
                  className="w-full bg-transparent text-white text-4xl text-center
                            focus:outline-none placeholder:text-blue-400/50"
                  autoFocus
                />
              </div>

              {/* Add Button - Bottom Right at corner */}
              <div className="flex justify-end -pr-20 -pb-20">
                <button
                  onClick={handleAdd}
                  disabled={isAdding}
                  className="px-8 py-3 bg-black text-[#c8ff00] rounded-full text-xl hover:scale-105 transition-transform font-[Anton] font-bold disabled:opacity-60 disabled:cursor-not-allowed"
                >
                   {isAdding ? 'adding...' : 'add'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// 兼容 App.tsx 中的命名导入：AddWordDrawer
// 不改变原有界面，只是用同样的组件再导出一层包装
export function AddWordDrawer(props: BlueCardProps) {
  return <BlueCard {...props} />;
}