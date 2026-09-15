import { NextResponse } from 'next/server';
import { AUTH_COOKIE, PROFILE_COOKIE, getSessionProfile } from './lib/session';

const SIX_MONTHS_SECONDS = 60 * 60 * 24 * 180;

export const config = {
  matcher: ['/practice/:path*', '/api/sync'],
};

export async function middleware(request) {
  const secret = process.env.DAILY_FIFTY_SITE_PASSWORD;
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const profile = secret ? await getSessionProfile(token, secret) : null;
  if (profile) {
    const response = NextResponse.next();
    response.cookies.set(PROFILE_COOKIE, profile, {
      httpOnly: false,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: SIX_MONTHS_SECONDS,
    });
    return response;
  }

  if (request.nextUrl.pathname.startsWith('/api/sync')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'cache-control': 'no-store' } });
  }

  const loginUrl = new URL('/login', request.url);
  return NextResponse.redirect(loginUrl);
}
