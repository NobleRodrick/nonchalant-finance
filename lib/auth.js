import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { db } from "@/lib/prisma";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "springer-finance-super-secure-jwt-secret-key-2026"
);

const ACCESS_TOKEN_COOKIE = "sf_access_token";
const REFRESH_TOKEN_COOKIE = "sf_refresh_token";

export async function hashPassword(password) {
  return await bcrypt.hash(password, 10);
}

export async function verifyPassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

export async function signAccessToken(payload) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(JWT_SECRET);
}

export async function signRefreshToken(payload) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(JWT_SECRET);
}

export async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload;
  } catch {
    return null;
  }
}

export async function setAuthCookies(accessToken, refreshToken) {
  const cookieStore = await cookies();

  cookieStore.set(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 15 * 60, // 15 minutes
  });

  if (refreshToken) {
    cookieStore.set(REFRESH_TOKEN_COOKIE, refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });
  }
}

export async function clearAuthCookies() {
  const cookieStore = await cookies();
  cookieStore.delete(ACCESS_TOKEN_COOKIE);
  cookieStore.delete(REFRESH_TOKEN_COOKIE);
}

/**
 * Get current authenticated user from session cookies.
 * Automatically refreshes access token if expired using the refresh token.
 */
export async function getCurrentUser() {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
    const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;

    let userId = null;

    if (accessToken) {
      const payload = await verifyToken(accessToken);
      if (payload?.userId) {
        userId = payload.userId;
      }
    }

    // If access token is expired/invalid, try using refresh token
    if (!userId && refreshToken) {
      const refreshPayload = await verifyToken(refreshToken);
      if (refreshPayload?.userId) {
        // Verify refresh token in DB
        const storedToken = await db.refreshToken.findUnique({
          where: { token: refreshToken },
        });

        if (storedToken && storedToken.expiresAt > new Date()) {
          userId = refreshPayload.userId;

          // Issue new access token
          const user = await db.user.findUnique({
            where: { id: userId },
            include: { organization: true, department: true },
          });

          if (user && user.isActive) {
            const newAccessToken = await signAccessToken({
              userId: user.id,
              email: user.email,
              role: user.role,
              organizationId: user.organizationId,
              departmentId: user.departmentId,
            });

            await setAuthCookies(newAccessToken, null);
            return user;
          }
        }
      }
    }

    if (!userId) return null;

    const user = await db.user.findUnique({
      where: { id: userId },
      include: {
        organization: true,
        department: true,
      },
    });

    if (!user || !user.isActive) {
      await clearAuthCookies();
      return null;
    }

    return user;
  } catch (error) {
    console.error("Error in getCurrentUser:", error);
    return null;
  }
}
