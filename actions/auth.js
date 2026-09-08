"use server";

import { db } from "@/lib/prisma";
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  signRefreshToken,
  setAuthCookies,
  clearAuthCookies,
  getCurrentUser,
} from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

export async function loginUser(data) {
  try {
    const { email, password } = data;

    if (!email || !password) {
      return { success: false, error: "Email and password are required" };
    }

    const user = await db.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: {
        organization: true,
        department: true,
      },
    });

    if (!user) {
      return { success: false, error: "Invalid email or password" };
    }

    if (!user.isActive) {
      return { success: false, error: "This account has been deactivated. Please contact your manager." };
    }

    const isMatch = await verifyPassword(password, user.passwordHash);
    if (!isMatch) {
      return { success: false, error: "Invalid email or password" };
    }

    // Generate Access & Refresh tokens
    const accessToken = await signAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      departmentId: user.departmentId,
    });

    const refreshToken = await signRefreshToken({
      userId: user.id,
    });

    // Save refresh token in DB
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await db.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt,
      },
    });

    await setAuthCookies(accessToken, refreshToken);

    return {
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
        organizationName: user.organization?.name,
        departmentId: user.departmentId,
        departmentName: user.department?.name,
      },
      needsOnboarding: user.role === "ADMIN" && !user.organizationId,
    };
  } catch (error) {
    console.error("Login error:", error);
    return { success: false, error: error.message || "Failed to log in" };
  }
}

export async function registerBoss(data) {
  try {
    const { name, email, password, phone } = data;

    if (!name || !email || !password) {
      return { success: false, error: "Name, email, and password are required" };
    }

    const existingUser = await db.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (existingUser) {
      return { success: false, error: "An account with this email already exists" };
    }

    const passwordHash = await hashPassword(password);

    const newUser = await db.user.create({
      data: {
        name,
        email: email.toLowerCase().trim(),
        phone: phone || null,
        passwordHash,
        role: "ADMIN",
        isActive: true,
      },
    });

    // Generate tokens
    const accessToken = await signAccessToken({
      userId: newUser.id,
      email: newUser.email,
      role: newUser.role,
      organizationId: null,
      departmentId: null,
    });

    const refreshToken = await signRefreshToken({
      userId: newUser.id,
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await db.refreshToken.create({
      data: {
        token: refreshToken,
        userId: newUser.id,
        expiresAt,
      },
    });

    await setAuthCookies(accessToken, refreshToken);

    return {
      success: true,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
      },
    };
  } catch (error) {
    console.error("Boss registration error:", error);
    return { success: false, error: error.message || "Failed to register" };
  }
}

export async function logoutUser() {
  try {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get("sf_refresh_token")?.value;

    if (refreshToken) {
      await db.refreshToken.deleteMany({
        where: { token: refreshToken },
      });
    }

    await clearAuthCookies();
    return { success: true };
  } catch (error) {
    console.error("Logout error:", error);
    await clearAuthCookies();
    return { success: true };
  }
}

export async function updateProfile(data) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };

    const updatedUser = await db.user.update({
      where: { id: user.id },
      data: {
        name: data.name || user.name,
        phone: data.phone !== undefined ? data.phone : user.phone,
      },
    });

    revalidatePath("/profile");
    revalidatePath("/dashboard");

    return {
      success: true,
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
      },
    };
  } catch (error) {
    console.error("Update profile error:", error);
    return { success: false, error: error.message || "Failed to update profile" };
  }
}

export async function updatePassword(data) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };

    const { currentPassword, newPassword } = data;

    if (!currentPassword || !newPassword) {
      return { success: false, error: "Current and new password are required" };
    }

    if (newPassword.length < 6) {
      return { success: false, error: "New password must be at least 6 characters long" };
    }

    const isMatch = await verifyPassword(currentPassword, user.passwordHash);
    if (!isMatch) {
      return { success: false, error: "Incorrect current password" };
    }

    const newHash = await hashPassword(newPassword);

    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash },
    });

    return { success: true, message: "Password updated successfully" };
  } catch (error) {
    console.error("Update password error:", error);
    return { success: false, error: error.message || "Failed to update password" };
  }
}

export async function getSessionUser() {
  const user = await getCurrentUser();
  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    organizationId: user.organizationId,
    organizationName: user.organization?.name,
    currency: user.organization?.currency || "FCFA",
    departmentId: user.departmentId,
    departmentName: user.department?.name,
  };
}
