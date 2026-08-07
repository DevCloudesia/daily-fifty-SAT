const SYNC_URL = '/api/sync';
const KEYS = Object.freeze({
  completed: 'dailyFifty.completed.v4',
  blocked: 'dailyFifty.blocked.v4',
  seen: 'dailyFifty.seen.v1',
  session: 'dailyFifty.session.v4',
  preferences: 'dailyFifty.preferences.v4',
  syncedAt: 'dailyFifty.syncUpdated.v1',
});
const ID_PATTERN = /^[0-9a-f]{8}$/i;

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The live practice state remains authoritative when browser storage is unavailable.
  }
}

export function normalizeIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((id) => String(id).toLowerCase()).filter((id) => ID_PATTERN.test(id)))];
}

export function sameIdSet(left, right) {
  const a = normalizeIds(left).sort();
  const b = normalizeIds(right).sort();
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function stable(value) {
  return JSON.stringify(canonical(value || null));
}

export function sessionChangedSinceRequest(requestSnapshot, currentSnapshot) {
  return stable(requestSnapshot?.session) !== stable(currentSnapshot?.session);
}

export function cloudChanges(remote, local) {
  const completed = normalizeIds(remote?.completed);
  const blocked = normalizeIds(remote?.blocked);
  // During a rolling deployment the older Edge Function does not return `seen` yet. Preserve
  // the browser's append-only history until the backend version that understands it is live.
  const seen = Array.isArray(remote?.seen) ? normalizeIds(remote.seen) : normalizeIds(local?.seen);
  const session = remote?.session && typeof remote.session === 'object' ? remote.session : {};
  return {
    completed,
    blocked,
    seen,
    session,
    changed: !sameIdSet(completed, local?.completed) ||
      !sameIdSet(blocked, local?.blocked) ||
      !sameIdSet(seen, local?.seen) ||
      stable(session) !== stable(local?.session),
  };
}

function snapshot() {
  return {
    completed: normalizeIds(readJson(KEYS.completed, [])),
    blocked: normalizeIds(readJson(KEYS.blocked, [])),
    seen: normalizeIds(readJson(KEYS.seen, [])),
    session: readJson(KEYS.session, {}),
    preferences: readJson(KEYS.preferences, {}),
    updatedAt: localStorage.getItem(KEYS.syncedAt) || new Date(0).toISOString(),
  };
}

function applyRemote(remote, local) {
  if (!remote || typeof remote !== 'object') return true;
  const current = snapshot();
  // A sync response is based on the snapshot captured before its network request began. If the
  // user chose or submitted an answer while that request was in flight, applying the response
  // would replace the new answer with stale cloud state. Keep the live session and retry using it.
  if (sessionChangedSinceRequest(local, current)) return false;
  const changes = cloudChanges(remote, current);
  writeJson(KEYS.completed, changes.completed);
  writeJson(KEYS.blocked, changes.blocked);
  writeJson(KEYS.seen, changes.seen);
  writeJson(KEYS.preferences, remote.preferences && typeof remote.preferences === 'object' ? remote.preferences : {});
  if (Array.isArray(changes.session?.plan) && changes.session.plan.length === 50) writeJson(KEYS.session, changes.session);
  try {
    localStorage.setItem(KEYS.syncedAt, remote.updatedAt || new Date().toISOString());
  } catch {
    // A failed timestamp write should not interrupt practice.
  }
  if (changes.changed) {
    document.dispatchEvent(new CustomEvent('dailyfifty:cloud-progress', {
      detail: { ...remote, completed: changes.completed, blocked: changes.blocked, seen: changes.seen, session: changes.session },
    }));
  }
  return true;
}

let started = false;

export function startCloudSync() {
  if (started || typeof document === 'undefined') return;
  started = true;
  let running = false;
  let timer = null;

  const sync = async () => {
    if (running || document.visibilityState === 'hidden') return;
    running = true;
    const local = snapshot();
    try {
      const response = await fetch(SYNC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: local }),
        cache: 'no-store',
        keepalive: true,
      });
      if (!response.ok) throw new Error(`Sync returned ${response.status}.`);
      const data = await response.json();
      if (data?.ok && !applyRemote(data.payload, local)) schedule(80);
    } catch (error) {
      console.warn('Daily Fifty cloud sync is temporarily unavailable.', error);
    } finally {
      running = false;
    }
  };

  const schedule = (delay = 500) => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => void sync(), delay);
  };
  window.addEventListener('focus', () => schedule(80));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule(80);
  });
  window.setInterval(() => void sync(), 5000);
  schedule(250);
}
