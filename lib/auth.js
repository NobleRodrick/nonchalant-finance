import { cache } from "react";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/prisma";
import { getJwtSecretKey } from "@/lib/jwt-secret";

export const ACCESS_TOKEN_COOKIE = "sf_access_token";
export const REFRESH_TOKEN_COOKIE = "sf_refresh_token";
export const ACTIVE_DEPT_COOKIE = "sf_active_dept";

const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
/** Sessions kept per person (the oldest beyond this are signed out). */
const MAX_SESSIONS = 20;

/** bcrypt work factor. Older hashes (cost 10) are upgraded at the next successful sign-in. */
export const BCRYPT_COST = 12;

export async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(password, hash) {
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}

/** Whether a stored hash was made with a lower cost than today's. */
export function needsRehash(hash) {
  try {
    return bcrypt.getRounds(hash) < BCRYPT_COST;
  } catch {
    return false;
  }
}

let dummyHash = null;
/**
 * Spends the same time as checking a real password. Used when the e-mail is unknown, so the
 * answer time does not tell whether an account exists.
 */
export async function burnPasswordCheck(password) {
  if (!dummyHash) dummyHash = await bcrypt.hash("not-a-real-password-0", BCRYPT_COST);
  await bcrypt.compare(String(password || ""), dummyHash);
  return false;
}

