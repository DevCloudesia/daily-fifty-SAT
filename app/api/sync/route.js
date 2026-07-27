import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 15;

function configuration() {
  const url = process.env.DAILY_FIFTY_SYNC_URL;
  const key = process.env.DAILY_FIFTY_SYNC_KEY;
  if (!url || !key) throw new Error('Daily Fifty sync environment variables are missing.');
  return { url, key };
}

async function forward(payload) {
  const { url, key } = configuration();
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-daily-fifty-key': key,
    },
    body: JSON.stringify({ payload }),
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
    return await forward((await request.json())?.payload || {});
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}

export async function GET() {
  try {
    return await forward({});
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
