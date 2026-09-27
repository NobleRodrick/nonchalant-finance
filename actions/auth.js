"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/prisma";
import {
  ACTIVE_DEPT_COOKIE,
  REFRESH_TOKEN_COOKIE,
  clearAuthCookies,
  getCurrentUser,
  hashPassword,
  startSession,
  verifyPassword,
} from "@/lib/auth";
import { runAction } from "@/lib/action";
import { forbidden, invalid, unauthorized } from "@/lib/errors";
import { rateLimit, resetRateLimit } from "@/lib/rate-limit";
import { accessibleDepartmentIds } from "@/lib/access";
import { validatePasswordStrength } from "@/lib/password-utils";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function clientIp() {
  try {
    const h = await headers();
    return (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip") || "local";
  } catch {
    return "local";
  }
}

/** Only same-site relative paths may be used as post-login redirects. */
function safeRedirect(path) {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    return "/home";
  }
  return path;
}

export async function loginUser(data) {
  return runAction("loginUser", async () => {
    const email = String(data?.email || "").toLowerCase().trim();
    const password = String(data?.password || "");
    if (!email || !password) throw invalid("Email and password are required.");

    const ip = await clientIp();
    const limitKey = `login:${ip}:${email}`;
    const limit = rateLimit(limitKey, { limit: 8, windowMs: 15 * 60 * 1000 });
    if (!limit.allowed) {
      throw forbidden(`Too many sign-in attempts. Try again in ${Math.ceil(limit.retryAfterMs / 60000)} minute(s).`);
    }

    const user = await db.user.findUnique({ where: { email } });
    const ok = user ? await verifyPassword(password, user.passwordHash) : false;
    if (!user || !ok) throw unauthorized("Invalid email or password.");
    if (!user.isActive) throw forbidden("This account has been deactivated. Please contact your manager.");

    resetRateLimit(limitKey);
    await startSession(user);

    return {
      user: { id: user.id, name: user.name, role: user.role },
      needsOnboarding: user.role === "ADMIN" && !user.organizationId,
      redirectTo: safeRedirect(data?.redirect),
    };
  });
}

export async function registerBoss(data) {
  return runAction("registerBoss", async () => {
    const name = String(data?.name || "").trim();
    const email = String(data?.email || "").toLowerCase().trim();
    const password = String(data?.password || "");
    const phone = String(data?.phone || "").trim() || null;

    if (!name || !email || !password) throw invalid("Name, email, and password are required.");
    if (!EMAIL_RE.test(email)) throw invalid("Enter a valid email address.");
    const weak = validatePasswordStrength(password);
    if (weak) throw invalid(weak);

    const ip = await clientIp();
    const limit = rateLimit(`register:${ip}`, { limit: 5, windowMs: 60 * 60 * 1000 });
    if (!limit.allowed) throw forbidden("Too many registrations from this network. Try again later.");

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) throw invalid("An account with this email already exists.");

    const user = await db.user.create({
      data: { name, email, phone, passwordHash: await hashPassword(password), role: "ADMIN", isActive: true },
    });
    await startSession(user);
    return { user: { id: user.id, name: user.name, role: user.role } };
  });
}

export async function logoutUser() {
  try {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;
    if (refreshToken) await db.refreshToken.deleteMany({ where: { token: refreshToken } });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "logout_failed", message: error.message }));
  }
  await clearAuthCookies();
  return { success: true };
}

export async function updateProfile(data) {
  return runAction("updateProfile", async () => {
    const user = await getCurrentUser();
    if (!user) throw unauthorized();
    const name = data?.name !== undefined ? String(data.name).trim() : user.name;
    if (!name) throw invalid("Name cannot be empty.");
    const updated = await db.user.update({
      where: { id: user.id },
      data: { name, phone: data?.phone !== undefined ? String(data.phone).trim() || null : user.phone },
      select: { id: true, name: true, email: true, phone: true },
    });
    revalidatePath("/", "layout");
    return updated;
  });
}

export async function updatePassword(data) {
  return runAction("updatePassword", async () => {
    const user = await getCurrentUser();
    if (!user) throw unauthorized();
    const { currentPassword, newPassword } = data || {};
    if (!currentPassword || !newPassword) throw invalid("Current and new password are required.");
    const weak = validatePasswordStrength(newPassword);
    if (weak) throw invalid(weak);
    if (!(await verifyPassword(currentPassword, user.passwordHash))) throw invalid("Incorrect current password.");

    const cookieStore = await cookies();
    const currentRefresh = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;
    await db.$transaction([
      db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } }),
      // Sign out every other session.
      db.refreshToken.deleteMany({ where: { userId: user.id, ...(currentRefresh ? { token: { not: currentRefresh } } : {}) } }),
    ]);
    return { message: "Password updated. Other sessions were signed out." };
  });
}

export async function switchActiveDepartment(departmentId) {
  return runAction("switchActiveDepartment", async () => {
    const user = await getCurrentUser();
    if (!user) throw unauthorized();
    const cookieStore = await cookies();
    if (!departmentId) {
      cookieStore.delete(ACTIVE_DEPT_COOKIE);
    } else {
      const allowed = await accessibleDepartmentIds(user);
      if (!allowed.includes(departmentId)) throw forbidden("You are not assigned to this department.");
      cookieStore.set(ACTIVE_DEPT_COOKIE, departmentId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 30 * 24 * 60 * 60,
      });
    }
    revalidatePath("/", "layout");
    return { departmentId: departmentId || null };
  });
}
