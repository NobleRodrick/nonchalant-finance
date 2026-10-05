"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/prisma";
import {
  ACTIVE_DEPT_COOKIE,
  REFRESH_TOKEN_COOKIE,
  burnPasswordCheck,
  clearAuthCookies,
  getCurrentUser,
  hashPassword,
  hashToken,
  needsRehash,
  revokeSessions,
  startSession,
  verifyPassword,
} from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { runAction } from "@/lib/action";
import { forbidden, invalid, unauthorized } from "@/lib/errors";
import { resetRateLimit } from "@/lib/rate-limit";
import { guard } from "@/lib/security/protect";
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

/** Wrong passwords in a row before the account is locked, and for how long. */
const LOCK_AFTER = 10;
const LOCK_MINUTES = 15;

const minutesLeft = (until) => Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60000));

/** Audit row for a sign-in event (only once the person belongs to a business). */
async function authAudit(client, user, action, after) {
  if (!user?.organizationId) return;
  try {
    await recordAudit(client, { user, organizationId: user.organizationId, action, entityType: "User", entityId: user.id, after });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "auth_audit_failed", action, message: error.message }));
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
    const check = await guard("login", { ip, account: email });
    if (!check.allowed) throw forbidden(check.message);

    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      // Same work and the same answer as a wrong password: the reply does not tell whether the e-mail has an account.
      await burnPasswordCheck(password);
      throw unauthorized("Invalid email or password.");
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await burnPasswordCheck(password);
      throw forbidden(`Too many attempts. Try again in ${minutesLeft(user.lockedUntil)} minute(s).`);
    }
    if (!(await verifyPassword(password, user.passwordHash))) {
      // Counted in the database, so the lock holds on every server instance.
      const failed = (user.lockedUntil ? 0 : user.failedLoginCount) + 1;
      const lock = failed >= LOCK_AFTER;
      await db.user.update({
        where: { id: user.id },
        data: lock ? { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60000) } : { failedLoginCount: failed, lockedUntil: null },
      });
      if (lock) await authAudit(db, user, "ACCOUNT_LOCKED", { minutes: LOCK_MINUTES, ip });
      throw unauthorized("Invalid email or password.");
    }
    if (!user.isActive) throw forbidden("This account has been deactivated. Please contact your manager.");

    if (check.key) resetRateLimit(check.key);
    const signedIn = await db.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        // Hashes made with an older, cheaper setting are upgraded now that the password is known.
        ...(needsRehash(user.passwordHash) ? { passwordHash: await hashPassword(password) } : {}),
      },
    });
    await startSession(signedIn);

    const redirectTo = safeRedirect(data?.redirect);
    return {
      user: { id: user.id, name: user.name, role: user.role },
      needsOnboarding: user.role === "ADMIN" && !user.organizationId,
      // A temporary password (set by the Boss) is replaced before anything else.
      mustChangePassword: user.mustChangePassword,
      redirectTo: user.mustChangePassword ? `/change-password?redirect=${encodeURIComponent(redirectTo)}` : redirectTo,
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
    const weak = validatePasswordStrength(password, { email, name });
    if (weak) throw invalid(weak);

    const ip = await clientIp();
    const check = await guard("register", { ip, email });
    if (!check.allowed) throw forbidden(check.message);

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) throw invalid("An account with this email already exists.");

    const user = await db.user.create({
      data: { name, email, phone, passwordHash: await hashPassword(password), role: "ADMIN", isActive: true, passwordChangedAt: new Date() },
    });
    await startSession(user);
    return { user: { id: user.id, name: user.name, role: user.role } };
  });
}

export async function logoutUser() {
  try {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;
    if (refreshToken) await db.refreshToken.deleteMany({ where: { token: hashToken(refreshToken) } });
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

/**
 * Changes the password (the current one is required). Every other session is signed out; this
 * one gets new tokens. Also ends a forced change (temporary password set by the Boss).
 */
export async function updatePassword(data) {
  return runAction("updatePassword", async () => {
    const user = await getCurrentUser();
    if (!user) throw unauthorized();
    const { currentPassword, newPassword } = data || {};
    if (!currentPassword || !newPassword) throw invalid("Current and new password are required.");
    const weak = validatePasswordStrength(newPassword, { email: user.email, name: user.name });
    if (weak) throw invalid(weak);
    if (newPassword === currentPassword) throw invalid("Choose a new password, different from the current one.");
    const check = await guard("password", { ip: await clientIp(), account: user.id });
    if (!check.allowed) throw forbidden(check.message);
    if (!(await verifyPassword(currentPassword, user.passwordHash))) throw invalid("Incorrect current password.");

    const updated = await db.$transaction(async (tx) => {
      await revokeSessions(tx, user.id);
      const u = await tx.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null },
      });
      await authAudit(tx, user, "PASSWORD_CHANGED", { forced: user.mustChangePassword });
      return u;
    });
    await startSession(updated);
    return { message: "Password updated. Other sessions were signed out." };
  });
}

/** Signs the person out on every device (this one gets new tokens). */
export async function signOutEverywhere() {
  return runAction("signOutEverywhere", async () => {
    const user = await getCurrentUser();
    if (!user) throw unauthorized();
    const updated = await db.$transaction(async (tx) => {
      const u = await revokeSessions(tx, user.id);
      await authAudit(tx, user, "SIGNED_OUT_EVERYWHERE", {});
      return u;
    });
    await startSession(updated);
    return { message: "Every other device was signed out." };
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
