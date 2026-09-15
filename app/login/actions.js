'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AUTH_COOKIE, PROFILE_COOKIE, issueSessionToken, sha256Hex, timingSafeEqual } from '../../lib/session';

const SIX_MONTHS_SECONDS = 60 * 60 * 24 * 180;
const SHREEJAY_PASSWORD_HASH = 'd5f2f5d11285dadb0ea89a7b398939cf0d79a5610460884371d3656f62e2d665';

export async function login(formData) {
  const submitted = String(formData.get('password') || '');
  const expected = process.env.DAILY_FIFTY_SITE_PASSWORD || '';

  let profile = null;
  if (expected.length > 0 && timingSafeEqual(submitted, expected)) {
    profile = 'primary';
  } else if (timingSafeEqual(await sha256Hex(submitted), SHREEJAY_PASSWORD_HASH)) {
    profile = 'shreejay';
  }
  if (!profile || !expected) redirect('/login?error=1');

  const token = await issueSessionToken(expected, profile);
  const jar = await cookies();
  jar.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SIX_MONTHS_SECONDS,
  });
  // This cookie is intentionally readable by the browser so Daily Fifty localStorage can be
  // namespaced per profile. Cloud access still comes only from the signed httpOnly auth cookie.
  jar.set(PROFILE_COOKIE, profile, {
    httpOnly: false,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SIX_MONTHS_SECONDS,
  });
  redirect('/practice');
}
