import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';

// Ephemeral in-memory fallback signing key if AUTH_TOKEN_SECRET is unset
const EPHEMERAL_FALLBACK_SECRET = crypto.randomBytes(32).toString('hex');

function getSigningSecret(): string {
  const envSecret = process.env.AUTH_TOKEN_SECRET?.trim();
  return envSecret && envSecret.length >= 16 ? envSecret : EPHEMERAL_FALLBACK_SECRET;
}

// Stable server-side AES-256-GCM key derived from server-only env secrets (never exposed to client)
function getEncryptionKey(): Buffer {
  const baseSecret =
    process.env.AUTH_TOKEN_SECRET?.trim() ||
    process.env.SQL_PASSWORD?.trim() ||
    EPHEMERAL_FALLBACK_SECRET;
  return crypto.createHash('sha256').update(`kcs-voucher-v1:${baseSecret}`).digest();
}

export function encryptServerSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${authTag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptServerSecret(ciphertext: string | null | undefined): string | null {
  if (!ciphertext) return null;
  const parts = ciphertext.split('.');
  if (parts.length !== 3) return null;
  try {
    const [ivB64, tagB64, dataB64] = parts;
    const key = getEncryptionKey();
    const iv = Buffer.from(ivB64, 'base64url');
    const authTag = Buffer.from(tagB64, 'base64url');
    const encrypted = Buffer.from(dataB64, 'base64url');
    if (iv.length !== 12 || authTag.length !== 16) return null;

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

export const OWNER_ADMIN_EMAIL = 'karana211758@gmail.com';
export const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes
export const REFRESH_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
export const REFRESH_COOKIE_NAME = 'kcs_rt';
export const ACCESS_COOKIE_NAME = 'kcs_at';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function generateOpaqueToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function generateOrderId(prefix: 'KCS' | 'TOP'): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${prefix}-${y}${m}${d}-${rand}`;
}

export interface AccessTokenPayload {
  sub: number; // users.id
  sid: string; // sessions.id
  role: string;
  exp: number;
}

export function signAccessToken(payload: Omit<AccessTokenPayload, 'exp'>): string {
  const fullPayload: AccessTokenPayload = {
    ...payload,
    exp: Date.now() + ACCESS_TOKEN_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as AccessTokenPayload;
    if (!parsed || typeof parsed.sub !== 'number' || typeof parsed.sid !== 'string') return null;
    if (typeof parsed.exp !== 'number' || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  const baseOptions = {
    httpOnly: true,
    secure: true,
    sameSite: 'none' as const,
    partitioned: true,
    path: '/',
  };
  res.cookie(ACCESS_COOKIE_NAME, accessToken, {
    ...baseOptions,
    maxAge: ACCESS_TOKEN_TTL_MS,
  });
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    ...baseOptions,
    maxAge: REFRESH_TOKEN_TTL_MS,
  });
}

export function clearAuthCookies(res: Response) {
  const baseOptions = {
    httpOnly: true,
    secure: true,
    sameSite: 'none' as const,
    partitioned: true,
    path: '/',
  };
  res.clearCookie(ACCESS_COOKIE_NAME, baseOptions);
  res.clearCookie(REFRESH_COOKIE_NAME, baseOptions);
}

// Rely on Express's req.ip (with `trust proxy` = 1) instead of trusting raw client-spoofable X-Forwarded-For headers
export function getClientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || '0.0.0.0';
}

export function maskIp(ip: string): string {
  const cleaned = ip.replace(/^::ffff:/, '').trim();
  if (cleaned.includes('.')) {
    const parts = cleaned.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.x.x`;
    }
  }
  if (cleaned.includes(':')) {
    const parts = cleaned.split(':').filter(Boolean);
    return `${parts.slice(0, 2).join(':')}:xxxx:xxxx`;
  }
  return '0.0.x.x';
}

export function summarizeDevice(userAgent?: string): string {
  const ua = userAgent || '';
  let browser = 'Browser';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';

  let os = 'Desktop';
  if (/iPhone|iPad/i.test(ua)) os = 'iOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Linux/i.test(ua)) os = 'Linux';

  return `${browser} · ${os}`;
}

