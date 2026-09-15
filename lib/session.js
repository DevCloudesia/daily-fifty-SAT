// Uses only Web Crypto (crypto.subtle) so this file works unmodified in both the Edge runtime
// (middleware) and the Node runtime (the login server action).
export const AUTH_COOKIE = 'df_auth';
export const PROFILE_COOKIE = 'df_profile';

const SESSION_MESSAGE = 'daily-fifty-session-v1';
const DYNAMIC_PROFILE_PATTERN = /^user_[0-9a-f]{32}$/;

async function hmac(secret, message) {
  if (!secret) throw new Error('A non-empty secret is required to compute a session token.');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function timingSafeEqual(a, b) {
  const left = String(a ?? '');
  const right = String(b ?? '');
  const length = Math.max(left.length, right.length, 1);
  let diff = left.length === right.length ? 0 : 1;
  for (let i = 0; i < length; i += 1) {
    diff |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value ?? '')));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function sessionMessage(profile) {
  return profile === 'primary' ? SESSION_MESSAGE : `${SESSION_MESSAGE}:${profile}`;
}

export async function issueSessionToken(secret, profile = 'primary') {
  const signature = await hmac(secret, sessionMessage(profile));
  if (profile === 'primary' || profile === 'shreejay') return signature;
  if (!DYNAMIC_PROFILE_PATTERN.test(profile)) throw new Error('Invalid Daily Fifty profile.');
  return `${profile}.${signature}`;
}

export async function getSessionProfile(token, secret) {
  if (!token || !secret) return null;

  const primary = await issueSessionToken(secret, 'primary');
  if (timingSafeEqual(token, primary)) return 'primary';

  const shreejay = await issueSessionToken(secret, 'shreejay');
  if (timingSafeEqual(token, shreejay)) return 'shreejay';

  const separator = String(token).indexOf('.');
  if (separator <= 0) return null;
  const profile = String(token).slice(0, separator);
  const signature = String(token).slice(separator + 1);
  if (!DYNAMIC_PROFILE_PATTERN.test(profile) || !/^[0-9a-f]{64}$/.test(signature)) return null;
  const expected = await hmac(secret, sessionMessage(profile));
  return timingSafeEqual(signature, expected) ? profile : null;
}

export async function verifySessionToken(token, secret) {
  return Boolean(await getSessionProfile(token, secret));
}
