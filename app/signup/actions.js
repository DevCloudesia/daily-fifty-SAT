'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { accountRequest } from '../../lib/account-auth-server';
import { AUTH_COOKIE, PROFILE_COOKIE, issueSessionToken, sha256Hex, timingSafeEqual } from '../../lib/session';

const SIX_MONTHS_SECONDS = 60 * 60 * 24 * 180;
const SIGNUP_KEY_HASH = 'c2498dd491d66e0d549425747df231a1c3d39e5c81d73a65b7521aabff0f4b7d';
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

export async function signup(formData) {
  const password = String(formData.get('password') || '');
  const confirm = String(formData.get('confirmPassword') || '');
  const permissionKey = String(formData.get('permissionKey') || '');
  const primaryPassword = process.env.DAILY_FIFTY_SITE_PASSWORD || '';

  const permissionHash = await sha256Hex(permissionKey);
  if (!timingSafeEqual(permissionHash, SIGNUP_KEY_HASH)) redirect('/signup?error=key');
  if (password !== confirm) redirect('/signup?error=match');
  if (password.length < 8 || password.length > 128) redirect('/signup?error=length');
  if (!primaryPassword) redirect('/signup?error=server');

  const passwordHash = await sha256Hex(password);
  if (timingSafeEqual(password, primaryPassword) || timingSafeEqual(passwordHash, SHREEJAY_PASSWORD_HASH)) {
    redirect('/signup?error=exists');
  }

  let result;
  try {
    result = await accountRequest('signup', password);
  } catch {
    redirect('/signup?error=server');
  }
  if (!result.ok) {
    if (result.status === 409) redirect('/signup?error=exists');
    redirect('/signup?error=server');
  }

  await setSession(result.profile, primaryPassword);
  redirect('/practice');
}