/** SHA-256 of a refresh token: what the database keeps (a leaked table holds no usable token). */
export function hashToken(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

/**
 * Access token (15 minutes). `sv` is the person's session version: when it changes (password
 * changed or reset, account deactivated, "sign out everywhere"), every token issued before stops
 * working at once.
 */
export async function signAccessToken({ userId, role, organizationId, sv = 0 }) {
  return new SignJWT({ userId, role, organizationId, sv, typ: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(getJwtSecretKey());
}

export async function signRefreshToken({ userId, sv = 0 }) {
  return new SignJWT({ userId, sv, typ: "refresh", jti: crypto.randomUUID() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${REFRESH_TTL_SECONDS}s`)
    .sign(getJwtSecretKey());
}

/** Payload of a valid token of the given type ("access" | "refresh"), or null. */
export async function verifyToken(token, typ = null) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getJwtSecretKey(), { algorithms: ["HS256"] });
    if (typ && payload.typ !== typ) return null;
    return payload;
  } catch {
    return null;
  }
}

function cookieOptions(maxAge) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  };
}

export async function setAuthCookies(accessToken, refreshToken) {
  const cookieStore = await cookies();
  cookieStore.set(ACCESS_TOKEN_COOKIE, accessToken, cookieOptions(ACCESS_TTL_SECONDS));
  if (refreshToken) {
    cookieStore.set(REFRESH_TOKEN_COOKIE, refreshToken, cookieOptions(REFRESH_TTL_SECONDS));
  }
}

export async function clearAuthCookies() {
  const cookieStore = await cookies();
  cookieStore.delete(ACCESS_TOKEN_COOKIE);
  cookieStore.delete(REFRESH_TOKEN_COOKIE);
  cookieStore.delete(ACTIVE_DEPT_COOKIE);
}

/**
 * Issues a fresh access + refresh token pair for `user` (with its current sessionVersion) and
 * stores the refresh token's hash. Expired sessions and those beyond MAX_SESSIONS are removed.
 */
export async function startSession(user) {
  const sv = user.sessionVersion || 0;
  const accessToken = await signAccessToken({ userId: user.id, role: user.role, organizationId: user.organizationId, sv });
  const refreshToken = await signRefreshToken({ userId: user.id, sv });

  await db.$transaction(async (tx) => {
    await tx.refreshToken.deleteMany({ where: { userId: user.id, expiresAt: { lt: new Date() } } });
    await tx.refreshToken.create({
      data: { token: hashToken(refreshToken), userId: user.id, expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000) },
    });
    const extra = await tx.refreshToken.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, skip: MAX_SESSIONS, select: { id: true } });
    if (extra.length) await tx.refreshToken.deleteMany({ where: { id: { in: extra.map((r) => r.id) } } });
  });

  await setAuthCookies(accessToken, refreshToken);
}

/**
 * Signs a person out everywhere: every token issued before stops working (session version) and
 * every stored session is removed. Run inside the caller's transaction (`tx`).
 */
export async function revokeSessions(tx, userId) {
  await tx.refreshToken.deleteMany({ where: { userId } });
  return tx.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
}

const USER_INCLUDE = {
  organization: true,
  department: true,
  memberships: {
    where: { isActive: true, department: { isActive: true } },
    include: { department: true },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  },
};

/**
 * Resolves the active department for a user:
 * - the sf_active_dept cookie, if the user may access it (admin: any active department of
 *   their organization; others: an active membership);
 * - otherwise the primary membership / primary department / first membership.
 */
async function resolveActiveDepartment(user, cookieValue) {
  const memberIds = user.memberships.map((m) => m.departmentId);

  if (cookieValue) {
    if (user.role === "ADMIN" && user.organizationId) {
      const dept = await db.department.findFirst({
        where: { id: cookieValue, organizationId: user.organizationId },
        select: { id: true },
      });
      if (dept) return dept.id;
    } else if (memberIds.includes(cookieValue)) {
      return cookieValue;
    }
  }

  const primary = user.memberships.find((m) => m.isPrimary)?.departmentId;
  if (primary) return primary;
  if (user.departmentId && (user.role === "ADMIN" || memberIds.includes(user.departmentId))) {
    return user.departmentId;
  }
  if (memberIds[0]) return memberIds[0];

  if (user.role === "ADMIN" && user.organizationId) {
    const first = await db.department.findFirst({
      where: { organizationId: user.organizationId, isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    return first?.id || null;
  }
  return null;
}

/**
 * Active departments of an organization that have no active department head: the Boss runs them
 * himself until he assigns a head (then he goes back to overseeing them).
 */
export async function selfRunDepartmentIds(organizationId, client = db) {
  const rows = await client.department.findMany({
    where: { organizationId, isActive: true, memberships: { none: { isActive: true, user: { isActive: true, role: "HEAD" } } } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * Current authenticated user from the session cookies (read-only; safe during rendering).
 * Returns null when there is no valid session or the account is deactivated.
 * Memoized per request (React cache): the layout, the page guard and the page share one
 * lookup instead of repeating the token check and the user query.
 */
export const getCurrentUser = cache(async function getCurrentUser() {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
    const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;

    let userId = null;
    let sv = null;
    if (accessToken) {
      const payload = await verifyToken(accessToken, "access");
      if (payload?.userId) {
        userId = payload.userId;
        sv = payload.sv ?? 0;
      }
    }

    if (!userId && refreshToken) {
      const refreshPayload = await verifyToken(refreshToken, "refresh");
      if (refreshPayload?.userId) {
        const stored = await db.refreshToken.findUnique({ where: { token: hashToken(refreshToken) } });
        if (stored && stored.userId === refreshPayload.userId && stored.expiresAt > new Date()) {
          userId = refreshPayload.userId;
          sv = refreshPayload.sv ?? 0;
        }
      }
    }

    if (!userId) return null;

    const user = await db.user.findUnique({ where: { id: userId }, include: USER_INCLUDE });
    if (!user || !user.isActive) return null;
    // Signed out everywhere since this token was issued (password changed or reset, …).
    if (sv !== (user.sessionVersion || 0)) return null;

    // Departments the Boss runs himself: no active department head yet (see lib/access).
    user.selfRunDepartmentIds = user.role === "ADMIN" && user.organizationId ? await selfRunDepartmentIds(user.organizationId) : [];
    user.activeDepartmentId = await resolveActiveDepartment(
      user,
      cookieStore.get(ACTIVE_DEPT_COOKIE)?.value
    );
    return user;
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "get_current_user_failed", message: error.message }));
    return null;
  }
});
