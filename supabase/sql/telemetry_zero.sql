-- supabase/sql/telemetry_zero.sql
-- 目标：
-- 1) telemetry_zero：只存「未命中(缺失词)」且去重计数（同一天同一个 q_norm 只保留一行）
-- 2) log_zero_search：原子 upsert + cnt++（并发安全）
-- 3) 你在 Supabase Table Editor 看这个表，就不会出现重复的 text 了（只会 cnt 增加）

create table if not exists public.telemetry_zero (
  id bigserial primary key,
  day date not null default current_date,
  q text not null,
  q_norm text not null,
  cnt int not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  from_src text not null default 'translate',
  path text not null default '',
  referrer text not null default '',
  lang text not null default '',
  tz text not null default '',
  country text not null default '',
  ua text not null default ''
);

create unique index if not exists telemetry_zero_day_qnorm_uniq
  on public.telemetry_zero(day, q_norm);

create or replace function public.log_zero_search(
  p_q text,
  p_q_norm text,
  p_lang text default '',
  p_country text default '',
  p_path text default '',
  p_referrer text default '',
  p_ua text default '',
  p_from_src text default 'translate'
) returns void
language plpgsql
security definer
as $$
begin
  insert into public.telemetry_zero(day, q, q_norm, cnt, first_seen_at, last_seen_at, from_src, path, referrer, lang, country, ua)
  values (current_date, p_q, p_q_norm, 1, now(), now(), coalesce(p_from_src,'translate'), coalesce(p_path,''), coalesce(p_referrer,''), coalesce(p_lang,''), coalesce(p_country,''), coalesce(p_ua,''))
  on conflict (day, q_norm) do update
    set cnt = public.telemetry_zero.cnt + 1,
        last_seen_at = now(),
        q = excluded.q,
        from_src = excluded.from_src,
        path = case when excluded.path <> '' then excluded.path else public.telemetry_zero.path end,
        referrer = case when excluded.referrer <> '' then excluded.referrer else public.telemetry_zero.referrer end,
        lang = case when excluded.lang <> '' then excluded.lang else public.telemetry_zero.lang end,
        country = case when excluded.country <> '' then excluded.country else public.telemetry_zero.country end,
        ua = case when excluded.ua <> '' then excluded.ua else public.telemetry_zero.ua end;
end;
$$;

-- 授权（如果你不用 service_role 写入，而是希望 anon 也能 rpc）
grant execute on function public.log_zero_search(text, text, text, text, text, text, text, text) to anon, authenticated;

-- （可选）你想在 UI 里看到“全量汇总（跨天）”，可以建一个 view
create or replace view public.telemetry_zero_alltime as
select
  q_norm,
  max(q) as q_sample,
  sum(cnt) as times,
  min(first_seen_at) as first_seen_at,
  max(last_seen_at) as last_seen_at
from public.telemetry_zero
group by q_norm
order by last_seen_at desc;
