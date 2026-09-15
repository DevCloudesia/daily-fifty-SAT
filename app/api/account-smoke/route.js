import { NextResponse } from 'next/server';
import { accountRequest } from '../../../lib/account-auth-server';
import { sha256Hex, timingSafeEqual } from '../../../lib/session';

const SIGNUP_KEY_HASH = 'c2498dd491d66e0d549425747df231a1c3d39e5c81d73a65b7521aabff0f4b7d';

export async function GET(request) {
  const key = new URL(request.url).searchParams.get('key') || '';
  if (!timingSafeEqual(await sha256Hex(key), SIGNUP_KEY_HASH)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const password = `SmokeSAT_${crypto.randomUUID()}`;
  const signup = await accountRequest('signup', password);
  const login = await accountRequest('login', password);
  return NextResponse.json({
    signup: { ok: signup.ok, status: signup.status, profile: signup.profile, error: signup.error },
    login: { ok: login.ok, status: login.status, profile: login.profile, error: login.error },
    sameProfile: Boolean(signup.profile && signup.profile === login.profile),
  }, { headers: { 'cache-control': 'no-store' } });
}
