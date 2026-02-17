# Can-Tong v2 Telemetry 修复步骤（telemetry_search / telemetry_zero）

## A. 先确认 Vercel 环境变量（最常见原因）

在 Vercel 项目 → Settings → Environment Variables，确保**至少**有：

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`  （推荐，用于 serverless 写入，避免 RLS 问题）

> 注意：`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` 只给前端用，**不会自动给 /api/**。

部署后，你可以在浏览器 F12 → Network 打开 `/api/telemetry/search` 的 Response：
- 如果看到 `Missing env...`，说明环境变量没配对。


## B. Supabase 执行 SQL

Supabase Dashboard → SQL Editor → New query：

1) 复制粘贴 `supabase_telemetry_fix.sql`
2) 运行（Run）

这会：
- 确保 `telemetry_search` / `telemetry_zero` 有 upsert 所需的 unique index
- 创建/覆盖 `track_unified_search()` RPC（SECURITY DEFINER）


## C. 覆盖前端/后端文件

把本压缩包里的文件覆盖到你的 repo 对应位置：

- `api/telemetry/search.js`
- `src/App.tsx`
- `src/main.tsx`

然后 push 到 GitHub，让 Vercel 自动重新部署。


## D. 验证（你现在截图的那种方式）

1) 在页面输入一个**命中**词（例如能直接显示粤语结果的）
   - 期待：`telemetry_search` 新增/更新一条 `hit_status=bingo`，`cnt` +1
   - `telemetry_zero` **不新增**

2) 输入一个**不命中**词（csv chs/en 没有）
   - 期待：`telemetry_search` 新增/更新一条 `hit_status=miss`，`cnt` +1
   - `telemetry_zero` 新增/更新同一个词，`cnt` +1

3) F12 → Network → 点开 `/api/telemetry/search`
   - Response 应该是 `{ ok: true, recorded: true, hit_status: ... }`
   - 如果是 `{ ok:false, error: ... }`，把 error 内容发我，我可以直接定位。
