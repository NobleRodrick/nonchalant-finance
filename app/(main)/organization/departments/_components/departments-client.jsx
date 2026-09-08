"use client";

import { useState } from "react";
import { createDepartment, updateDepartment, getOrganizationOverview } from "@/actions/organization";
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
import { Layers, Plus, Users, FileText, Loader2, Pencil } from "lucide-react";

export function DepartmentsClient({ initialData }) {
  const [orgData, setOrgData] = useState(initialData);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editingDept, setEditingDept] = useState(null);

  const refreshOverview = async () => {
    const data = await getOrganizationOverview();
    setOrgData(data);
    return data;
  };

  const handleCreateDepartment = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Department name is required");
      return;
    }

    setSubmitting(true);
    try {
      const res = await createDepartment({ name, description });
      if (res.success) {
        toast.success(`Department "${name}" created successfully!`);
        setCreateDialogOpen(false);
        setName("");
        setDescription("");
        await refreshOverview();
      } else {
        toast.error(res.error || "Failed to create department");
      }
    } catch (err) {
      toast.error(err.message || "An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  const openEditDialog = (dept) => {
    setEditingDept(dept);
    setName(dept.name);
    setDescription(dept.description || "");
    setEditDialogOpen(true);
  };

  const handleUpdateDepartment = async (e) => {
    e.preventDefault();
    if (!editingDept || !name.trim()) {
      toast.error("Department name is required");
      return;
    }

    setSubmitting(true);
    try {
      const res = await updateDepartment({
        departmentId: editingDept.id,
        name,
        description,
      });
      if (res.success) {
        toast.success(`Department "${name}" updated successfully!`);
        setEditDialogOpen(false);
        setEditingDept(null);
        setName("");
        setDescription("");
        await refreshOverview();
      } else {
        toast.error(res.error || "Failed to update department");
      }
    } catch (err) {
      toast.error(err.message || "An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  const departments = orgData?.departments || [];

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Operational Sectors & Departments</h1>
          <p className="text-muted-foreground text-sm">
            Manage your organization&apos;s business units (e.g. Bistro Restaurant, Snack Bar, Catering)
          </p>
        </div>

        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="h-4 w-4 mr-2" /> Add New Sector / Department
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Department</DialogTitle>
              <DialogDescription>
                Create a distinct operational sector for accounting and staff assignments.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreateDepartment} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Department Name *</label>
                <Input
                  placeholder="e.g. Bistro Snack Bar"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Description (Optional)</label>
                <Input
                  placeholder="Brief notes or operational purpose"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <DialogFooter className="pt-3">
                <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Department"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {departments.length === 0 ? (
        <Card className="shadow-sm border-slate-200">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No departments yet. Add your first operational sector to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {departments.map((dept) => (
            <Card key={dept.id} className="shadow-sm border-slate-200">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Layers className="h-5 w-5" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      Active Sector
                    </Badge>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(dept)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <CardTitle className="text-lg font-bold mt-2">{dept.name}</CardTitle>
                {dept.description && (
                  <CardDescription className="text-xs">{dept.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="pt-2 border-t">
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-slate-400" />
                    <div>
                      <span className="font-bold text-slate-800">{dept._count?.users || 0}</span> Staff Assigned
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-slate-400" />
                    <div>
                      <span className="font-bold text-slate-800">{dept._count?.transactions || 0}</span> Entries
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Department</DialogTitle>
            <DialogDescription>Update the name or description of this operational sector.</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleUpdateDepartment} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Department Name *</label>
              <Input required value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Description (Optional)</label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
