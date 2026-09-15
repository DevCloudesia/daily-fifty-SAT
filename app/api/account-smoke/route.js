import { NextResponse } from 'next/server';
import { accountRequest } from '../../../lib/account-auth-server';
import { sha256Hex, timingSafeEqual } from '../../../lib/session';

const SIGNUP_KEY_HASH = 'c2498dd491d66e0d549425747df231a1c3d39e5c81d73a65b7521aabff0f4b7d';
const MARKER = 'feedbeef';

function syncConfiguration() {
  const baseUrl = process.env.DAILY_FIFTY_SYNC_URL;
  const key = process.env.DAILY_FIFTY_SYNC_KEY;
  if (!baseUrl || !key) throw new Error('Sync configuration is missing.');
  const url = baseUrl.replace(/\/daily-fifty-sync\/?$/, '/daily-fifty-sync-profile');
  if (url === baseUrl) throw new Error('Sync URL is not in the expected format.');
  return { url, key };
}

async function syncRequest(profile, payload, mode = null) {
  const { url, key } = syncConfiguration();
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-daily-fifty-key': key,
      'x-daily-fifty-profile': profile,
    },
    body: JSON.stringify(mode ? { payload, mode } : { payload }),
    cache: 'no-store',
  });
  const data = await response.json();
  return { ok: response.ok && data?.ok === true, status: response.status, payload: data?.payload || null };
}

export async function GET(request) {
  const key = new URL(request.url).searchParams.get('key') || '';
  if (!timingSafeEqual(await sha256Hex(key), SIGNUP_KEY_HASH)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const password = `SmokeSAT_${crypto.randomUUID()}`;
  const signup = await accountRequest('signup', password);
  const login = await accountRequest('login', password);
  if (!signup.ok || !login.ok || !signup.profile || signup.profile !== login.profile) {
    return NextResponse.json({ signupOk: signup.ok, loginOk: login.ok, sameProfile: false }, { status: 500 });
  }

  const write = await syncRequest(signup.profile, {
    completed: [],
    blocked: [],
    seen: [MARKER],
    session: {},
    preferences: {},
    updatedAt: new Date(0).toISOString(),
  });
  const read = await syncRequest(signup.profile, {}, 'read');
  const markerPresent = Array.isArray(read.payload?.seen) && read.payload.seen.includes(MARKER);

  return NextResponse.json({
    signupOk: signup.ok,
    loginOk: login.ok,
    sameProfile: signup.profile === login.profile,
    profile: signup.profile,
    syncWriteOk: write.ok,
    syncReadOk: read.ok,
    markerPresent,
  }, { headers: { 'cache-control': 'no-store' } });
}
