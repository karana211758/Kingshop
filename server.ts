import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import { z } from 'zod';
import { and, asc, count, desc, eq, gt, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { db } from './src/db/index.ts';
import {
  activityLogs,
  bannedIps,
  orders,
  productAccounts,
  products,
  sessions,
  storeSettings,
  topupTransactions,
  users,
  walletLedger,
} from './src/db/schema.ts';
import { ensureProductsSeeded } from './src/db/seed.ts';
import { adminAuth } from './src/lib/firebase-admin.ts';
import {
  attachAuthIfPresent,
  AuthedRequest,
  blockBannedIp,
  requireAdmin,
  requireAuth,
  requireCsrf,
} from './src/server/authMiddleware.ts';
import {
  checkRateLimit,
  clearAuthCookies,
  clearRateFailures,
  decryptServerSecret,
  encryptServerSecret,
  generateOpaqueToken,
  generateOrderId,
  getClientIp,
  hashPassword,
  maskIp,
  OWNER_ADMIN_EMAIL,
  parseTrueMoneyVoucherUrl,
  recordRateFailure,
  REFRESH_COOKIE_NAME,
  REFRESH_TOKEN_TTL_MS,
  setAuthCookies,
  sha256Hex,
  signAccessToken,
  summarizeDevice,
  verifyPassword,
} from './src/server/security.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,128}$/;

const registerSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(3)
      .max(20)
      .regex(/^[a-zA-Z0-9_]+$/, 'Username must be 3-20 alphanumeric or underscore characters'),
    email: z.string().trim().email().max(120),
    password: z
      .string()
      .regex(
        PASSWORD_REGEX,
        'Password must be at least 8 characters and include uppercase, lowercase, number, and symbol'
      ),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(120),
  password: z.string().min(1).max(128),
});

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z
      .string()
      .regex(
        PASSWORD_REGEX,
        'Password must be at least 8 characters and include uppercase, lowercase, number, and symbol'
      ),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

const checkoutSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        quantity: z.number().int().min(1).max(20),
      })
    )
    .min(1)
    .max(10),
});

const adminAddAccountsSchema = z.object({
  accounts: z
    .array(
      z.object({
        username: z.string().trim().min(1, 'Account username is required').max(120),
        password: z.string().trim().min(1, 'Account password is required').max(180),
        note: z.string().trim().max(160).optional(),
      })
    )
    .min(1, 'Add at least one account')
    .max(200, 'Maximum 200 accounts per batch'),
});

const topupConfirmSchema = z.object({
  channel: z.literal('TRUEMONEY_VOUCHER'),
  amountThb: z.number().min(10).max(50000),
  voucherUrl: z.string().trim().min(10).max(200),
});

const adminProductCreateSchema = z.object({
  nameEn: z.string().trim().min(2).max(120),
  nameTh: z.string().trim().min(2).max(160),
  descriptionEn: z.string().trim().min(5).max(600),
  descriptionTh: z.string().trim().min(5).max(600),
  category: z.enum(['Titan', 'Mythic', 'Godly']),
  rarity: z.string().trim().min(2).max(40),
  priceThb: z.number().min(1).max(100000),
  stock: z.number().int().min(0).max(10000),
  imageUrl: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .refine(
      (val) => val.startsWith('/') || val.startsWith('https://'),
      'Image URL must be a relative path or HTTPS URL'
    ),
});

const adminProductPatchSchema = z.object({
  priceThb: z.number().min(1).max(100000).optional(),
  stock: z.number().int().min(0).max(10000).optional(),
  isActive: z.boolean().optional(),
  deliveryAccountUsername: z.string().trim().max(60).optional(),
  deliveryAccountPassword: z.string().trim().max(120).optional(),
});

const adminOrderPatchSchema = z.object({
  status: z.enum(['DELIVERED', 'REFUNDED']),
  adminDeliveryNote: z.string().trim().max(240).optional(),
});

const adminTopupPatchSchema = z.object({
  status: z.enum(['COMPLETED', 'FAILED']),
  verifiedThb: z.number().min(1).max(100000).optional(),
  reviewNote: z.string().trim().max(240).optional(),
});

async function logActivity(params: {
  userId: number | null;
  eventType: string;
  status?: 'SUCCESS' | 'PENDING' | 'FAILED';
  deltaSatang?: number | null;
  balanceBeforeSatang?: number | null;
  balanceAfterSatang?: number | null;
  req: express.Request;
  metadata?: string;
}) {
  try {
    await db.insert(activityLogs).values({
      userId: params.userId,
      eventType: params.eventType,
      status: params.status ?? 'SUCCESS',
      deltaSatang: params.deltaSatang ?? null,
      balanceBeforeSatang: params.balanceBeforeSatang ?? null,
      balanceAfterSatang: params.balanceAfterSatang ?? null,
      maskedIp: maskIp(getClientIp(params.req)),
      deviceSummary: summarizeDevice(params.req.headers['user-agent']),
      metadata: params.metadata ?? null,
    });
  } catch (err) {
    console.error('Failed to write activity log:', err);
  }
}

async function createSessionForUser(
  user: { id: number; role: string },
  req: express.Request,
  res: express.Response
) {
  const sessionId = crypto.randomUUID();
  const rawRefreshToken = generateOpaqueToken();
  const refreshTokenHash = sha256Hex(rawRefreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  await db.insert(sessions).values({
    id: sessionId,
    userId: user.id,
    refreshTokenHash,
    userAgent: summarizeDevice(req.headers['user-agent']),
    maskedIp: maskIp(getClientIp(req)),
    expiresAt,
  });

  const accessToken = signAccessToken({
    sub: user.id,
    sid: sessionId,
    role: user.role,
  });

  setAuthCookies(res, accessToken, rawRefreshToken);
  return { accessToken, sessionId };
}

function isOwnerWithInfiniteBalance(user: { role: string; email: string }): boolean {
  return (
    user.role === 'OWNER' &&
    user.email.toLowerCase() === OWNER_ADMIN_EMAIL.toLowerCase()
  );
}

function maskThaiPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 10) {
    return `${digits.slice(0, 2)}*-***-${digits.slice(-4)}`;
  }
  return 'Not set';
}

async function getStoreSettingsMap(): Promise<Record<string, string>> {
  const rows = await db.select().from(storeSettings);
  const map: Record<string, string> = {};
  for (const r of rows) {
    map[r.key] = r.value;
  }
  return map;
}

interface DeliveredAccountEntry {
  username: string;
  password: string;
  note?: string;
}

function parseDeliveredAccounts(order: {
  deliveredAccountsJson: string | null;
  deliveredAccountUsername: string | null;
  deliveredAccountPassword: string | null;
}): DeliveredAccountEntry[] {
  if (order.deliveredAccountsJson) {
    try {
      const parsed = JSON.parse(order.deliveredAccountsJson);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (entry): entry is DeliveredAccountEntry =>
            entry && typeof entry.username === 'string' && typeof entry.password === 'string'
        );
      }
    } catch {
      // Fall back to legacy single-account columns
    }
  }
  if (order.deliveredAccountUsername) {
    return [
      {
        username: order.deliveredAccountUsername,
        password: order.deliveredAccountPassword || '',
      },
    ];
  }
  return [];
}

function getBangkokDateAndHour(input: Date | string): { dateStr: string; hour: number } {
  const d = typeof input === 'string' ? new Date(input) : input;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const get = (type: string) => parts.find((p) => p.type === type)?.value || '00';
  const rawHour = Number(get('hour'));
  return {
    dateStr: `${get('year')}-${get('month')}-${get('day')}`,
    hour: rawHour === 24 ? 0 : Math.min(23, Math.max(0, rawHour)),
  };
}

function getBangkokPastDays(daysCount: number): string[] {
  const result: string[] = [];
  const now = Date.now();
  for (let i = daysCount - 1; i >= 0; i--) {
    const dt = new Date(now - i * 24 * 60 * 60 * 1000);
    result.push(getBangkokDateAndHour(dt).dateStr);
  }
  return result;
}

