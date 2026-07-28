import { NextResponse } from 'next/server';

const UPSTREAM = 'https://daily-fifty-api.vercel.app/api/question?id=';

export const runtime = 'nodejs';

function error(message, status) {
  return NextResponse.json({ ok: false, error: message }, { status, headers: { 'cache-control': 'no-store' } });
}

export async function GET(req) {
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!/^[0-9a-f]{8}$/i.test(id)) return error('Invalid question ID.', 400);
  try {
    const response = await fetch(UPSTREAM + encodeURIComponent(id), {
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(15000),
    });
    // Only a successful body may be cached. Pinning an upstream 500 (or an HTML error page
    // relabelled as JSON) at the CDN broke that question id for a full day.
    if (!response.ok) return error(`Question endpoint returned ${response.status}.`, response.status === 404 ? 404 : 502);
    return new NextResponse(await response.text(), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'public, s-maxage=86400, stale-while-revalidate=604800',
      },
    });
  } catch (e) {
    return error(e instanceof Error ? e.message : String(e), 502);
  }
}
