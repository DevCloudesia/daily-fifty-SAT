import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { AUTH_COOKIE, getSessionProfile } from '../../../lib/session';

export const runtime = 'nodejs';
export const maxDuration = 15;

function configuration() {
  const url = process.env.DAILY_FIFTY_SYNC_URL;
  const key = process.env.DAILY_FIFTY_SYNC_KEY;
  const secret = process.env.DAILY_FIFTY_SITE_PASSWORD;
  if (!url || !key || !secret) throw new Error('Daily Fifty sync environment variables are missing.');
  return { url, key, secret };
}

function profileSyncUrl(url) {
  const next = url.replace(/\/daily-fifty-sync\/?$/, '/daily-fifty-sync-profile');
  if (next === url) throw new Error('Daily Fifty sync URL is not in the expected format.');
  return next;
}

async function currentProfile(secret) {
  const jar = await cookies();
  return getSessionProfile(jar.get(AUTH_COOKIE)?.value, secret);
}

async function forward(payload, mode) {
  const { url, key, secret } = configuration();
  const profile = await currentProfile(secret);
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'cache-control': 'no-store' } });

  const headers = {
    'content-type': 'application/json',
    'x-daily-fifty-key': key,
  };
  let targetUrl = url;
  if (profile !== 'primary') {
    targetUrl = profileSyncUrl(url);
    headers['x-daily-fifty-profile'] = profile;
  }

  const response = await fetch(targetUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(mode ? { payload, mode } : { payload }),
    cache: 'no-store',
    signal: AbortSignal.timeout(12000),
  });
  return new NextResponse(await response.text(), {
    status: response.status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
}

export async function POST(request) {
  try {
    return await forward((await request.json())?.payload || {}, null);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}

export async function GET() {
  try {
    return await forward({}, 'read');
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
