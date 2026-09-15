'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { accountRequest } from '../../lib/account-auth-server';
import { AUTH_COOKIE, PROFILE_COOKIE, issueSessionToken, sha256Hex, timingSafeEqual } from '../../lib/session';

const SIX_MONTHS_SECONDS = 60 * 60 * 24 * 180;
const SHREEJAY_PASSWORD_HASH = 'd5f2f5d11285dadb0ea89a7b398939cf0d79a5610460884371d3656f62e2d665';

async function setSession(profile, secret) {
  const token = await issueSessionToken(secret, profile);
  const jar = await cookies();
  jar.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SIX_MONTHS_SECONDS,
  });
  jar.set(PROFILE_COOKIE, profile, {
    httpOnly: false,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SIX_MONTHS_SECONDS,
  });
}

export async function login(formData) {
  const submitted = String(formData.get('password') || '');
  const expected = process.env.DAILY_FIFTY_SITE_PASSWORD || '';
  if (!expected) redirect('/login?error=1');

  let profile = null;
  if (timingSafeEqual(submitted, expected)) {
    profile = 'primary';
  } else if (timingSafeEqual(await sha256Hex(submitted), SHREEJAY_PASSWORD_HASH)) {
    profile = 'shreejay';
  } else if (submitted.length >= 8 && submitted.length <= 128) {
    try {
      const result = await accountRequest('login', submitted);
      if (result.ok) profile = result.profile;
    } catch {
      profile = null;
    }
  }

  if (!profile) redirect('/login?error=1');
  await setSession(profile, expected);
  redirect('/practice');
}
