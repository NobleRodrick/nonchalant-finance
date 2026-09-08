"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createOrganization } from "@/actions/organization";
import { generateTempPassword } from "@/lib/password-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Building2,
  Layers,
  Users,
  Plus,
  Trash2,
  Check,
  ArrowRight,
  ArrowLeft,
  Loader2,
} from "lucide-react";

const SUGGESTED_DEPTS = [
  "Bistro Restaurant",
  "Bistro Snack Bar",
  "Kitchen & Catering",
  "VIP Lounge",
  "Store & Warehouse",
];

const emptyEmployee = (departmentName = "") => ({
  name: "",
  email: "",
  tempPassword: generateTempPassword(),
  role: "ACCOUNTANT",
  departmentName,
});

export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [currency] = useState("FCFA");
  const [departments, setDepartments] = useState([]);
  const [newDeptInput, setNewDeptInput] = useState("");
  const [employees, setEmployees] = useState([]);

  const handleAddDept = (dept) => {
    const trimmed = dept.trim();
    if (trimmed && !departments.includes(trimmed)) {
      setDepartments([...departments, trimmed]);
      setNewDeptInput("");
    }
  };

  const handleRemoveDept = (indexToRemove) => {
    setDepartments(departments.filter((_, idx) => idx !== indexToRemove));
  };

  const handleAddEmployeeRow = () => {
    setEmployees([...employees, emptyEmployee(departments[0] || "")]);
  };

  const handleUpdateEmployee = (index, field, value) => {
    const updated = [...employees];
    updated[index][field] = value;
    setEmployees(updated);
  };

  const handleRemoveEmployee = (index) => {
    setEmployees(employees.filter((_, idx) => idx !== index));
  };

  const handleFinish = async () => {
    if (!orgName.trim()) {
      toast.error("Please enter an organization name");
      setStep(1);
      return;
    }

    if (departments.length === 0) {
      toast.error("Please add at least one department");
      setStep(2);
      return;
    }

    setLoading(true);

    const validEmployees = employees.filter(
      (emp) => emp.name.trim() && emp.email.trim() && emp.tempPassword.trim()
    );

    try {
      const res = await createOrganization({
        name: orgName,
        currency,
        departments,
        initialEmployees: validEmployees,
      });

      if (res.success) {
        toast.success(`Welcome to ${orgName}! Your organization is ready.`);
        router.push("/dashboard");
        router.refresh();
      } else {
        toast.error(res.error || "Failed to set up organization");
      }
    } catch (err) {
      toast.error(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8 max-w-lg mx-auto">
        <div className="flex flex-col items-center">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
              step >= 1 ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-600"
            }`}
          >
            1
          </div>
          <span className="text-xs mt-1 font-medium">Organization</span>
        </div>

        <div className={`flex-1 h-1 mx-2 ${step >= 2 ? "bg-blue-600" : "bg-slate-200"}`} />

        <div className="flex flex-col items-center">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
              step >= 2 ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-600"
            }`}
          >
            2
          </div>
          <span className="text-xs mt-1 font-medium">Departments</span>
        </div>

        <div className={`flex-1 h-1 mx-2 ${step >= 3 ? "bg-blue-600" : "bg-slate-200"}`} />

        <div className="flex flex-col items-center">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
              step >= 3 ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-600"
            }`}
          >
            3
          </div>
          <span className="text-xs mt-1 font-medium">Staff (Optional)</span>
        </div>
      </div>

      {step === 1 && (
        <Card className="shadow-lg border-slate-200">
          <CardHeader className="text-center">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mx-auto mb-2">
              <Building2 className="h-6 w-6" />
            </div>
            <CardTitle className="text-2xl font-bold">Name Your Business Organization</CardTitle>
            <CardDescription>
              This is your main umbrella company that will contain your departments
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 max-w-md mx-auto">
            <div className="space-y-2">
              <label className="text-sm font-semibold">Business / Organization Name</label>
              <Input
                type="text"
                placeholder="e.g. Chris Complex"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="h-11 text-base font-medium"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold">Primary Currency</label>
              <Input
                type="text"
                value={currency}
                disabled
                className="h-11 bg-slate-50 font-mono text-muted-foreground"
              />
              <p className="text-xs text-muted-foreground">Standardized to Central African CFA Franc (FCFA)</p>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end border-t pt-4">
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              onClick={() => {
                if (!orgName.trim()) {
                  toast.error("Please enter a business name");
                  return;
                }
                setStep(2);
              }}
            >
              Continue to Departments
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {step === 2 && (
        <Card className="shadow-lg border-slate-200">
          <CardHeader className="text-center">
            <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center mx-auto mb-2">
              <Layers className="h-6 w-6" />
            </div>
            <CardTitle className="text-2xl font-bold">Define Your Sectors & Departments</CardTitle>
            <CardDescription>
              Create branches or operational units for {orgName || "your organization"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold">Active Departments ({departments.length})</label>
              <div className="flex flex-wrap gap-2 min-h-[50px] p-3 border rounded-lg bg-slate-50">
                {departments.map((dept, index) => (
                  <Badge
                    key={index}
                    variant="secondary"
                    className="px-3 py-1.5 text-sm font-medium flex items-center gap-2 bg-white border shadow-sm"
                  >
                    <span>{dept}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveDept(index)}
                      className="text-slate-400 hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </Badge>
                ))}
                {departments.length === 0 && (
                  <p className="text-sm text-muted-foreground italic py-2">No departments added yet</p>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="Enter department name..."
                value={newDeptInput}
                onChange={(e) => setNewDeptInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddDept(newDeptInput);
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={() => handleAddDept(newDeptInput)}>
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Quick Suggestions:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTED_DEPTS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => handleAddDept(item)}
                    className="text-xs px-2.5 py-1 rounded-full border border-dashed border-slate-300 hover:border-blue-500 hover:text-blue-600 bg-white"
                  >
                    + {item}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between border-t pt-4">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              onClick={() => {
                if (departments.length === 0) {
                  toast.error("Please add at least one department");
                  return;
                }
                if (employees.length === 0) {
                  setEmployees([emptyEmployee(departments[0])]);
                }
                setStep(3);
              }}
            >
              Continue to Staff
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardFooter>
        </Card>
      )}

      {step === 3 && (
        <Card className="shadow-lg border-slate-200">
          <CardHeader className="text-center">
            <div className="w-12 h-12 bg-teal-50 text-teal-600 rounded-xl flex items-center justify-center mx-auto mb-2">
              <Users className="h-6 w-6" />
            </div>
            <CardTitle className="text-2xl font-bold">Delegate Staff & Initial Credentials</CardTitle>
            <CardDescription>
              Add employees now or skip this step and invite them later from your Admin Dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {employees.map((emp, index) => (
              <div key={index} className="p-4 border rounded-xl bg-slate-50 space-y-3 relative">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Staff Member #{index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveEmployee(index)}
                    className="text-slate-400 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600">Full Name</label>
                    <Input
                      placeholder="e.g. Marie Accountant"
                      value={emp.name}
                      onChange={(e) => handleUpdateEmployee(index, "name", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">Work Email</label>
                    <Input
                      type="email"
                      placeholder="marie@company.com"
                      value={emp.email}
                      onChange={(e) => handleUpdateEmployee(index, "email", e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600">Initial Password</label>
                    <Input
                      value={emp.tempPassword}
                      onChange={(e) => handleUpdateEmployee(index, "tempPassword", e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-600">Role</label>
                    <select
                      className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                      value={emp.role}
                      onChange={(e) => handleUpdateEmployee(index, "role", e.target.value)}
                    >
                      <option value="ACCOUNTANT">Accountant</option>
                      <option value="MANAGER">Manager</option>
                      <option value="STAFF">Staff / Operator</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-600">Assigned Department</label>
                    <select
                      className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                      value={emp.departmentName}
                      onChange={(e) => handleUpdateEmployee(index, "departmentName", e.target.value)}
                    >
                      {departments.map((dept) => (
                        <option key={dept} value={dept}>
                          {dept}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              className="w-full border-dashed"
              onClick={handleAddEmployeeRow}
            >
              <Plus className="h-4 w-4 mr-2" /> Add Another Staff Member
            </Button>
          </CardContent>
          <CardFooter className="flex justify-between border-t pt-4">
            <Button variant="outline" onClick={() => setStep(2)} disabled={loading}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white font-medium"
              onClick={handleFinish}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Setting Up...
                </>
              ) : (
                <>
                  Complete Setup & Open Workspace
                  <Check className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
