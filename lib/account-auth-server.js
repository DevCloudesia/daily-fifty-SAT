function configuration() {
  const syncUrl = process.env.DAILY_FIFTY_SYNC_URL;
  const key = process.env.DAILY_FIFTY_SYNC_KEY;
  if (!syncUrl || !key) throw new Error('Daily Fifty account environment variables are missing.');
  const authUrl = syncUrl.replace(/\/daily-fifty-sync\/?$/, '/daily-fifty-auth');
  if (authUrl === syncUrl) throw new Error('Daily Fifty sync URL is not in the expected format.');
  return { authUrl, key };
}

export async function accountRequest(action, password) {
  const { authUrl, key } = configuration();
  const response = await fetch(authUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-daily-fifty-key': key,
    },
    body: JSON.stringify({ action, password }),
    cache: 'no-store',
    signal: AbortSignal.timeout(12000),
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  return {
    ok: response.ok && data?.ok === true,
    status: response.status,
    profile: typeof data?.profile === 'string' ? data.profile : null,
    error: typeof data?.error === 'string' ? data.error : 'Account service error.',
  };
}
