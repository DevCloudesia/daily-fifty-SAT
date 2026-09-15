// Uses only Web Crypto (crypto.subtle) so this file works unmodified in both the Edge runtime
// (middleware) and the Node runtime (the login server action) - Next.js middleware cannot use
// Node's crypto module, and duplicating the HMAC logic per-runtime would be easy to let drift.
export const AUTH_COOKIE = 'df_auth';
export const PROFILE_COOKIE = 'df_profile';

const SESSION_MESSAGE = 'daily-fifty-session-v1';
const PROFILES = Object.freeze(['primary', 'shreejay']);

async function hmac(secret, message) {
  // Both real call sites already refuse to reach here with an empty secret, but crypto.subtle
  // throws an opaque DOMException on a zero-length key rather than failing gracefully - a helper
  // this security-critical should not depend purely on callers remembering to check first.
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
  // Compare a fixed number of bytes regardless of where a mismatch occurs, so a wrong guess
  // cannot be narrowed down by measuring how long the comparison took.
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

export async function issueSessionToken(secret, profile = 'primary') {
  const message = profile === 'primary' ? SESSION_MESSAGE : `${SESSION_MESSAGE}:${profile}`;
  return hmac(secret, message);
}

export async function getSessionProfile(token, secret) {
  if (!token || !secret) return null;
  for (const profile of PROFILES) {
    const expected = await issueSessionToken(secret, profile);
    if (timingSafeEqual(token, expected)) return profile;
  }
  return null;
}

export async function verifySessionToken(token, secret) {
  return Boolean(await getSessionProfile(token, secret));
}