// In-memory sliding-window rate limiter with exponential lockout
interface RateBucket {
  failures: number;
  windowStart: number;
  lockedUntil: number;
}

const rateBuckets = new Map<string, RateBucket>();
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export function checkRateLimit(key: string, maxAttempts = 5): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket) return { allowed: true, retryAfterSec: 0 };

  if (bucket.lockedUntil > now) {
    return {
      allowed: false,
      retryAfterSec: Math.ceil((bucket.lockedUntil - now) / 1000),
    };
  }

  if (now - bucket.windowStart > WINDOW_MS) {
    rateBuckets.delete(key);
    return { allowed: true, retryAfterSec: 0 };
  }

  if (bucket.failures >= maxAttempts) {
    const exponent = Math.min(bucket.failures - maxAttempts, 4);
    const lockDuration = 60_000 * Math.pow(2, exponent); // 1m, 2m, 4m, 8m, 16m
    bucket.lockedUntil = now + lockDuration;
    rateBuckets.set(key, bucket);
    return { allowed: false, retryAfterSec: Math.ceil(lockDuration / 1000) };
  }

  return { allowed: true, retryAfterSec: 0 };
}

export function recordRateFailure(key: string, maxAttempts = 5) {
  const now = Date.now();
  if (rateBuckets.size > 5000) {
    for (const [k, b] of rateBuckets.entries()) {
      if (now - b.windowStart > WINDOW_MS && b.lockedUntil <= now) {
        rateBuckets.delete(k);
      }
    }
  }
  const existing = rateBuckets.get(key);
  if (!existing || now - existing.windowStart > WINDOW_MS) {
    rateBuckets.set(key, { failures: 1, windowStart: now, lockedUntil: 0 });
    return;
  }
  existing.failures += 1;
  if (existing.failures >= maxAttempts) {
    const exponent = Math.min(existing.failures - maxAttempts, 4);
    existing.lockedUntil = now + 60_000 * Math.pow(2, exponent);
  }
  rateBuckets.set(key, existing);
}

export function clearRateFailures(key: string) {
  rateBuckets.delete(key);
}

// Strict CSRF protection check on state-changing requests
export function verifyCsrfRequest(req: Request): boolean {
  const origin = req.headers.origin;
  const host = ((req.headers['x-forwarded-host'] as string) || req.headers.host || '')
    .split(',')[0]
    .trim();

  // If a browser sends an Origin header, it MUST strictly match the application's host
  if (origin) {
    if (!host) return false;
    try {
      const parsedOrigin = new URL(origin);
      if (parsedOrigin.host !== host) {
        return false;
      }
    } catch {
      return false;
    }
  }

  const customHeader = req.headers['x-requested-with'];
  if (customHeader === 'KING-CAMERA-SHOP' || customHeader === 'XMLHttpRequest') {
    return true;
  }

  return Boolean(origin && host);
}

// TrueMoney Gift Voucher URL parser (strict allowlist + canonical sanitization)
export function parseTrueMoneyVoucherUrl(rawUrl: string): {
  valid: boolean;
  voucherCode: string;
  maskedUrl: string;
  normalizedUrl: string;
} {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'gift.truemoney.com') {
      return { valid: false, voucherCode: '', maskedUrl: '', normalizedUrl: '' };
    }
    const code = parsed.searchParams.get('v')?.trim() || '';
    if (!/^[a-zA-Z0-9]{10,48}$/.test(code)) {
      return { valid: false, voucherCode: '', maskedUrl: '', normalizedUrl: '' };
    }
    const maskedCode =
      code.length > 8
        ? `${code.slice(0, 4)}••••${code.slice(-4)}`
        : '••••••••';
    return {
      valid: true,
      voucherCode: code,
      maskedUrl: `https://gift.truemoney.com/campaign/?v=${maskedCode}`,
      normalizedUrl: `https://gift.truemoney.com/campaign/?v=${code}`,
    };
  } catch {
    return { valid: false, voucherCode: '', maskedUrl: '', normalizedUrl: '' };
  }
}
