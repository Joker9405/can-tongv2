-- ============================================
-- 修复 telemetry_search.hit_status 的 SQL 方案
-- ============================================
-- 
-- 方案一：如果 lexeme_suggestions 表中有已审核的词（status='approved'），可以用这个
-- ============================================

-- 先全部标记为 miss
UPDATE public.telemetry_search
SET hit_status = 'miss';

-- 把命中 lexeme_suggestions（已审核的词）的搜索标记为 bingo
UPDATE public.telemetry_search ts
SET hit_status = 'bingo'
FROM public.lexeme_suggestions ls
WHERE ts.text IS NOT NULL
  AND ts.text <> ''
  AND ls.status = 'approved'  -- 只匹配已审核的词
  AND (
    ts.text = ls.zhh
    OR ts.text = ls.chs
    OR ts.text = ls.en
  );

-- ============================================
-- 方案二：如果你需要从 lexeme.csv 导入数据到数据库表
-- ============================================
-- 
-- 步骤 1：创建 lexeme 表（在 Supabase Table Editor 中手动创建，或执行以下 SQL）
-- 
-- CREATE TABLE IF NOT EXISTS public.lexeme (
--   id TEXT,
--   zhh TEXT,
--   zhh_pron TEXT,
--   is_r18 INTEGER,
--   chs TEXT,
--   en TEXT,
--   owner_tag TEXT,
--   register TEXT,
--   intent TEXT
-- );
--
-- 步骤 2：在 Supabase Table Editor 中，选择 lexeme 表 -> Import data -> 选择 lexeme.csv
--         让 Supabase 自动映射列名
--
-- 步骤 3：导入成功后，执行以下 SQL 更新 hit_status
-- ============================================

-- 先全部标记为 miss
-- UPDATE public.telemetry_search
-- SET hit_status = 'miss';

-- 再把命中 lexeme.csv（zhh / chs / en 任一列）的搜索标记为 bingo
-- UPDATE public.telemetry_search ts
-- SET hit_status = 'bingo'
-- FROM public.lexeme lx
-- WHERE ts.text IS NOT NULL
--   AND ts.text <> ''
--   AND (
--     ts.text = lx.zhh
--     OR ts.text = lx.chs
--     OR ts.text = lx.en
--   );

-- ============================================
-- 方案三：如果 lexeme_suggestions 表中有所有词（不管状态），用这个
-- ============================================

-- 先全部标记为 miss
-- UPDATE public.telemetry_search
-- SET hit_status = 'miss';

-- 把命中 lexeme_suggestions（所有词）的搜索标记为 bingo
-- UPDATE public.telemetry_search ts
-- SET hit_status = 'bingo'
-- FROM public.lexeme_suggestions ls
-- WHERE ts.text IS NOT NULL
--   AND ts.text <> ''
--   AND (
--     ts.text = ls.zhh
--     OR ts.text = ls.chs
--     OR ts.text = ls.en
--   );
