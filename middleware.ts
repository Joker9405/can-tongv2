// middleware.ts
// Vercel Routing Middleware (Edge): log pageviews to Supabase WITHOUT front-end changes.
// - Only logs real navigations (Accept: text/html)
// - Stores a non-PII client id cookie (cid)
// - Captures geo headers + referrer + UTM params

import { next } from '@vercel/functions';

export const config = {
  // Avoid API and static assets
  matcher: ['/((?!api/|assets/|favicon\\.ico$|robots\\.txt$|sitemap\\.xml$).*)'],
};

function getCookie(header: string, name: string): string {
  const parts = header.split(';');
  for (const p of parts) {
    const i = p.indexOf('=');
    if (i < 0) continue;
    const k = p.slice(0, i).trim();
    if (k !== name) continue;
    return decodeURIComponent(p.slice(i + 1).trim() || '');
  }
  return '';
}

function hasFileExt(pathname: string): boolean {
  return /\\.[a-zA-Z0-9]{2,8}$/.test(pathname);
}

async function supabaseInsert(table: string, row: any) {
  const base = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
  if (!base || !key) return;

  const endpoint = `${base}/rest/v1/${table}`;
  // PostgREST accepts array for inserts.
  await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify([row]),
  }).catch(() => {});
}

export default async function middleware(request: Request, context: any) {
  // Only count real page navigations, not prefetch/assets.
  const accept = request.headers.get('accept') || '';
  if (!accept.includes('text/html')) return next();

  const url = new URL(request.url);
  if (hasFileExt(url.pathname)) return next();

  const cookieHeader = request.headers.get('cookie') || '';
  let cid = getCookie(cookieHeader, 'cid');
  const needSetCid = !cid || cid.length < 8;
  if (needSetCid) cid = crypto.randomUUID().replace(/-/g, '');

  const ua = (request.headers.get('user-agent') || '').slice(0, 180);
  const device = /mobile|android|iphone|ipad|ipod/i.test(ua) ? 'mobile' : 'desktop';
  const ref = (request.headers.get('referer') || '').slice(0, 300);

  const row = {
    // Try to be compatible with both schema styles we've used before.
    cid,
    path: `${url.pathname}${url.search}`.slice(0, 500),
    ref: ref || null,
    ua,
    device,
    // Vercel geo headers (best-effort)
    country: request.headers.get('x-vercel-ip-country') || null,
    region: request.headers.get('x-vercel-ip-country-region') || null,
    city: request.headers.get('x-vercel-ip-city') || null,
    // Note: We intentionally DON'T include dedicated utm_* columns here to
    // avoid insert failures when your telemetry_pv table doesn't have them.
    // UTM values are still preserved inside `path` (it includes the querystring).
  };

  // Non-blocking insert (Edge supports waitUntil)
  if (context && typeof context.waitUntil === 'function') {
    context.waitUntil(supabaseInsert('telemetry_pv', row));
  } else {
    // Fallback: still try, but don't delay navigation too much.
    supabaseInsert('telemetry_pv', row);
  }

  const res = next();
  if (needSetCid) {
    // 180 days
    const maxAge = 180 * 24 * 60 * 60;
    res.headers.append('Set-Cookie', `cid=${encodeURIComponent(cid)}; Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure; HttpOnly`);
  }
  return res;
}
