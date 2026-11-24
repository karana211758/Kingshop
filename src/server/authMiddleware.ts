import type { Request, Response, NextFunction } from 'express';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { bannedIps, sessions, users } from '../db/schema.ts';
import {
  ACCESS_COOKIE_NAME,
  getClientIp,
  maskIp,
  verifyAccessToken,
  verifyCsrfRequest,
} from './security.ts';

export interface AuthenticatedUser {
  id: number;
  uid: string | null;
  username: string;
  email: string;
  role: string;
  balanceSatang: number;
  totalToppedUpSatang: number;
  totalSpentSatang: number;
  isBanned: boolean;
  createdAt: Date;
}

export interface AuthedRequest extends Request {
  authUser?: AuthenticatedUser;
  sessionId?: string;
}

export function requireCsrf(req: Request, res: Response, next: NextFunction) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    if (!verifyCsrfRequest(req)) {
      return res.status(403).json({ error: 'Invalid request origin or missing CSRF header' });
    }
  }
  next();
}

export async function blockBannedIp(req: Request, res: Response, next: NextFunction) {
  try {
    const masked = maskIp(getClientIp(req));
    const [banned] = await db
      .select()
      .from(bannedIps)
      .where(eq(bannedIps.maskedIp, masked))
      .limit(1);
    if (banned) {
      return res.status(403).json({ error: 'Access denied from this network address.' });
    }
    next();
  } catch (err) {
    console.error('Failed to check banned IP table:', err);
    next();
  }
}

export async function attachAuthIfPresent(req: AuthedRequest, _res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    const bearerToken =
      authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    const cookieToken = req.cookies?.[ACCESS_COOKIE_NAME] as string | undefined;
    const rawToken = bearerToken || cookieToken;

    if (!rawToken) {
      return next();
    }

    const payload = verifyAccessToken(rawToken);
    if (!payload) {
      return next();
    }

    const [sessionRow] = await db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.id, payload.sid),
          eq(sessions.userId, payload.sub),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date())
        )
      )
      .limit(1);

    if (!sessionRow) {
      return next();
    }

    const [userRow] = await db
      .select({
        id: users.id,
        uid: users.uid,
        username: users.username,
        email: users.email,
        role: users.role,
        balanceSatang: users.balanceSatang,
        totalToppedUpSatang: users.totalToppedUpSatang,
        totalSpentSatang: users.totalSpentSatang,
        isBanned: users.isBanned,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);

    if (!userRow || userRow.isBanned) {
      return next();
    }

    req.authUser = userRow;
    req.sessionId = sessionRow.id;
    next();
  } catch (err) {
    console.error('Auth verification error:', err);
    next();
  }
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.authUser || !req.sessionId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.authUser || !req.sessionId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.authUser.role !== 'ADMIN' && req.authUser.role !== 'OWNER') {
    return res.status(403).json({ error: 'Administrator privileges required' });
  }
  next();
}