function serializeUser(u: {
  id: number;
  username: string;
  email: string;
  role: string;
  balanceSatang: number;
  totalToppedUpSatang: number;
  totalSpentSatang: number;
  createdAt: Date;
}) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
    isInfiniteBalance: isOwnerWithInfiniteBalance(u),
    balanceSatang: u.balanceSatang,
    totalToppedUpSatang: u.totalToppedUpSatang,
    totalSpentSatang: u.totalSpentSatang,
    createdAt: u.createdAt,
  };
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // Baseline security headers (keeping iframe preview compatible)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use('/api', attachAuthIfPresent);

  // =========================================================================
  // AUTH ROUTES
  // =========================================================================

  app.post('/api/auth/register', blockBannedIp, requireCsrf, async (req, res) => {
    const ip = getClientIp(req);
    const rateKey = `register:${ip}`;
    const rate = checkRateLimit(rateKey, 8);
    if (!rate.allowed) {
      return res
        .status(429)
        .json({ error: 'Too many registration attempts. Please try again later.', retryAfterSec: rate.retryAfterSec });
    }

    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid registration fields',
      });
    }

    const normalizedEmail = parsed.data.email.toLowerCase();
    const cleanUsername = parsed.data.username;

    try {
      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(
          or(
            eq(sql`lower(${users.email})`, normalizedEmail),
            eq(sql`lower(${users.username})`, cleanUsername.toLowerCase())
          )
        )
        .limit(1);

      if (existing.length > 0) {
        recordRateFailure(rateKey, 8);
        return res.status(409).json({
          error: 'An account with this username or email already exists.',
        });
      }

      const passwordHash = await hashPassword(parsed.data.password);
      const [created] = await db
        .insert(users)
        .values({
          username: cleanUsername,
          email: normalizedEmail,
          passwordHash,
          role: 'USER',
        })
        .returning();

      clearRateFailures(rateKey);
      const { accessToken } = await createSessionForUser(created, req, res);

      await logActivity({
        userId: created.id,
        eventType: 'REGISTER',
        status: 'SUCCESS',
        req,
        metadata: `Registered ${created.username}`,
      });

      return res.status(201).json({
        user: serializeUser(created),
        accessToken,
      });
    } catch (err: any) {
      if (err?.code === '23505') {
        return res.status(409).json({
          error: 'An account with this username or email already exists.',
        });
      }
      console.error('Register failed:', err);
      return res.status(500).json({ error: 'Unable to create account right now.' });
    }
  });

  app.post('/api/auth/login', blockBannedIp, requireCsrf, async (req, res) => {
    const ip = getClientIp(req);
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const identifierLower = parsed.data.identifier.toLowerCase();
    const ipKey = `login:ip:${ip}`;
    const acctKey = `login:acct:${identifierLower}`;

    const ipRate = checkRateLimit(ipKey, 5);
    const acctRate = checkRateLimit(acctKey, 5);
    if (!ipRate.allowed || !acctRate.allowed) {
      return res.status(429).json({
        error: 'Too many failed login attempts. Please wait before trying again.',
        retryAfterSec: Math.max(ipRate.retryAfterSec, acctRate.retryAfterSec),
      });
    }

    try {
      const [userRow] = await db
        .select()
        .from(users)
        .where(
          or(
            eq(sql`lower(${users.email})`, identifierLower),
            eq(sql`lower(${users.username})`, identifierLower)
          )
        )
        .limit(1);

      if (!userRow || !userRow.passwordHash) {
        recordRateFailure(ipKey, 5);
        recordRateFailure(acctKey, 5);
        await logActivity({
          userId: userRow?.id ?? null,
          eventType: 'FAILED_LOGIN',
          status: 'FAILED',
          req,
          metadata: 'Invalid password or unknown account',
        });
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      if (userRow.isBanned) {
        return res.status(403).json({ error: 'This account has been suspended.' });
      }

      const valid = await verifyPassword(parsed.data.password, userRow.passwordHash);
      if (!valid) {
        recordRateFailure(ipKey, 5);
        recordRateFailure(acctKey, 5);
        await logActivity({
          userId: userRow.id,
          eventType: 'FAILED_LOGIN',
          status: 'FAILED',
          req,
          metadata: 'Incorrect password attempt',
        });
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      clearRateFailures(ipKey);
      clearRateFailures(acctKey);

      const { accessToken } = await createSessionForUser(userRow, req, res);
      await logActivity({
        userId: userRow.id,
        eventType: 'SIGN_IN',
        status: 'SUCCESS',
        req,
        metadata: 'Password authentication',
      });

      return res.json({
        user: serializeUser(userRow),
        accessToken,
      });
    } catch (err) {
      console.error('Login failed:', err);
      return res.status(500).json({ error: 'Sign in unavailable. Please try again.' });
    }
  });

  // Firebase Google Sign-In linking to Cloud SQL users table
  app.post('/api/auth/firebase', blockBannedIp, requireCsrf, async (req, res) => {
    const ip = getClientIp(req);
    const rateKey = `firebase:ip:${ip}`;
    const rate = checkRateLimit(rateKey, 15);
    if (!rate.allowed) {
      return res.status(429).json({
        error: 'Too many sign-in attempts. Please wait before trying again.',
        retryAfterSec: rate.retryAfterSec,
      });
    }

    const idToken = typeof req.body?.idToken === 'string' ? req.body.idToken : '';
    if (!idToken) {
      return res.status(400).json({ error: 'Missing Firebase ID token' });
    }

    try {
      const decoded = await adminAuth.verifyIdToken(idToken);
      const email = (decoded.email || '').toLowerCase().trim();
      if (!email || decoded.email_verified !== true) {
        recordRateFailure(rateKey, 15);
        return res
          .status(403)
          .json({ error: 'A verified Google email address is required to sign in.' });
      }

      const isOwner = email === OWNER_ADMIN_EMAIL.toLowerCase();

      // Check existing user by uid or email first
      const [existing] = await db
        .select()
        .from(users)
        .where(or(eq(users.uid, decoded.uid), eq(sql`lower(${users.email})`, email)))
        .limit(1);

      let userRow = existing;

      if (!userRow) {
        const baseName = email
          .split('@')[0]
          .replace(/[^a-zA-Z0-9_]/g, '')
          .slice(0, 14) || 'player';
        const suffix = crypto.randomBytes(2).toString('hex');
        const generatedUsername = `${baseName}_${suffix}`.slice(0, 20);

        const inserted = await db
          .insert(users)
          .values({
            uid: decoded.uid,
            username: generatedUsername,
            email,
            role: isOwner ? 'OWNER' : 'USER',
          })
          .onConflictDoUpdate({
            target: users.uid,
            set: {
              email,
              updatedAt: new Date(),
            },
          })
          .returning();
        userRow = inserted[0];
      } else {
        const nextRole = isOwner ? 'OWNER' : userRow.role;
        const [updated] = await db
          .update(users)
          .set({
            uid: decoded.uid,
            role: nextRole,
            updatedAt: new Date(),
          })
          .where(eq(users.id, userRow.id))
          .returning();
        userRow = updated;
      }

      if (userRow.isBanned) {
        return res.status(403).json({ error: 'This account has been suspended.' });
      }

      clearRateFailures(rateKey);
      const { accessToken } = await createSessionForUser(userRow, req, res);
      await logActivity({
        userId: userRow.id,
        eventType: 'SIGN_IN',
        status: 'SUCCESS',
        req,
        metadata: 'Google Sign-In (Firebase Auth)',
      });

      return res.json({
        user: serializeUser(userRow),
        accessToken,
      });
    } catch (err) {
      recordRateFailure(rateKey, 15);
      console.error('Firebase token verification failed:', err);
      return res.status(401).json({ error: 'Google sign-in verification failed.' });
    }
  });

  app.post('/api/auth/refresh', requireCsrf, async (req, res) => {
    const rawRefresh = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    if (!rawRefresh) {
      return res.status(401).json({ error: 'No active session' });
    }

    try {
      const tokenHash = sha256Hex(rawRefresh);
      const [sessionRow] = await db
        .select()
        .from(sessions)
        .where(
          and(
            eq(sessions.refreshTokenHash, tokenHash),
            isNull(sessions.revokedAt),
            gt(sessions.expiresAt, new Date())
          )
        )
        .limit(1);

      if (!sessionRow) {
        clearAuthCookies(res);
        return res.status(401).json({ error: 'Session expired' });
      }

      const [userRow] = await db
        .select()
        .from(users)
        .where(eq(users.id, sessionRow.userId))
        .limit(1);

      if (!userRow || userRow.isBanned) {
        clearAuthCookies(res);
        return res.status(403).json({ error: 'Account unavailable' });
      }

      // Rotate refresh token atomically
      const nextRefresh = generateOpaqueToken();
      const nextRefreshHash = sha256Hex(nextRefresh);
      const nextExpiry = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

      await db
        .update(sessions)
        .set({
          refreshTokenHash: nextRefreshHash,
          expiresAt: nextExpiry,
          maskedIp: maskIp(getClientIp(req)),
        })
        .where(eq(sessions.id, sessionRow.id));

      const accessToken = signAccessToken({
        sub: userRow.id,
        sid: sessionRow.id,
        role: userRow.role,
      });

      setAuthCookies(res, accessToken, nextRefresh);
      return res.json({
        user: serializeUser(userRow),
        accessToken,
      });
    } catch (err) {
      console.error('Session refresh failed:', err);
      return res.status(500).json({ error: 'Could not refresh session' });
    }
  });

  app.post('/api/auth/logout', requireCsrf, async (req: AuthedRequest, res) => {
    try {
      if (req.sessionId) {
        await db
          .update(sessions)
          .set({ revokedAt: new Date() })
          .where(eq(sessions.id, req.sessionId));
      }
      clearAuthCookies(res);
      return res.json({ ok: true });
    } catch (err) {
      console.error('Logout error:', err);
      clearAuthCookies(res);
      return res.json({ ok: true });
    }
  });

  app.post('/api/auth/logout-all', requireCsrf, requireAuth, async (req: AuthedRequest, res) => {
    try {
      const keepCurrent = req.body?.keepCurrent !== false;
      const userId = req.authUser!.id;

      if (keepCurrent && req.sessionId) {
        await db
          .update(sessions)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(sessions.userId, userId),
              ne(sessions.id, req.sessionId),
              isNull(sessions.revokedAt)
            )
          );
      } else {
        await db
          .update(sessions)
          .set({ revokedAt: new Date() })
          .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
        clearAuthCookies(res);
      }

      await logActivity({
        userId,
        eventType: 'LOGGED_OUT_ALL',
        status: 'SUCCESS',
        req,
        metadata: keepCurrent ? 'Revoked all other device sessions' : 'Revoked all device sessions',
      });

      return res.json({ ok: true });
    } catch (err) {
      console.error('Logout-all error:', err);
      return res.status(500).json({ error: 'Unable to revoke sessions' });
    }
  });

  app.get('/api/auth/me', async (req: AuthedRequest, res) => {
    try {
      const [{ value: adminCount }] = await db
        .select({ value: count() })
        .from(users)
        .where(inArray(users.role, ['ADMIN', 'OWNER']));

      if (!req.authUser) {
        return res.json({
          user: null,
          hasAdminAccount: adminCount > 0,
        });
      }

      return res.json({
        user: serializeUser(req.authUser),
        currentSessionId: req.sessionId,
        hasAdminAccount: adminCount > 0,
        requiresAdminSecret: Boolean(process.env.ADMIN_BOOTSTRAP_SECRET?.trim()),
      });
    } catch (err) {
      console.error('Auth me error:', err);
      return res.status(500).json({ error: 'Could not load account state' });
    }
  });

  app.post('/api/auth/change-password', blockBannedIp, requireCsrf, requireAuth, async (req: AuthedRequest, res) => {
    const userId = req.authUser!.id;
    const ip = getClientIp(req);
    const rateKey = `changepw:${userId}:${ip}`;
    const rate = checkRateLimit(rateKey, 5);
    if (!rate.allowed) {
      return res.status(429).json({
        error: 'Too many password change attempts. Please wait before trying again.',
        retryAfterSec: rate.retryAfterSec,
      });
    }

    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid password format',
      });
    }

    try {
      const [userRow] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!userRow) {
        return res.status(404).json({ error: 'Account not found' });
      }

      if (userRow.passwordHash) {
        const ok = await verifyPassword(parsed.data.currentPassword, userRow.passwordHash);
        if (!ok) {
          recordRateFailure(rateKey, 5);
          return res.status(400).json({ error: 'Current password is incorrect' });
        }
      }

      clearRateFailures(rateKey);
      const nextHash = await hashPassword(parsed.data.newPassword);
      await db
        .update(users)
        .set({ passwordHash: nextHash, updatedAt: new Date() })
        .where(eq(users.id, userId));

      // Revoke all other sessions on password change
      if (req.sessionId) {
        await db
          .update(sessions)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(sessions.userId, userId),
              ne(sessions.id, req.sessionId),
              isNull(sessions.revokedAt)
            )
          );
      }

      await logActivity({
        userId,
        eventType: 'PASSWORD_CHANGED',
        status: 'SUCCESS',
        req,
        metadata: 'Password updated and other sessions revoked',
      });

      return res.json({ ok: true });
    } catch (err) {
      console.error('Change password error:', err);
      return res.status(500).json({ error: 'Could not update password' });
    }
  });

  // First-run owner admin bootstrap (locks once an admin exists unless ADMIN_BOOTSTRAP_SECRET matches)
  app.post('/api/auth/claim-admin', blockBannedIp, requireCsrf, requireAuth, async (req: AuthedRequest, res) => {
    const userId = req.authUser!.id;
    const ip = getClientIp(req);
    const rateKey = `claimadmin:${userId}:${ip}`;
    const rate = checkRateLimit(rateKey, 5);
    if (!rate.allowed) {
      return res.status(429).json({
        error: 'Too many attempts. Please wait before trying again.',
        retryAfterSec: rate.retryAfterSec,
      });
    }

    try {
      const envSecret = process.env.ADMIN_BOOTSTRAP_SECRET?.trim();
      const providedSecret = typeof req.body?.secret === 'string' ? req.body.secret.trim() : '';

      const updatedUser = await db.transaction(async (tx) => {
        const existingAdmins = await tx
          .select({ id: users.id })
          .from(users)
          .where(inArray(users.role, ['ADMIN', 'OWNER']));

        if (envSecret) {
          const providedBuf = Buffer.from(providedSecret);
          const envBuf = Buffer.from(envSecret);
          const matches =
            providedBuf.length === envBuf.length && crypto.timingSafeEqual(providedBuf, envBuf);
          if (!matches) {
            throw new Error('INVALID_SECRET');
          }
        } else if (existingAdmins.length > 0) {
          throw new Error('ADMIN_ALREADY_EXISTS');
        }

        const [promoted] = await tx
          .update(users)
          .set({ role: 'ADMIN', updatedAt: new Date() })
          .where(eq(users.id, userId))
          .returning();

        return promoted;
      });

      clearRateFailures(rateKey);
      await logActivity({
        userId: updatedUser.id,
        eventType: 'ADMIN_ACTION',
        status: 'SUCCESS',
        req,
        metadata: 'Claimed initial store administrator role',
      });

      const accessToken = signAccessToken({
        sub: updatedUser.id,
        sid: req.sessionId!,
        role: updatedUser.role,
      });

      return res.json({ user: serializeUser(updatedUser), accessToken });
    } catch (err: any) {
      if (err?.message === 'INVALID_SECRET') {
        recordRateFailure(rateKey, 5);
        return res.status(403).json({ error: 'Invalid admin bootstrap secret' });
      }
      if (err?.message === 'ADMIN_ALREADY_EXISTS') {
        recordRateFailure(rateKey, 5);
        return res.status(409).json({ error: 'An administrator account is already configured' });
      }
      console.error('Claim admin error:', err);
      return res.status(500).json({ error: 'Unable to claim admin role' });
    }
  });

  // =========================================================================
  // USER BALANCE, PURCHASES, ACTIVITY & SESSIONS
  // =========================================================================

  app.get('/api/user/balance', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const userId = req.authUser!.id;
      const [userRow] = await db
        .select({
          email: users.email,
          balanceSatang: users.balanceSatang,
          totalToppedUpSatang: users.totalToppedUpSatang,
          totalSpentSatang: users.totalSpentSatang,
          role: users.role,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const [{ value: activeSessions }] = await db
        .select({ value: count() })
        .from(sessions)
        .where(
          and(
            eq(sessions.userId, userId),
            isNull(sessions.revokedAt),
            gt(sessions.expiresAt, new Date())
          )
        );

      return res.json({
        balanceSatang: userRow?.balanceSatang ?? 0,
        totalToppedUpSatang: userRow?.totalToppedUpSatang ?? 0,
        totalSpentSatang: userRow?.totalSpentSatang ?? 0,
        activeSessions,
        role: userRow?.role ?? 'USER',
        isInfiniteBalance: userRow ? isOwnerWithInfiniteBalance(userRow) : false,
      });
    } catch (err) {
      console.error('Balance fetch failed:', err);
      return res.status(500).json({ error: 'Could not load wallet balance' });
    }
  });

  app.get('/api/user/purchases', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const userId = req.authUser!.id;
      const status = typeof req.query.status === 'string' ? req.query.status : 'ALL';
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = 8;
      const offset = (page - 1) * limit;

      const conditions = [eq(orders.userId, userId)];
      if (['PENDING_DELIVERY', 'DELIVERED', 'REFUNDED'].includes(status)) {
        conditions.push(eq(orders.status, status));
      }

      const whereClause = and(...conditions);

      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(orders)
          .where(whereClause)
          .orderBy(desc(orders.createdAt))
          .limit(limit)
          .offset(offset),
        db.select({ total: count() }).from(orders).where(whereClause),
      ]);

      return res.json({
        items: rows.map((row) => ({
          ...row,
          deliveredAccounts: parseDeliveredAccounts(row),
        })),
        page,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        total,
      });
    } catch (err) {
      console.error('Purchases fetch failed:', err);
      return res.status(500).json({ error: 'Could not load purchase history' });
    }
  });

  app.get('/api/user/activity', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const userId = req.authUser!.id;
      const filter = typeof req.query.filter === 'string' ? req.query.filter : 'ALL';
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = 10;
      const offset = (page - 1) * limit;

      const conditions = [eq(activityLogs.userId, userId)];
      if (filter === 'TOPUPS') {
        conditions.push(inArray(activityLogs.eventType, ['VOUCHER_TOPUP', 'QR_TOPUP']));
      } else if (filter === 'PURCHASES') {
        conditions.push(inArray(activityLogs.eventType, ['ITEM_PURCHASE', 'REFUND_CREDITED']));
      } else if (filter === 'SECURITY') {
        conditions.push(
          inArray(activityLogs.eventType, [
            'SIGN_IN',
            'FAILED_LOGIN',
            'REGISTER',
            'PASSWORD_CHANGED',
            'LOGGED_OUT_ALL',
          ])
        );
      }

      const whereClause = and(...conditions);

      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(activityLogs)
          .where(whereClause)
          .orderBy(desc(activityLogs.createdAt))
          .limit(limit)
          .offset(offset),
        db.select({ total: count() }).from(activityLogs).where(whereClause),
      ]);

      return res.json({
        items: rows,
        page,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        total,
      });
    } catch (err) {
      console.error('Activity fetch failed:', err);
      return res.status(500).json({ error: 'Could not load activity history' });
    }
  });

  app.get('/api/user/sessions', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const rows = await db
        .select({
          id: sessions.id,
          userAgent: sessions.userAgent,
          maskedIp: sessions.maskedIp,
          createdAt: sessions.createdAt,
          expiresAt: sessions.expiresAt,
        })
        .from(sessions)
        .where(
          and(
            eq(sessions.userId, req.authUser!.id),
            isNull(sessions.revokedAt),
            gt(sessions.expiresAt, new Date())
          )
        )
        .orderBy(desc(sessions.createdAt));

      return res.json({
        sessions: rows.map((s) => ({
          ...s,
          isCurrent: s.id === req.sessionId,
        })),
      });
    } catch (err) {
      console.error('Sessions fetch failed:', err);
      return res.status(500).json({ error: 'Could not load active sessions' });
    }
  });

  // =========================================================================
  // PRODUCTS & ATOMIC CHECKOUT
  // =========================================================================

  app.get('/api/products', async (_req, res) => {
    try {
      await ensureProductsSeeded();
      const rows = await db
        .select({
          id: products.id,
          slug: products.slug,
          nameEn: products.nameEn,
          nameTh: products.nameTh,
          descriptionEn: products.descriptionEn,
          descriptionTh: products.descriptionTh,
          category: products.category,
          rarity: products.rarity,
          priceSatang: products.priceSatang,
          stock: products.stock,
          imageUrl: products.imageUrl,
          isActive: products.isActive,
          deliveryAccountUsername: products.deliveryAccountUsername,
        })
        .from(products)
        .where(eq(products.isActive, true))
        .orderBy(products.priceSatang);

      // Never expose account credentials on the public catalog endpoint
      return res.json({
        products: rows.map(({ deliveryAccountUsername: _u, ...pub }) => ({
          ...pub,
          hasAutoAccountDelivery: true,
        })),
      });
    } catch (err) {
      console.error('Products fetch failed:', err);
      return res.status(500).json({ error: 'Could not load store catalog' });
    }
  });

  app.post('/api/orders/checkout', blockBannedIp, requireCsrf, requireAuth, async (req: AuthedRequest, res) => {
    const userId = req.authUser!.id;
    const ip = getClientIp(req);
    const checkoutRateKey = `checkout:${userId}:${ip}`;
    const checkoutRate = checkRateLimit(checkoutRateKey, 15);
    if (!checkoutRate.allowed) {
      return res.status(429).json({
        error: 'Too many checkout attempts. Please wait a moment and try again.',
        retryAfterSec: checkoutRate.retryAfterSec,
      });
    }

    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) {
      recordRateFailure(checkoutRateKey, 15);
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid checkout payload',
      });
    }

    const { items } = parsed.data;

    // Deduplicate product quantities and sort by productId to avoid deadlocks
    const mergedMap = new Map<number, number>();
    for (const item of items) {
      mergedMap.set(item.productId, (mergedMap.get(item.productId) || 0) + item.quantity);
    }
    const sortedItems = Array.from(mergedMap.entries())
      .map(([productId, quantity]) => ({ productId, quantity }))
      .sort((a, b) => a.productId - b.productId);

    try {
      const result = await db.transaction(async (tx) => {
        // Lock user row FOR UPDATE
        const [lockedUser] = await tx
          .select()
          .from(users)
          .where(eq(users.id, userId))
          .for('update');

        if (!lockedUser || lockedUser.isBanned) {
          throw new Error('ACCOUNT_UNAVAILABLE');
        }

        const ownerUnlimited = isOwnerWithInfiniteBalance(lockedUser);

        // Lock all requested product rows & claim unique unsold accounts from product_accounts
        let grandTotalSatang = 0;
        const lockedProducts: {
          product: typeof products.$inferSelect;
          quantity: number;
          lineTotalSatang: number;
          claimedAccounts: (typeof productAccounts.$inferSelect)[];
        }[] = [];

        for (const item of sortedItems) {
          const [lockedProduct] = await tx
            .select()
            .from(products)
            .where(eq(products.id, item.productId))
            .for('update');

          if (!lockedProduct || !lockedProduct.isActive) {
            throw new Error('PRODUCT_UNAVAILABLE');
          }

          const claimedAccounts = await tx
            .select()
            .from(productAccounts)
            .where(
              and(
                eq(productAccounts.productId, item.productId),
                eq(productAccounts.isSold, false)
              )
            )
            .orderBy(asc(productAccounts.id))
            .limit(item.quantity)
            .for('update', { skipLocked: true });

          if (claimedAccounts.length < item.quantity) {
            throw new Error(`OUT_OF_STOCK:${lockedProduct.nameEn}`);
          }

          const lineTotalSatang = lockedProduct.priceSatang * item.quantity;
          grandTotalSatang += lineTotalSatang;
          lockedProducts.push({
            product: lockedProduct,
            quantity: item.quantity,
            lineTotalSatang,
            claimedAccounts,
          });
        }

        if (!ownerUnlimited && lockedUser.balanceSatang < grandTotalSatang) {
          throw new Error('INSUFFICIENT_BALANCE');
        }

        const balanceBefore = lockedUser.balanceSatang;
        const balanceAfter = ownerUnlimited ? balanceBefore : balanceBefore - grandTotalSatang;

        await tx
          .update(users)
          .set({
            balanceSatang: balanceAfter,
            totalSpentSatang: lockedUser.totalSpentSatang + grandTotalSatang,
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));

        const createdOrders: (typeof orders.$inferSelect & {
          deliveredAccounts: DeliveredAccountEntry[];
        })[] = [];
        let runningBalance = balanceBefore;

        for (const entry of lockedProducts) {
          const orderId = generateOrderId('KCS');
          const deliveredList: DeliveredAccountEntry[] = entry.claimedAccounts.map((acc) => ({
            username: acc.accountUsername,
            password: acc.accountPassword,
            ...(acc.note ? { note: acc.note } : {}),
          }));

          const [createdOrder] = await tx
            .insert(orders)
            .values({
              id: orderId,
              userId,
              productId: entry.product.id,
              productNameSnapshot: entry.product.nameEn,
              productImageSnapshot: entry.product.imageUrl,
              quantity: entry.quantity,
              unitPriceSatang: entry.product.priceSatang,
              totalSatang: entry.lineTotalSatang,
              robloxUsername: 'Account Vault',
              deliveredAccountUsername: deliveredList[0]?.username || null,
              deliveredAccountPassword: deliveredList[0]?.password || null,
              deliveredAccountsJson: JSON.stringify(deliveredList),
              status: 'DELIVERED',
              adminDeliveryNote: `Auto-delivered ${deliveredList.length} Roblox account(s) from vault`,
            })
            .returning();

          const claimedIds = entry.claimedAccounts.map((a) => a.id);
          await tx
            .update(productAccounts)
            .set({
              isSold: true,
              soldToOrderId: orderId,
              soldAt: new Date(),
            })
            .where(inArray(productAccounts.id, claimedIds));

          // Recompute exact live stock count for this unit
          const [{ remaining }] = await tx
            .select({ remaining: count() })
            .from(productAccounts)
            .where(
              and(
                eq(productAccounts.productId, entry.product.id),
                eq(productAccounts.isSold, false)
              )
            );

          await tx
            .update(products)
            .set({
              stock: remaining,
              updatedAt: new Date(),
            })
            .where(eq(products.id, entry.product.id));

          createdOrders.push({
            ...createdOrder,
            deliveredAccounts: deliveredList,
          });

          const effectiveDelta = ownerUnlimited ? 0 : -entry.lineTotalSatang;
          const nextRunning = runningBalance + effectiveDelta;

          await tx.insert(walletLedger).values({
            userId,
            type: 'PURCHASE',
            deltaSatang: effectiveDelta,
            balanceBeforeSatang: runningBalance,
            balanceAfterSatang: nextRunning,
            referenceId: orderId,
            note: ownerUnlimited
              ? `OWNER Infinite Balance · ${entry.product.nameEn} x${entry.quantity}`
              : `${entry.product.nameEn} x${entry.quantity} (Account Vault)`,
          });

          await tx.insert(activityLogs).values({
            userId,
            eventType: 'ITEM_PURCHASE',
            status: 'SUCCESS',
            deltaSatang: effectiveDelta,
            balanceBeforeSatang: runningBalance,
            balanceAfterSatang: nextRunning,
            maskedIp: maskIp(getClientIp(req)),
            deviceSummary: summarizeDevice(req.headers['user-agent']),
            metadata: `${orderId} · ${entry.product.nameEn} x${entry.quantity}${
              ownerUnlimited ? ' · OWNER Unlimited' : ''
            }`,
          });

          runningBalance = nextRunning;
        }

        return {
          orders: createdOrders,
          totalPaidSatang: grandTotalSatang,
          balanceSatang: balanceAfter,
          isInfiniteBalance: ownerUnlimited,
        };
      });

      clearRateFailures(checkoutRateKey);
      return res.status(201).json(result);
    } catch (err: any) {
      recordRateFailure(checkoutRateKey, 15);
      if (err?.message === 'INSUFFICIENT_BALANCE') {
        return res.status(400).json({ error: 'Insufficient wallet balance' });
      }
      if (err?.message?.startsWith('OUT_OF_STOCK:')) {
        return res.status(409).json({
          error: `Insufficient stock for ${err.message.split(':')[1]}`,
        });
      }
      if (err?.message === 'PRODUCT_UNAVAILABLE') {
        return res.status(404).json({ error: 'One or more selected items are unavailable' });
      }
      console.error('Atomic checkout failed:', err);
      return res.status(500).json({ error: 'Checkout failed. Your wallet was not charged.' });
    }
  });

  // =========================================================================
  // TRUEMONEY GIFT VOUCHER TOP-UP BACKEND (QR CODE METHOD REMOVED)
  // =========================================================================

  app.post('/api/topup/confirm', blockBannedIp, requireCsrf, requireAuth, async (req: AuthedRequest, res) => {
    const userId = req.authUser!.id;
    const ip = getClientIp(req);
    const rateKey = `topup:${userId}:${ip}`;
    const rate = checkRateLimit(rateKey, 6);
    if (!rate.allowed) {
      return res.status(429).json({
        error: 'Too many top-up attempts. Please wait a moment and try again.',
        retryAfterSec: rate.retryAfterSec,
      });
    }

    const parsed = topupConfirmSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid top-up submission',
      });
    }

    const parsedVoucher = parseTrueMoneyVoucherUrl(parsed.data.voucherUrl);
    if (!parsedVoucher.valid) {
      recordRateFailure(rateKey, 6);
      return res.status(400).json({
        error: 'Invalid TrueMoney Gift Voucher URL format (must be https://gift.truemoney.com/campaign/?v=...)',
      });
    }

    const requestedSatang = Math.round(parsed.data.amountThb * 100);
    const txId = generateOrderId('TOP');
    const voucherCode = parsedVoucher.voucherCode;
    const externalRef = `tmv:${sha256Hex(voucherCode)}`;
    const voucherUrlMasked = parsedVoucher.maskedUrl;
    const voucherUrlEncrypted = encryptServerSecret(parsedVoucher.normalizedUrl);

    // Step 1: Insert PENDING transaction BEFORE external gateway call (enforces UNIQUE external_ref)
    try {
      await db.insert(topupTransactions).values({
        id: txId,
        userId,
        channel: 'TRUEMONEY_VOUCHER',
        requestedSatang,
        creditedSatang: 0,
        externalRef,
        voucherUrlMasked,
        voucherUrlEncrypted,
        slipReference: null,
        status: 'PENDING',
      });
    } catch (err: any) {
      if (err?.code === '23505') {
        recordRateFailure(rateKey, 6);
        return res.status(409).json({
          error: 'This Gift Voucher link has already been redeemed or submitted.',
        });
      }
      console.error('Failed to initialize pending topup transaction:', err);
      return res.status(500).json({ error: 'Unable to initialize top-up transaction' });
    }

    // Step 2: Redeem directly into Owner's TrueMoney Wallet via official TrueMoney Gift API
    let outcome: 'COMPLETED' | 'NEEDS_REVIEW' | 'FAILED' = 'NEEDS_REVIEW';
    let verifiedSatang = 0;
    let reviewNote = '';

    const settings = await getStoreSettingsMap();
    const ownerPhone =
      process.env.TRUEMONEY_OWNER_PHONE?.trim() ||
      settings.truemoney_owner_phone?.trim() ||
      '';

    if (ownerPhone) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      try {
        const redeemRes = await fetch(
          `https://gift.truemoney.com/campaign/vouchers/${encodeURIComponent(voucherCode)}/redeem`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            body: JSON.stringify({ mobile: ownerPhone, voucher_hash: voucherCode }),
            signal: controller.signal,
          }
        );
        const redeemJson = (await redeemRes.json().catch(() => ({}))) as any;
        if (redeemRes.ok && redeemJson?.status?.code === 'SUCCESS') {
          const redeemedBaht = Number(redeemJson?.data?.voucher?.amount_baht || 0);
          if (redeemedBaht > 0) {
            outcome = 'COMPLETED';
            verifiedSatang = Math.round(redeemedBaht * 100);
          } else {
            outcome = 'NEEDS_REVIEW';
            reviewNote = 'Voucher returned zero baht; flagged for owner review.';
          }
        } else if (redeemRes.status === 403 || redeemRes.status >= 500) {
          // Cloudflare challenge or gateway error -> queue safely for owner review (Owner can copy link in Admin)
          outcome = 'NEEDS_REVIEW';
          reviewNote = 'TrueMoney gateway requested manual verification; copy Gift Voucher in Admin Panel to claim.';
        } else {
          outcome = 'FAILED';
          reviewNote = redeemJson?.status?.message || 'Voucher rejected by TrueMoney gateway.';
        }
      } catch {
        // Network timeout -> NEVER lose user money, mark NEEDS_REVIEW with Tracking ID
        outcome = 'NEEDS_REVIEW';
        reviewNote = 'Gateway timeout during voucher verification; queued for immediate owner review.';
      } finally {
        clearTimeout(timeoutId);
      }
    } else {
      outcome = 'NEEDS_REVIEW';
      reviewNote = 'Owner TrueMoney receiving number not configured yet; queued for manual review.';
    }

    // Step 3: Commit atomic wallet credit or status update
    try {
      const responsePayload = await db.transaction(async (tx) => {
        const [lockedUser] = await tx
          .select()
          .from(users)
          .where(eq(users.id, userId))
          .for('update');

        if (!lockedUser) {
          throw new Error('USER_NOT_FOUND');
        }

        if (outcome === 'COMPLETED' && verifiedSatang > 0) {
          const balanceBefore = lockedUser.balanceSatang;
          const balanceAfter = balanceBefore + verifiedSatang;

          await tx
            .update(users)
            .set({
              balanceSatang: balanceAfter,
              totalToppedUpSatang: lockedUser.totalToppedUpSatang + verifiedSatang,
              updatedAt: new Date(),
            })
            .where(eq(users.id, userId));

          await tx
            .update(topupTransactions)
            .set({
              status: 'COMPLETED',
              creditedSatang: verifiedSatang,
              reviewNote: reviewNote || null,
              updatedAt: new Date(),
            })
            .where(eq(topupTransactions.id, txId));

          await tx.insert(walletLedger).values({
            userId,
            type: 'TOPUP_VOUCHER',
            deltaSatang: verifiedSatang,
            balanceBeforeSatang: balanceBefore,
            balanceAfterSatang: balanceAfter,
            referenceId: txId,
            note: voucherUrlMasked,
          });

          await tx.insert(activityLogs).values({
            userId,
            eventType: 'VOUCHER_TOPUP',
            status: 'SUCCESS',
            deltaSatang: verifiedSatang,
            balanceBeforeSatang: balanceBefore,
            balanceAfterSatang: balanceAfter,
            maskedIp: maskIp(ip),
            deviceSummary: summarizeDevice(req.headers['user-agent']),
            metadata: `${txId} · ${voucherUrlMasked}`,
          });

          return {
            referenceId: txId,
            channel: 'TRUEMONEY_VOUCHER' as const,
            status: 'COMPLETED' as const,
            creditedSatang: verifiedSatang,
            balanceSatang: balanceAfter,
            note: reviewNote,
          };
        }

        await tx
          .update(topupTransactions)
          .set({
            status: outcome,
            reviewNote: reviewNote || null,
            updatedAt: new Date(),
          })
          .where(eq(topupTransactions.id, txId));

        await tx.insert(activityLogs).values({
          userId,
          eventType: 'VOUCHER_TOPUP',
          status: outcome === 'NEEDS_REVIEW' ? 'PENDING' : 'FAILED',
          deltaSatang: 0,
          balanceBeforeSatang: lockedUser.balanceSatang,
          balanceAfterSatang: lockedUser.balanceSatang,
          maskedIp: maskIp(ip),
          deviceSummary: summarizeDevice(req.headers['user-agent']),
          metadata: `${txId} · ${reviewNote || outcome}`,
        });

        return {
          referenceId: txId,
          channel: 'TRUEMONEY_VOUCHER' as const,
          status: outcome,
          creditedSatang: 0,
          balanceSatang: lockedUser.balanceSatang,
          note: reviewNote,
        };
      });

      if (responsePayload.status === 'FAILED') {
        return res.status(400).json({
          error: responsePayload.note || 'Top-up verification failed',
          referenceId: responsePayload.referenceId,
        });
      }

      clearRateFailures(rateKey);
      return res.json(responsePayload);
    } catch (err) {
      console.error('Top-up finalization failed:', err);
      return res.status(500).json({
        error: `Verification interrupted. Please contact support with Tracking ID ${txId}.`,
        referenceId: txId,
      });
    }
  });

  // =========================================================================
  // ADMIN COMMAND CENTER ROUTES (role === 'ADMIN' strictly enforced)
  // =========================================================================

  app.get('/api/admin/overview', requireAdmin, async (_req, res) => {
    try {
      await ensureProductsSeeded();
      const [
        allProducts,
        allOrdersForStats,
        recentOrders,
        allCompletedTopups,
        reviewTopups,
        recentUsers,
        globalLogs,
        ipBans,
        vaultAccounts,
        [{ pendingOrdersCount }],
        [{ needsReviewCount }],
        [{ totalUsersCount }],
      ] = await Promise.all([
        db.select().from(products).orderBy(products.id),
        db
          .select({
            id: orders.id,
            productId: orders.productId,
            quantity: orders.quantity,
            totalSatang: orders.totalSatang,
            status: orders.status,
            createdAt: orders.createdAt,
          })
          .from(orders),
        db
          .select({
            id: orders.id,
            userId: orders.userId,
            username: users.username,
            productNameSnapshot: orders.productNameSnapshot,
            quantity: orders.quantity,
            totalSatang: orders.totalSatang,
            robloxUsername: orders.robloxUsername,
            deliveredAccountUsername: orders.deliveredAccountUsername,
            deliveredAccountsJson: orders.deliveredAccountsJson,
            status: orders.status,
            adminDeliveryNote: orders.adminDeliveryNote,
            createdAt: orders.createdAt,
          })
          .from(orders)
          .innerJoin(users, eq(orders.userId, users.id))
          .orderBy(desc(orders.createdAt))
          .limit(40),
        db
          .select({
            creditedSatang: topupTransactions.creditedSatang,
            status: topupTransactions.status,
            channel: topupTransactions.channel,
            createdAt: topupTransactions.createdAt,
          })
          .from(topupTransactions)
          .where(eq(topupTransactions.status, 'COMPLETED')),
        db
          .select({
            id: topupTransactions.id,
            userId: topupTransactions.userId,
            username: users.username,
            channel: topupTransactions.channel,
            requestedSatang: topupTransactions.requestedSatang,
            creditedSatang: topupTransactions.creditedSatang,
            voucherUrlMasked: topupTransactions.voucherUrlMasked,
            voucherUrlEncrypted: topupTransactions.voucherUrlEncrypted,
            slipReference: topupTransactions.slipReference,
            status: topupTransactions.status,
            reviewNote: topupTransactions.reviewNote,
            createdAt: topupTransactions.createdAt,
          })
          .from(topupTransactions)
          .innerJoin(users, eq(topupTransactions.userId, users.id))
          .orderBy(desc(topupTransactions.createdAt))
          .limit(40),
        db
          .select({
            id: users.id,
            username: users.username,
            email: users.email,
            role: users.role,
            balanceSatang: users.balanceSatang,
            isBanned: users.isBanned,
            createdAt: users.createdAt,
          })
          .from(users)
          .orderBy(desc(users.createdAt))
          .limit(50),
        db
          .select({
            id: activityLogs.id,
            userId: activityLogs.userId,
            eventType: activityLogs.eventType,
            status: activityLogs.status,
            deltaSatang: activityLogs.deltaSatang,
            maskedIp: activityLogs.maskedIp,
            deviceSummary: activityLogs.deviceSummary,
            metadata: activityLogs.metadata,
            createdAt: activityLogs.createdAt,
          })
          .from(activityLogs)
          .orderBy(desc(activityLogs.createdAt))
          .limit(50),
        db.select().from(bannedIps).orderBy(desc(bannedIps.createdAt)),
        db
          .select()
          .from(productAccounts)
          .orderBy(asc(productAccounts.isSold), desc(productAccounts.id))
          .limit(300),
        db
          .select({ pendingOrdersCount: count() })
          .from(orders)
          .where(eq(orders.status, 'PENDING_DELIVERY')),
        db
          .select({ needsReviewCount: count() })
          .from(topupTransactions)
          .where(eq(topupTransactions.status, 'NEEDS_REVIEW')),
        db.select({ totalUsersCount: count() }).from(users),
      ]);

      // Build Bangkok-time (ICT / UTC+7) Today Revenue Analytics & 7-Day Trend
      const todayBangkok = getBangkokDateAndHour(new Date()).dateStr;
      const past7Dates = getBangkokPastDays(7);

      const hourlyToday = Array.from({ length: 24 }, (_, h) => ({
        hour: h,
        label: `${String(h).padStart(2, '0')}:00`,
        salesSatang: 0,
        ordersCount: 0,
        unitsSold: 0,
        topupSatang: 0,
      }));

      const dailyMap = new Map<
        string,
        { date: string; salesSatang: number; topupSatang: number; ordersCount: number }
      >();
      for (const dateStr of past7Dates) {
        dailyMap.set(dateStr, { date: dateStr, salesSatang: 0, topupSatang: 0, ordersCount: 0 });
      }

      const unitTodayMap = new Map<number, { unitsSoldToday: number; revenueSatangToday: number }>();

      let settledVolumeSatang = 0;
      let todayRevenueSatang = 0;
      let todayOrdersCount = 0;
      let todayUnitsSold = 0;

      for (const ord of allOrdersForStats) {
        if (ord.status === 'REFUNDED') continue;
        settledVolumeSatang += ord.totalSatang;

        const { dateStr, hour } = getBangkokDateAndHour(ord.createdAt);
        const dayEntry = dailyMap.get(dateStr);
        if (dayEntry) {
          dayEntry.salesSatang += ord.totalSatang;
          dayEntry.ordersCount += 1;
        }
        if (dateStr === todayBangkok) {
          todayRevenueSatang += ord.totalSatang;
          todayOrdersCount += 1;
          todayUnitsSold += ord.quantity;
          hourlyToday[hour].salesSatang += ord.totalSatang;
          hourlyToday[hour].ordersCount += 1;
          hourlyToday[hour].unitsSold += ord.quantity;

          const cur = unitTodayMap.get(ord.productId) || {
            unitsSoldToday: 0,
            revenueSatangToday: 0,
          };
          cur.unitsSoldToday += ord.quantity;
          cur.revenueSatangToday += ord.totalSatang;
          unitTodayMap.set(ord.productId, cur);
        }
      }

      let todayTopupSatang = 0;
      let allTimeTopupSatang = 0;
      for (const tx of allCompletedTopups) {
        allTimeTopupSatang += tx.creditedSatang;
        const { dateStr, hour } = getBangkokDateAndHour(tx.createdAt);
        const dayEntry = dailyMap.get(dateStr);
        if (dayEntry) {
          dayEntry.topupSatang += tx.creditedSatang;
        }
        if (dateStr === todayBangkok) {
          todayTopupSatang += tx.creditedSatang;
          hourlyToday[hour].topupSatang += tx.creditedSatang;
        }
      }

      const unitBreakdownToday = allProducts.map((p) => {
        const stats = unitTodayMap.get(p.id) || { unitsSoldToday: 0, revenueSatangToday: 0 };
        return {
          productId: p.id,
          nameEn: p.nameEn,
          nameTh: p.nameTh,
          priceSatang: p.priceSatang,
          availableStock: p.stock,
          unitsSoldToday: stats.unitsSoldToday,
          revenueSatangToday: stats.revenueSatangToday,
        };
      });

      const settings = await getStoreSettingsMap();
      const activePhone =
        process.env.TRUEMONEY_OWNER_PHONE?.trim() ||
        settings.truemoney_owner_phone?.trim() ||
        '';

      return res.json({
        metrics: {
          settledVolumeSatang,
          pendingOrdersCount,
          needsReviewCount,
          totalUsersCount,
        },
        revenueAnalytics: {
          todayDateBangkok: todayBangkok,
          todayRevenueSatang,
          todayOrdersCount,
          todayUnitsSold,
          todayTopupSatang,
          allTimeRevenueSatang: settledVolumeSatang,
          allTimeTopupSatang,
          hourlyToday,
          last7Days: Array.from(dailyMap.values()),
          unitBreakdownToday,
        },
        storeConfig: {
          truemoneyPhoneMasked: maskThaiPhone(activePhone),
          truemoneyAccountName: settings.truemoney_account_name || 'KING CAMERA SHOP',
        },
        products: allProducts,
        productAccounts: vaultAccounts,
        orders: recentOrders.map((o) => ({
          ...o,
          deliveredAccounts: parseDeliveredAccounts({
            deliveredAccountsJson: o.deliveredAccountsJson,
            deliveredAccountUsername: o.deliveredAccountUsername,
            deliveredAccountPassword: null,
          }),
        })),
        topups: reviewTopups.map(({ voucherUrlEncrypted, ...txRow }) => ({
          ...txRow,
          voucherUrlFull: decryptServerSecret(voucherUrlEncrypted),
        })),
        users: recentUsers.map((u) => ({
          ...u,
          isInfiniteBalance: isOwnerWithInfiniteBalance(u),
        })),
        activityLogs: globalLogs,
        bannedIps: ipBans,
      });
    } catch (err) {
      console.error('Admin overview error:', err);
      return res.status(500).json({ error: 'Could not load admin dashboard' });
    }
  });

  // Add one or many real Roblox accounts into a unit's stock vault
  app.post(
    '/api/admin/products/:id/accounts',
    requireCsrf,
    requireAdmin,
    async (req: AuthedRequest, res) => {
      const productId = Number(req.params.id);
      if (!Number.isInteger(productId) || productId <= 0) {
        return res.status(400).json({ error: 'Invalid product ID' });
      }

      const parsed = adminAddAccountsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: parsed.error.issues[0]?.message || 'Invalid account stock entries',
        });
      }

      try {
        const result = await db.transaction(async (tx) => {
          const [prod] = await tx
            .select()
            .from(products)
            .where(eq(products.id, productId))
            .for('update');

          if (!prod) {
            throw new Error('PRODUCT_NOT_FOUND');
          }

          const inserted = await tx
            .insert(productAccounts)
            .values(
              parsed.data.accounts.map((acc) => ({
                productId,
                accountUsername: acc.username,
                accountPassword: acc.password,
                note: acc.note || null,
                isSold: false,
              }))
            )
            .returning();

          const [{ availableCount }] = await tx
            .select({ availableCount: count() })
            .from(productAccounts)
            .where(
              and(eq(productAccounts.productId, productId), eq(productAccounts.isSold, false))
            );

          await tx
            .update(products)
            .set({ stock: availableCount, updatedAt: new Date() })
            .where(eq(products.id, productId));

          return { prodName: prod.nameEn, inserted, availableCount };
        });

        await logActivity({
          userId: req.authUser!.id,
          eventType: 'ADMIN_ACTION',
          status: 'SUCCESS',
          req,
          metadata: `Added ${result.inserted.length} Roblox account(s) to ${result.prodName} (Live stock: ${result.availableCount})`,
        });

        return res.status(201).json({
          addedCount: result.inserted.length,
          stock: result.availableCount,
          accounts: result.inserted,
        });
      } catch (err: any) {
        if (err?.message === 'PRODUCT_NOT_FOUND') {
          return res.status(404).json({ error: 'Product not found' });
        }
        console.error('Add account stock error:', err);
        return res.status(500).json({ error: 'Could not add accounts to stock vault' });
      }
    }
  );

  // Remove an unsold Roblox account from stock vault
  app.delete(
    '/api/admin/accounts/:id',
    requireCsrf,
    requireAdmin,
    async (req: AuthedRequest, res) => {
      const accountId = Number(req.params.id);
      if (!Number.isInteger(accountId) || accountId <= 0) {
        return res.status(400).json({ error: 'Invalid account stock ID' });
      }

      try {
        const result = await db.transaction(async (tx) => {
          const [existing] = await tx
            .select()
            .from(productAccounts)
            .where(eq(productAccounts.id, accountId))
            .for('update');

          if (!existing) {
            throw new Error('NOT_FOUND');
          }
          if (existing.isSold) {
            throw new Error('ALREADY_SOLD');
          }

          await tx.delete(productAccounts).where(eq(productAccounts.id, accountId));

          const [{ availableCount }] = await tx
            .select({ availableCount: count() })
            .from(productAccounts)
            .where(
              and(
                eq(productAccounts.productId, existing.productId),
                eq(productAccounts.isSold, false)
              )
            );

          await tx
            .update(products)
            .set({ stock: availableCount, updatedAt: new Date() })
            .where(eq(products.id, existing.productId));

          return { productId: existing.productId, availableCount };
        });

        return res.json({ ok: true, stock: result.availableCount });
      } catch (err: any) {
        if (err?.message === 'NOT_FOUND') {
          return res.status(404).json({ error: 'Stock account not found' });
        }
        if (err?.message === 'ALREADY_SOLD') {
          return res.status(409).json({ error: 'Sold accounts cannot be deleted from audit history' });
        }
        console.error('Delete account stock error:', err);
        return res.status(500).json({ error: 'Could not delete stock account' });
      }
    }
  );

  app.post('/api/admin/products', requireCsrf, requireAdmin, async (req: AuthedRequest, res) => {
    const parsed = adminProductCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid product' });
    }

    try {
      const slug =
        parsed.data.nameEn
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') +
        '-' +
        crypto.randomBytes(2).toString('hex');

      const [created] = await db
        .insert(products)
        .values({
          slug,
          nameEn: parsed.data.nameEn,
          nameTh: parsed.data.nameTh,
          descriptionEn: parsed.data.descriptionEn,
          descriptionTh: parsed.data.descriptionTh,
          category: parsed.data.category,
          rarity: parsed.data.rarity,
          priceSatang: Math.round(parsed.data.priceThb * 100),
          stock: 0,
          imageUrl: parsed.data.imageUrl,
          isActive: true,
        })
        .returning();

      await logActivity({
        userId: req.authUser!.id,
        eventType: 'ADMIN_ACTION',
        status: 'SUCCESS',
        req,
        metadata: `Created product ${created.nameEn}`,
      });

      return res.status(201).json({ product: created });
    } catch (err) {
      console.error('Admin create product error:', err);
      return res.status(500).json({ error: 'Could not create product' });
    }
  });

  app.patch('/api/admin/products/:id', requireCsrf, requireAdmin, async (req: AuthedRequest, res) => {
    const productId = Number(req.params.id);
    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }
    const parsed = adminProductPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid product update fields' });
    }

    try {
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (parsed.data.priceThb !== undefined) {
        updates.priceSatang = Math.round(parsed.data.priceThb * 100);
      }
      if (parsed.data.isActive !== undefined) {
        updates.isActive = parsed.data.isActive;
      }

      const [updated] = await db
        .update(products)
        .set(updates)
        .where(eq(products.id, productId))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: 'Product not found' });
      }

      await logActivity({
        userId: req.authUser!.id,
        eventType: 'ADMIN_ACTION',
        status: 'SUCCESS',
        req,
        metadata: `Updated product #${productId} (${updated.nameEn})`,
      });

      return res.json({ product: updated });
    } catch (err) {
      console.error('Admin update product error:', err);
      return res.status(500).json({ error: 'Could not update product' });
    }
  });

  app.patch('/api/admin/orders/:id', requireCsrf, requireAdmin, async (req: AuthedRequest, res) => {
    const orderId = String(req.params.id || '');
    const parsed = adminOrderPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid order update payload' });
    }

    try {
      const updatedOrder = await db.transaction(async (tx) => {
        const [lockedOrder] = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, orderId))
          .for('update');

        if (!lockedOrder) {
          throw new Error('ORDER_NOT_FOUND');
        }
        if (lockedOrder.status === 'REFUNDED') {
          throw new Error('ALREADY_REFUNDED');
        }

        if (parsed.data.status === 'REFUNDED') {
          const [lockedUser] = await tx
            .select()
            .from(users)
            .where(eq(users.id, lockedOrder.userId))
            .for('update');

          const [lockedProduct] = await tx
            .select()
            .from(products)
            .where(eq(products.id, lockedOrder.productId))
            .for('update');

          if (!lockedUser) {
            throw new Error('USER_NOT_FOUND');
          }

          const refundDelta = isOwnerWithInfiniteBalance(lockedUser) ? 0 : lockedOrder.totalSatang;
          const balanceBefore = lockedUser.balanceSatang;
          const balanceAfter = balanceBefore + refundDelta;

          await tx
            .update(users)
            .set({
              balanceSatang: balanceAfter,
              totalSpentSatang: Math.max(0, lockedUser.totalSpentSatang - lockedOrder.totalSatang),
              updatedAt: new Date(),
            })
            .where(eq(users.id, lockedOrder.userId));

          // Do not automatically return sold Roblox accounts back into stock because credentials were already revealed.

          await tx.insert(walletLedger).values({
            userId: lockedOrder.userId,
            type: 'REFUND',
            deltaSatang: refundDelta,
            balanceBeforeSatang: balanceBefore,
            balanceAfterSatang: balanceAfter,
            referenceId: lockedOrder.id,
            note: parsed.data.adminDeliveryNote || 'Order refunded by administrator',
          });

          await tx.insert(activityLogs).values({
            userId: lockedOrder.userId,
            eventType: 'REFUND_CREDITED',
            status: 'SUCCESS',
            deltaSatang: refundDelta,
            balanceBeforeSatang: balanceBefore,
            balanceAfterSatang: balanceAfter,
            maskedIp: maskIp(getClientIp(req)),
            deviceSummary: summarizeDevice(req.headers['user-agent']),
            metadata: `Refunded ${lockedOrder.id} · ${parsed.data.adminDeliveryNote || 'Atomic refund'}`,
          });
        }

        const [saved] = await tx
          .update(orders)
          .set({
            status: parsed.data.status,
            adminDeliveryNote: parsed.data.adminDeliveryNote || lockedOrder.adminDeliveryNote,
            updatedAt: new Date(),
          })
          .where(eq(orders.id, orderId))
          .returning();

        return saved;
      });

      return res.json({ order: updatedOrder });
    } catch (err: any) {
      if (err?.message === 'ORDER_NOT_FOUND') {
        return res.status(404).json({ error: 'Order not found' });
      }
      if (err?.message === 'ALREADY_REFUNDED') {
        return res.status(409).json({ error: 'Order has already been refunded' });
      }
      console.error('Admin order update failed:', err);
      return res.status(500).json({ error: 'Could not update order' });
    }
  });

  app.patch('/api/admin/topups/:id', requireCsrf, requireAdmin, async (req: AuthedRequest, res) => {
    const txId = String(req.params.id || '');
    const parsed = adminTopupPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid top-up reconciliation payload' });
    }

    try {
      const result = await db.transaction(async (tx) => {
        const [lockedTopup] = await tx
          .select()
          .from(topupTransactions)
          .where(eq(topupTransactions.id, txId))
          .for('update');

        if (!lockedTopup) {
          throw new Error('TOPUP_NOT_FOUND');
        }
        if (lockedTopup.status !== 'PENDING' && lockedTopup.status !== 'NEEDS_REVIEW') {
          throw new Error('ALREADY_PROCESSED');
        }

        if (parsed.data.status === 'COMPLETED') {
          const creditSatang =
            parsed.data.verifiedThb !== undefined
              ? Math.round(parsed.data.verifiedThb * 100)
              : lockedTopup.requestedSatang;

          const [lockedUser] = await tx
            .select()
            .from(users)
            .where(eq(users.id, lockedTopup.userId))
            .for('update');

          if (!lockedUser) {
            throw new Error('USER_NOT_FOUND');
          }

          const balanceBefore = lockedUser.balanceSatang;
          const balanceAfter = balanceBefore + creditSatang;

          await tx
            .update(users)
            .set({
              balanceSatang: balanceAfter,
              totalToppedUpSatang: lockedUser.totalToppedUpSatang + creditSatang,
              updatedAt: new Date(),
            })
            .where(eq(users.id, lockedTopup.userId));

          const [saved] = await tx
            .update(topupTransactions)
            .set({
              status: 'COMPLETED',
              creditedSatang: creditSatang,
              reviewNote: parsed.data.reviewNote || 'Approved & credited by admin',
              updatedAt: new Date(),
            })
            .where(eq(topupTransactions.id, txId))
            .returning();

          await tx.insert(walletLedger).values({
            userId: lockedTopup.userId,
            type: lockedTopup.channel === 'TRUEMONEY_VOUCHER' ? 'TOPUP_VOUCHER' : 'TOPUP_QR',
            deltaSatang: creditSatang,
            balanceBeforeSatang: balanceBefore,
            balanceAfterSatang: balanceAfter,
            referenceId: txId,
            note: parsed.data.reviewNote || 'Manual reconciliation approved',
          });

          await tx.insert(activityLogs).values({
            userId: lockedTopup.userId,
            eventType: lockedTopup.channel === 'TRUEMONEY_VOUCHER' ? 'VOUCHER_TOPUP' : 'QR_TOPUP',
            status: 'SUCCESS',
            deltaSatang: creditSatang,
            balanceBeforeSatang: balanceBefore,
            balanceAfterSatang: balanceAfter,
            maskedIp: maskIp(getClientIp(req)),
            deviceSummary: summarizeDevice(req.headers['user-agent']),
            metadata: `${txId} · Approved by admin`,
          });

          return saved;
        }

        const [saved] = await tx
          .update(topupTransactions)
          .set({
            status: 'FAILED',
            reviewNote: parsed.data.reviewNote || 'Rejected during manual review',
            updatedAt: new Date(),
          })
          .where(eq(topupTransactions.id, txId))
          .returning();

        return saved;
      });

      return res.json({ topup: result });
    } catch (err: any) {
      if (err?.message === 'TOPUP_NOT_FOUND') {
        return res.status(404).json({ error: 'Top-up record not found' });
      }
      if (err?.message === 'ALREADY_PROCESSED') {
        return res.status(409).json({ error: 'Top-up has already been finalized' });
      }
      console.error('Admin top-up reconciliation failed:', err);
      return res.status(500).json({ error: 'Could not reconcile top-up' });
    }
  });

  app.patch('/api/admin/users/:id/ban', requireCsrf, requireAdmin, async (req: AuthedRequest, res) => {
    const targetUserId = Number(req.params.id);
    const isBanned = Boolean(req.body?.isBanned);
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    if (targetUserId === req.authUser!.id) {
      return res.status(400).json({ error: 'Cannot ban your own admin account' });
    }

    try {
      const [targetUser] = await db
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(eq(users.id, targetUserId))
        .limit(1);

      if (!targetUser) {
        return res.status(404).json({ error: 'User not found' });
      }
      if (targetUser.role === 'OWNER') {
        return res.status(403).json({ error: 'Owner account cannot be banned' });
      }

      const [updated] = await db
        .update(users)
        .set({ isBanned, updatedAt: new Date() })
        .where(eq(users.id, targetUserId))
        .returning({ id: users.id, username: users.username, isBanned: users.isBanned });

      if (!updated) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (isBanned) {
        await db
          .update(sessions)
          .set({ revokedAt: new Date() })
          .where(and(eq(sessions.userId, targetUserId), isNull(sessions.revokedAt)));
      }

      await logActivity({
        userId: req.authUser!.id,
        eventType: 'ADMIN_ACTION',
        status: 'SUCCESS',
        req,
        metadata: `${isBanned ? 'Banned' : 'Unbanned'} user ${updated.username}`,
      });

      return res.json({ user: updated });
    } catch (err) {
      console.error('Admin ban user error:', err);
      return res.status(500).json({ error: 'Could not update user status' });
    }
  });

  app.post('/api/admin/banned-ips', requireCsrf, requireAdmin, async (req: AuthedRequest, res) => {
    const masked = typeof req.body?.maskedIp === 'string' ? req.body.maskedIp.trim() : '';
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : 'Abuse policy';
    if (masked.length < 5 || masked.length > 64) {
      return res.status(400).json({ error: 'Provide a valid masked IP address' });
    }

    try {
      const [created] = await db
        .insert(bannedIps)
        .values({ maskedIp: masked, reason: reason || 'Abuse policy' })
        .onConflictDoNothing({ target: bannedIps.maskedIp })
        .returning();

      await logActivity({
        userId: req.authUser!.id,
        eventType: 'ADMIN_ACTION',
        status: 'SUCCESS',
        req,
        metadata: `Blocked IP ${masked} (${reason})`,
      });

      return res.status(201).json({ bannedIp: created || { maskedIp: masked, reason } });
    } catch (err) {
      console.error('Admin block IP error:', err);
      return res.status(500).json({ error: 'Could not block IP' });
    }
  });

  app.delete('/api/admin/banned-ips/:id', requireCsrf, requireAdmin, async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid IP ban ID' });
    }

    try {
      await db.delete(bannedIps).where(eq(bannedIps.id, id));
      return res.json({ ok: true });
    } catch (err) {
      console.error('Admin unblock IP error:', err);
      return res.status(500).json({ error: 'Could not remove IP block' });
    }
  });

  // =========================================================================
  // VITE DEV MIDDLEWARE / PRODUCTION STATIC ASSETS
  // =========================================================================

  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`KING CAMERA SHOP server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
