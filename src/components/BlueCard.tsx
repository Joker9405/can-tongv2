import { useState, useRef, useEffect, MouseEvent } from "react";
import { Volume2 } from "lucide-react";
import supabase from "../lib/supabaseClient";

interface BlueCardProps {
  searchTerm: string;
}

export function BlueCard({ searchTerm }: BlueCardProps) {
  const [showDrawer, setShowDrawer] = useState(false);
  const [wordType, setWordType] = useState<"0" | "1">("0");
  const [inputValue, setInputValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  // 添加用户认证检查
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    // 获取当前用户信息
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id || null);
    };
    getUser();
  }, []);

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
      document.addEventListener("mousedown", handleClickOutside as any);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside as any);
    };
  }, [showDrawer]);

  // 修复的 handleAdd 函数 - 添加 RLS 策略支持
  const handleAdd = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const word = inputValue.trim();
    if (!word || isSubmitting) return;

    setIsSubmitting(true);

    try {
      console.log("开始提交词汇...", { word, wordType, userId });

      // 1. 检查是否登录（如果 RLS 需要）
      // const { data: { user } } = await supabase.auth.getUser();
      // if (!user) {
      //   alert("请先登录！");
      //   setIsSubmitting(false);
      //   return;
      // }

      // 2. 构建完整的数据 payload
      const payload = {
        word: word, // 可能需要使用 'word' 而不是 'zhh'
        is_r18: wordType === "1", // 转换为布尔值
        status: "pending",
        created_at: new Date().toISOString(),
        // 如果有 user_id 字段
        // user_id: user?.id,
        // 如果有 created_by 字段
        // created_by: user?.id,
        // 其他可能需要的字段
        source: "web_app",
        ip_address: "web_client", // 如果需要的话
      };

      console.log("提交数据:", payload);

      // 3. 尝试插入 - 使用 try-catch 包装
      const { data, error } = await supabase
        .from("lexeme_suggestions")
        .insert([payload])
        .select("word, is_r18, status, created_at")
        .single(); // 使用 .single() 获取单个结果

      console.log("Supabase 响应:", { data, error });

      if (error) {
        console.error("Supabase 详细错误:", {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        
        // 根据错误代码处理不同的错误
        if (error.code === "42501") {
          throw new Error("权限不足：请检查 RLS 策略或联系管理员");
        } else if (error.code === "23505") {
          throw new Error("词汇已存在");
        } else if (error.code === "23502") {
          throw new Error("缺少必填字段，请检查表结构");
        } else if (error.code === "23503") {
          throw new Error("外键约束错误");
        } else {
          throw new Error(`数据库错误: ${error.message}`);
        }
      }

      if (!data) {
        throw new Error("插入成功但没有返回数据");
      }

      console.log("插入成功:", data);

      // 4. 成功后重置
      setShowDrawer(false);
      setInputValue("");
      setWordType("0");
      
      alert("✅ 词汇已成功提交到数据库！");

    } catch (error: any) {
      console.error("提交过程中出错:", error);
      alert(`❌ 提交失败: ${error.message}`);
      
      // 特殊处理 RLS 错误
      if (error.message.includes("RLS") || error.message.includes("权限")) {
        alert("权限问题：可能需要更新数据库策略或登录用户");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // 测试 RLS 策略的函数
  const testRLS = async () => {
    setIsSubmitting(true);
    try {
      console.log("测试 RLS 策略...");
      
      // 测试读取权限
      const { data: readData, error: readError } = await supabase
        .from("lexeme_suggestions")
        .select("count")
        .limit(1);
      
      console.log("读取测试:", { readData, readError });
      
      // 测试写入权限 - 使用最小数据
      const testData = {
        word: "test_rls_check_" + Date.now(),
        status: "pending",
        created_at: new Date().toISOString()
      };
      
      const { data, error } = await supabase
        .from("lexeme_suggestions")
        .insert([testData])
        .select();
      
      console.log("写入测试:", { data, error });
      
      if (error) {
        alert(`RLS 测试失败: ${error.code} - ${error.message}`);
      } else {
        alert("RLS 测试成功！可以正常写入");
      }
      
    } catch (error: any) {
      console.error("RLS 测试异常:", error);
      alert(`测试异常: ${error.message}`);
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
            <h2 className="text-6xl font-bold text-white mb-2">
              {searchTerm}
            </h2>
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
              className="absolute top-full left-4 right-4 -mt-16 bg-[#000080] rounded-[28px] p-8"
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
                  {wordType === "0" && (
                    <div className="w-4 h-4 rounded-full bg-black"></div>
                  )}
                </button>

                <button
                  onClick={() => setWordType("1")}
                  className="relative w-8 h-8 rounded-full bg-[#ff0090] flex items-center justify-center
                             hover:scale-110 transition-transform"
                  aria-label="Vulgar term"
                  type="button"
                  disabled={isSubmitting}
                >
                  {wordType === "1" && (
                    <div className="w-4 h-4 rounded-full bg-black"></div>
                  )}
                </button>
              </div>

              <div className="mb-6">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="输入粤语词汇..."
                  className="w-full bg-transparent text-white text-4xl text-center
                            focus:outline-none placeholder:text-blue-400/50"
                  autoFocus
                  disabled={isSubmitting}
                />
              </div>

              <div className="flex justify-end -pr-20 -pb-20 gap-4 flex-wrap">
                {/* RLS 测试按钮 */}
                <button
                  type="button"
                  onClick={testRLS}
                  className="px-4 py-2 bg-purple-500 text-white rounded-full text-sm hover:scale-105 transition-transform"
                  disabled={isSubmitting}
                >
                  测试RLS
                </button>
                
                {/* 主提交按钮 */}
                <button
                  type="button"
                  onClick={handleAdd}
                  className="px-8 py-3 bg-black text-[#c8ff00] rounded-full text-xl hover:scale-105 transition-transform font-[Anton] font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isSubmitting || !inputValue.trim()}
                >
                  {isSubmitting ? "adding..." : "go"}
                </button>
              </div>
              
              {/* 调试信息显示 */}
              <div className="mt-4 p-3 bg-gray-900/80 text-white text-xs rounded-lg">
                <div className="font-bold mb-1">调试信息：</div>
                <div>用户ID: {userId || "未登录"}</div>
                <div>提交状态: {isSubmitting ? "🔄 提交中..." : "✅ 就绪"}</div>
                <div>词汇: {inputValue || "(空)"}</div>
                <div>类型: {wordType === "0" ? "💚 口语" : "💖 成人内容"}</div>
                <div className="text-red-300 mt-1">
                  提示：如果出现权限错误，请检查 Supabase RLS 策略
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}