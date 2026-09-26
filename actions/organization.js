"use server";

import { db } from "@/lib/prisma";
import { getCurrentUser, hashPassword } from "@/lib/auth";
import { revalidatePath } from "next/cache";

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w\-]+/g, "")
    .replace(/\-\-+/g, "-") + "-" + Math.random().toString(36).substring(2, 6);
}

export async function createOrganization(data) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };
    if (user.role !== "ADMIN") return { success: false, error: "Only admins can create an organization" };
    if (user.organizationId) {
      return { success: false, error: "You already have an organization set up" };
    }

    const { name, currency = "FCFA", departments = [], initialEmployees = [] } = data;

    if (!name || name.trim().length === 0) {
      return { success: false, error: "Organization name is required" };
    }

    const slug = slugify(name);

    // Run creation in transaction
    const result = await db.$transaction(async (tx) => {
      // 1. Create Organization
      const org = await tx.organization.create({
        data: {
          name: name.trim(),
          slug,
          currency: currency || "FCFA",
        },
      });

      // 2. Link the Boss to this organization
      await tx.user.update({
        where: { id: user.id },
        data: { organizationId: org.id },
      });

      // 3. Create initial departments
      const createdDepartments = {};
      for (const item of departments) {
        const deptName = typeof item === "string" ? item.trim() : item?.name?.trim();
        const deptDomain = (typeof item === "object" && item?.domain) || "RESTAURANT";
        if (deptName) {
          const dept = await tx.department.create({
            data: {
              organizationId: org.id,
              name: deptName,
              domain: deptDomain,
              isActive: true,
            },
          });
          createdDepartments[deptName.toLowerCase()] = dept.id;
        }
      }

      // 4. Create initial employees if provided
      for (const emp of initialEmployees) {
        if (emp.email && emp.tempPassword && emp.name) {
          const existing = await tx.user.findUnique({
            where: { email: emp.email.toLowerCase().trim() },
          });

          if (!existing) {
            const passwordHash = await hashPassword(emp.tempPassword);
            let assignedDeptId = null;

            if (emp.departmentName && createdDepartments[emp.departmentName.trim().toLowerCase()]) {
              assignedDeptId = createdDepartments[emp.departmentName.trim().toLowerCase()];
            } else if (emp.departmentId) {
              assignedDeptId = emp.departmentId;
            }

            const newUser = await tx.user.create({
              data: {
                name: emp.name.trim(),
                email: emp.email.toLowerCase().trim(),
                phone: emp.phone || null,
                passwordHash,
                role: emp.role || "STAFF",
                organizationId: org.id,
                departmentId: assignedDeptId,
                isActive: true,
              },
            });

            if (assignedDeptId) {
              await tx.userDepartment.create({
                data: {
                  userId: newUser.id,
                  departmentId: assignedDeptId,
                  isPrimary: true,
                  isActive: true,
                },
              });
            }
          }
        }
      }

      return org;
    });

    revalidatePath("/dashboard");
    revalidatePath("/onboarding");

    return { success: true, organization: result };
  } catch (error) {
    console.error("Create organization error:", error);
    return { success: false, error: error.message || "Failed to create organization" };
  }
}

export async function getOrganizationOverview() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN" || !user.organizationId) return null;

    const org = await db.organization.findUnique({
      where: { id: user.organizationId },
      include: {
        departments: {
          include: {
            _count: {
              select: {
                users: true,
                transactions: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        users: {
          include: {
            department: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    return org;
  } catch (error) {
    console.error("Get organization overview error:", error);
    return null;
  }
}

export async function createDepartment(data) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") return { success: false, error: "Only admins can add departments" };
    if (!user.organizationId) return { success: false, error: "No organization found" };

    const { name, description, domain = "RESTAURANT" } = data;
    if (!name || !name.trim()) return { success: false, error: "Department name is required" };

    const department = await db.department.create({
      data: {
        organizationId: user.organizationId,
        name: name.trim(),
        description: description?.trim() || null,
        domain: domain || "RESTAURANT",
        isActive: true,
      },
    });

    revalidatePath("/organization/departments");
    revalidatePath("/dashboard");

    return { success: true, data: department };
  } catch (error) {
    console.error("Create department error:", error);
    return { success: false, error: error.message || "Failed to create department" };
  }
}

export async function createEmployee(data) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") return { success: false, error: "Only admins can invite/create employees" };
    if (!user.organizationId) return { success: false, error: "No organization found" };

    const { name, email, phone, tempPassword, role = "STAFF", departmentId } = data;

    if (!name || !email || !tempPassword) {
      return { success: false, error: "Name, email, and temporary password are required" };
    }

    const existingUser = await db.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (existingUser) {
      return { success: false, error: "A user with this email already exists" };
    }

    const passwordHash = await hashPassword(tempPassword);

    const employee = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: name.trim(),
          email: email.toLowerCase().trim(),
          phone: phone || null,
          passwordHash,
          role,
          organizationId: user.organizationId,
          departmentId: departmentId || null,
          isActive: true,
        },
        include: {
          department: true,
        },
      });

      if (departmentId) {
        await tx.userDepartment.create({
          data: {
            userId: created.id,
            departmentId,
            isPrimary: true,
            isActive: true,
          },
        });
      }

      return created;
    });

    revalidatePath("/organization/employees");
    revalidatePath("/dashboard");

    return { success: true, data: employee };
  } catch (error) {
    console.error("Create employee error:", error);
    return { success: false, error: error.message || "Failed to create employee" };
  }
}

