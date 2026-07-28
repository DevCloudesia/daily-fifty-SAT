import { NextResponse } from 'next/server';
import { AUTH_COOKIE, verifySessionToken } from './lib/session';

// Only /practice (the actual practice UI and progress) and /api/sync (the endpoint that reads
// and writes shared progress) are gated. The home page stays public as a landing page, and
// /login must never be matched here or a signed-out visitor could never reach the login form.
export const config = {
  matcher: ['/practice/:path*', '/api/sync'],
};

export async function middleware(request) {
  const secret = process.env.DAILY_FIFTY_SITE_PASSWORD;
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  // A missing secret must deny access, not allow it - the same fail-closed rule already used by
  // the sync edge function when DAILY_FIFTY_SYNC_KEY is unset.
  const authorized = Boolean(secret) && (await verifySessionToken(token, secret));
  if (authorized) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith('/api/sync')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'cache-control': 'no-store' } });
  }

  const loginUrl = new URL('/login', request.url);
  return NextResponse.redirect(loginUrl);
}
