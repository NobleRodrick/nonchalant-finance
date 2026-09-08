"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSessionUser, updateProfile, updatePassword } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { User, Lock, Phone, Mail, Building2, Shield, Loader2, CheckCircle2 } from "lucide-react";

export default function ProfilePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // User details
  const [user, setUser] = useState(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  // Password fields
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (searchParams.get("notice") === "no-department") {
      toast.error("Your account is not assigned to a department. Contact your manager.");
    }
  }, [searchParams]);

  useEffect(() => {
    async function loadUser() {
      try {
        const session = await getSessionUser();
        if (session) {
          setUser(session);
          setName(session.name || "");
          setPhone(session.phone || "");
        }
      } catch (err) {
        toast.error("Failed to load user profile");
      } finally {
        setLoading(false);
      }
    }
    loadUser();
  }, []);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await updateProfile({ name, phone });
      if (res.success) {
        toast.success("Profile updated successfully");
        router.refresh();
      } else {
        toast.error(res.error || "Failed to update profile");
      }
    } catch (err) {
      toast.error(err.message || "An error occurred");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }

    setSavingPassword(true);
    try {
      const res = await updatePassword({ currentPassword, newPassword });
      if (res.success) {
        toast.success("Password changed successfully!");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        toast.error(res.error || "Failed to change password");
      }
    } catch (err) {
      toast.error(err.message || "An error occurred");
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Account & Profile Settings</h1>
        <p className="text-muted-foreground text-sm">
          Manage your personal details and authentication credentials
        </p>
      </div>

      {/* Basic Profile Info */}
      <Card className="shadow-sm border-slate-200">
        <CardHeader>
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <User className="h-5 w-5 text-blue-600" />
            Personal Information
          </CardTitle>
          <CardDescription>
            Your display name and contact information across {user?.organizationName || "the organization"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Full Name</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Contact Phone</label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+237 6XX XXX XXX"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Work Email (Fixed)</label>
                <Input value={user?.email || ""} disabled className="bg-slate-50 text-slate-600 font-mono text-xs" />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Organization & Role</label>
                <div className="flex items-center gap-2 h-10 px-3 border rounded-md bg-slate-50">
                  <Badge variant="secondary" className="font-bold text-xs bg-blue-100 text-blue-800">
                    {user?.role}
                  </Badge>
                  <span className="text-xs text-slate-600 truncate">
                    {user?.departmentName || "All Departments"}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={savingProfile}>
                {savingProfile ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save Profile Changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Voluntary Password Change */}
      <Card className="shadow-sm border-slate-200">
        <CardHeader>
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <Lock className="h-5 w-5 text-purple-600" />
            Security & Password (Optional)
          </CardTitle>
          <CardDescription>
            You can keep using the initial password provided by your manager, or set a new custom password whenever you like.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Current Password</label>
              <Input
                type="password"
                placeholder="Enter current or initial temporary password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">New Password</label>
                <Input
                  type="password"
                  placeholder="Minimum 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Confirm New Password</label>
                <Input
                  type="password"
                  placeholder="Repeat new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <Button type="submit" variant="secondary" className="border" disabled={savingPassword}>
                {savingPassword ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Update Password
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
