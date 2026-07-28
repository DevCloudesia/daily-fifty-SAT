'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AUTH_COOKIE, issueSessionToken, timingSafeEqual } from '../../lib/session';

const SIX_MONTHS_SECONDS = 60 * 60 * 24 * 180;

export async function login(formData) {
  const submitted = String(formData.get('password') || '');
  const expected = process.env.DAILY_FIFTY_SITE_PASSWORD || '';
  const ok = expected.length > 0 && timingSafeEqual(submitted, expected);
  if (!ok) redirect('/login?error=1');

  const token = await issueSessionToken(expected);
  const jar = await cookies();
  jar.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SIX_MONTHS_SECONDS,
  });
  redirect('/practice');
}
