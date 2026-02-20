# CanTong v2 Telemetry Fix v5

## What this fixes
- **telemetry_search**: records *every* search (hit or miss), increments `cnt`, updates `last_seen_at`, sets `hit_status`.
- **telemetry_zero**: records *only misses*, increments `cnt`, updates `last_seen_at`.

## Step 1 (Supabase): run SQL
Supabase Dashboard → **SQL Editor** → New query → paste `sql/telemetry_unified.sql` → **Run**.

## Step 2 (GitHub/Vercel): replace API file
In your repo, replace/create:
- `api/telemetry/search.js`  (this becomes endpoint `/api/telemetry/search`)

Commit & push to `main` → Vercel auto deploy.

## Step 3: verify
1) Open the website, search a known hit word 2 times.
2) Supabase Table Editor:
   - `telemetry_search`: the row `cnt` should +2 and `hit_status=bingo`.
3) Search an unknown word 2 times.
   - `telemetry_search`: row exists with `hit_status=miss` and `cnt` +2
   - `telemetry_zero`: row exists and `cnt` +2

If Table Editor doesn't show changes, click **Refresh** (top right) or re-open the table.
