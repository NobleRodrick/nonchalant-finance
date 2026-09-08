"use client";

import { useState } from "react";
import { createEmployee, updateEmployee, getOrganizationOverview } from "@/actions/organization";
import { generateTempPassword } from "@/lib/password-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { UserPlus, Loader2 } from "lucide-react";

function createEmptyEmployee(defaultDeptId = "") {
  return {
    name: "",
    email: "",
    phone: "",
    tempPassword: generateTempPassword(),
    role: "ACCOUNTANT",
    departmentId: defaultDeptId,
  };
}

export function EmployeesClient({ initialData }) {
  const [orgData, setOrgData] = useState(initialData);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const defaultDeptId = initialData?.departments?.[0]?.id || "";
  const [newEmployee, setNewEmployee] = useState(() => createEmptyEmployee(defaultDeptId));

  const refreshOverview = async () => {
    const data = await getOrganizationOverview();
    setOrgData(data);
    return data;
  };

  const handleCreateEmployee = async (e) => {
    e.preventDefault();
    if (!newEmployee.name || !newEmployee.email || !newEmployee.tempPassword) {
      toast.error("Please fill in all required fields");
      return;
    }

    setSubmitting(true);
    try {
      const res = await createEmployee(newEmployee);
      if (res.success) {
        toast.success(`Account created for ${newEmployee.name}! Temp password: ${newEmployee.tempPassword}`);
        setDialogOpen(false);
        setNewEmployee(createEmptyEmployee(orgData?.departments?.[0]?.id || ""));
        await refreshOverview();
      } else {
        toast.error(res.error || "Failed to create employee");
      }
    } catch (err) {
      toast.error(err.message || "An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRoleChange = async (employeeId, newRole) => {
    try {
      const res = await updateEmployee({ employeeId, role: newRole });
      if (res.success) {
        toast.success(`Role updated to ${newRole}`);
        await refreshOverview();
      } else {
        toast.error(res.error || "Failed to update role");
      }
    } catch (err) {
      toast.error(err.message || "Failed to update role");
    }
  };

  const handleDepartmentChange = async (employeeId, newDeptId) => {
    try {
      const res = await updateEmployee({ employeeId, departmentId: newDeptId });
      if (res.success) {
        toast.success("Department reassigned");
        await refreshOverview();
      } else {
        toast.error(res.error || "Failed to reassign department");
      }
    } catch (err) {
      toast.error(err.message || "Failed to reassign department");
    }
  };

  const handleToggleStatus = async (employeeId, currentStatus) => {
    try {
      const res = await updateEmployee({ employeeId, isActive: !currentStatus });
      if (res.success) {
        toast.success(`User ${!currentStatus ? "activated" : "deactivated"}`);
        await refreshOverview();
      } else {
        toast.error(res.error || "Failed to change status");
      }
    } catch (err) {
      toast.error(err.message || "Failed to change status");
    }
  };

  const users = orgData?.users || [];
  const departments = orgData?.departments || [];

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Staff & Delegation Management</h1>
          <p className="text-muted-foreground text-sm">
            Delegate roles, assign employees to operational sectors, and generate initial temporary passwords
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white">
              <UserPlus className="h-4 w-4 mr-2" /> Add New Staff Member
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create Staff Account</DialogTitle>
              <DialogDescription>
                Provide credentials for your employee. They will log in using this email and temporary password.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreateEmployee} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Full Name *</label>
                <Input
                  placeholder="e.g. Marie Accountant"
                  required
                  value={newEmployee.name}
                  onChange={(e) => setNewEmployee({ ...newEmployee, name: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Work Email Address *</label>
                <Input
                  type="email"
                  placeholder="marie@company.com"
                  required
                  value={newEmployee.email}
                  onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Initial Temporary Password *</label>
                <Input
                  required
                  value={newEmployee.tempPassword}
                  onChange={(e) => setNewEmployee({ ...newEmployee, tempPassword: e.target.value })}
                />
                <p className="text-[11px] text-muted-foreground">
                  Give this password to the employee. They can change it anytime in Profile Settings.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold">Assigned Role</label>
                  <select
                    className="w-full h-10 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                    value={newEmployee.role}
                    onChange={(e) => setNewEmployee({ ...newEmployee, role: e.target.value })}
                  >
                    <option value="ACCOUNTANT">Accountant (Reports & Ledger)</option>
                    <option value="MANAGER">Manager</option>
                    <option value="STAFF">Staff / Cashier</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold">Assigned Sector</label>
                  <select
                    className="w-full h-10 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                    value={newEmployee.departmentId}
                    onChange={(e) => setNewEmployee({ ...newEmployee, departmentId: e.target.value })}
                  >
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <DialogFooter className="pt-3">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Account"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="shadow-sm border-slate-200">
        <CardHeader>
          <CardTitle className="text-lg font-bold">Active Staff Directory ({users.length})</CardTitle>
          <CardDescription>
            Manage employee roles, upgrade/downgrade authorizations, and update department assignments
          </CardDescription>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <p className="text-center py-8 text-sm text-muted-foreground">
              No staff members yet. Add your first employee to get started.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600 uppercase text-[11px] font-bold border-b">
                  <tr>
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-4">Role & Status</th>
                    <th className="py-3 px-4">Assigned Sector</th>
                    <th className="py-3 px-4">Role Actions</th>
                    <th className="py-3 px-4 text-right">Account Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {users.map((emp) => (
                    <tr key={emp.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{emp.name}</div>
                        <div className="text-xs text-muted-foreground">{emp.email}</div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <Badge
                            variant={emp.role === "ADMIN" ? "default" : "secondary"}
                            className={`text-xs font-semibold ${
                              emp.role === "ADMIN"
                                ? "bg-purple-600 text-white"
                                : emp.role === "ACCOUNTANT"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-blue-100 text-blue-800"
                            }`}
                          >
                            {emp.role}
                          </Badge>
                          {!emp.isActive && (
                            <Badge variant="outline" className="text-xs text-red-600">
                              Inactive
                            </Badge>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        {emp.role === "ADMIN" ? (
                          <span className="text-xs text-slate-500 font-medium">All Departments (Global)</span>
                        ) : (
                          <select
                            className="h-8 rounded border border-input bg-transparent px-2 py-0 text-xs"
                            value={emp.departmentId || ""}
                            onChange={(e) => handleDepartmentChange(emp.id, e.target.value)}
                          >
                            {departments.map((dept) => (
                              <option key={dept.id} value={dept.id}>
                                {dept.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        {emp.role === "ADMIN" ? (
                          <span className="text-xs text-slate-400 italic">Owner (Admin)</span>
                        ) : (
                          <select
                            className="h-8 rounded border border-slate-300 bg-white px-2 py-0 text-xs font-medium"
                            value={emp.role}
                            onChange={(e) => handleRoleChange(emp.id, e.target.value)}
                          >
                            <option value="STAFF">Staff</option>
                            <option value="ACCOUNTANT">Accountant</option>
                            <option value="MANAGER">Manager</option>
                          </select>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        {emp.role !== "ADMIN" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleStatus(emp.id, emp.isActive)}
                            className={emp.isActive ? "text-slate-600 hover:text-red-600" : "text-emerald-600"}
                          >
                            {emp.isActive ? (
                              <span className="text-xs">Deactivate</span>
                            ) : (
                              <span className="text-xs font-semibold">Activate</span>
                            )}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
