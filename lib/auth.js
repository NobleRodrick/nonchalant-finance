import { cache } from "react";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { db } from "@/lib/prisma";
import { getJwtSecretKey } from "@/lib/jwt-secret";

export const ACCESS_TOKEN_COOKIE = "sf_access_token";
export const REFRESH_TOKEN_COOKIE = "sf_refresh_token";
export const ACTIVE_DEPT_COOKIE = "sf_active_dept";

const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password, hash) {
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}

export async function signAccessToken(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(getJwtSecretKey());
}

export async function signRefreshToken(payload) {
  return new SignJWT({ ...payload, jti: crypto.randomUUID() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${REFRESH_TTL_SECONDS}s`)
    .sign(getJwtSecretKey());
}

export async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, getJwtSecretKey());
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

/** Issues a fresh access + refresh token pair and stores the refresh token. */
export async function startSession(user) {
  const accessToken = await signAccessToken({
    userId: user.id,
    role: user.role,
    organizationId: user.organizationId,
  });
  const refreshToken = await signRefreshToken({ userId: user.id });

  await db.$transaction([
    db.refreshToken.deleteMany({ where: { userId: user.id, expiresAt: { lt: new Date() } } }),
    db.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
      },
    }),
  ]);

  await setAuthCookies(accessToken, refreshToken);
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
    if (accessToken) {
      const payload = await verifyToken(accessToken);
      if (payload?.userId) userId = payload.userId;
    }

    if (!userId && refreshToken) {
      const refreshPayload = await verifyToken(refreshToken);
      if (refreshPayload?.userId) {
        const stored = await db.refreshToken.findUnique({ where: { token: refreshToken } });
        if (stored && stored.userId === refreshPayload.userId && stored.expiresAt > new Date()) {
          userId = refreshPayload.userId;
        }
      }
    }

    if (!userId) return null;

    const user = await db.user.findUnique({ where: { id: userId }, include: USER_INCLUDE });
    if (!user || !user.isActive) return null;

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