export async function updateEmployee(data) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") return { success: false, error: "Only admins can update employees" };

    const { employeeId, role, departmentId, isActive } = data;

    if (!employeeId) return { success: false, error: "Employee ID is required" };

    // Prevent admin from demoting themselves accidentally
    if (employeeId === user.id && role && role !== "ADMIN") {
      return { success: false, error: "You cannot demote yourself from Admin" };
    }

    const updateData = {};
    if (role !== undefined) updateData.role = role;
    if (departmentId !== undefined) updateData.departmentId = departmentId || null;
    if (isActive !== undefined) updateData.isActive = isActive;

    const updated = await db.user.update({
      where: { id: employeeId, organizationId: user.organizationId },
      data: updateData,
      include: { department: true },
    });

    revalidatePath("/organization/employees");
    revalidatePath("/dashboard");

    return { success: true, data: updated };
  } catch (error) {
    console.error("Update employee error:", error);
    return { success: false, error: error.message || "Failed to update employee" };
  }
}

export async function updateDepartment(data) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") return { success: false, error: "Only admins can update departments" };
    if (!user.organizationId) return { success: false, error: "No organization found" };

    const { departmentId, name, description, domain, isActive } = data;
    if (!departmentId) return { success: false, error: "Department ID is required" };
    if (!name || !name.trim()) return { success: false, error: "Department name is required" };

    const updateData = {
      name: name.trim(),
      description: description?.trim() || null,
    };
    if (domain) updateData.domain = domain;
    if (isActive !== undefined) updateData.isActive = isActive;

    const department = await db.department.update({
      where: { id: departmentId, organizationId: user.organizationId },
      data: updateData,
    });

    revalidatePath("/organization/departments");
    revalidatePath("/dashboard");

    return { success: true, data: department };
  } catch (error) {
    console.error("Update department error:", error);
    return { success: false, error: error.message || "Failed to update department" };
  }
}

export async function getDepartments() {
  try {
    const user = await getCurrentUser();
    if (!user || !user.organizationId) return [];

    if (user.role === "ADMIN") {
      return await db.department.findMany({
        where: { organizationId: user.organizationId },
        orderBy: { name: "asc" },
      });
    }

    const deptIds = [
      ...(user.departmentId ? [user.departmentId] : []),
      ...(user.memberships?.map((m) => m.departmentId) || []),
    ];

    if (deptIds.length === 0) return [];

    return await db.department.findMany({
      where: { id: { in: Array.from(new Set(deptIds)) }, organizationId: user.organizationId },
      orderBy: { name: "asc" },
    });
  } catch (error) {
    console.error("Get departments error:", error);
    return [];
  }
}

export async function assignUserDepartment(data) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
      return { success: false, error: "Only admins can assign employees to departments" };
    }

    const { userId, departmentId, isPrimary = false } = data;
    if (!userId || !departmentId) {
      return { success: false, error: "User ID and Department ID are required" };
    }

    const membership = await db.userDepartment.upsert({
      where: {
        userId_departmentId: { userId, departmentId },
      },
      update: {
        isActive: true,
        isPrimary,
      },
      create: {
        userId,
        departmentId,
        isPrimary,
        isActive: true,
      },
      include: {
        department: true,
      },
    });

    if (isPrimary) {
      await db.user.update({
        where: { id: userId },
        data: { departmentId },
      });
    }

    revalidatePath("/organization/employees");
    return { success: true, data: membership };
  } catch (error) {
    console.error("Assign user department error:", error);
    return { success: false, error: error.message };
  }
}

export async function removeUserDepartment(data) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
      return { success: false, error: "Only admins can remove department assignments" };
    }

    const { userId, departmentId } = data;
    await db.userDepartment.deleteMany({
      where: { userId, departmentId },
    });

    const nextMembership = await db.userDepartment.findFirst({
      where: { userId, isActive: true },
      orderBy: { isPrimary: "desc" },
    });

    await db.user.update({
      where: { id: userId },
      data: { departmentId: nextMembership?.departmentId || null },
    });

    revalidatePath("/organization/employees");
    return { success: true };
  } catch (error) {
    console.error("Remove user department error:", error);
    return { success: false, error: error.message };
  }
}

