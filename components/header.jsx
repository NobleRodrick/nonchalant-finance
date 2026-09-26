import Link from "next/link";
import Image from "next/image";
import { getCurrentUser } from "@/lib/auth";
import { logoutUser } from "@/actions/auth";
import { Button } from "./ui/button";
import { AppSidebar } from "./app-sidebar";
import { DepartmentSwitcher } from "./department-switcher";
import { db } from "@/lib/prisma";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  User,
  LogOut,
  Building2,
  Users,
  Layers,
  FileCheck,
} from "lucide-react";

export default async function Header() {
  const user = await getCurrentUser();

  let departments = [];
  if (user?.organizationId) {
    if (user.role === "ADMIN") {
      departments = await db.department.findMany({
        where: { organizationId: user.organizationId, isActive: true },
        orderBy: { name: "asc" },
      });
    } else {
      const deptIds = [
        ...(user.departmentId ? [user.departmentId] : []),
        ...(user.memberships?.map((m) => m.departmentId) || []),
      ];
      if (deptIds.length > 0) {
        departments = await db.department.findMany({
          where: {
            id: { in: Array.from(new Set(deptIds)) },
            organizationId: user.organizationId,
            isActive: true,
          },
          orderBy: { name: "asc" },
        });
      }
    }
  }

  const handleLogout = async () => {
    "use server";
    await logoutUser();
  };

  return (
    <header className="fixed top-0 z-50 w-full border-b border-slate-200 bg-white/95 backdrop-blur-md">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        {/* Brand / Logo + Organization Title + Department Switcher */}
        <div className="flex items-center space-x-3">
          {user && <AppSidebar user={user} />}
          <Link href={user ? "/dashboard" : "/"} className="flex items-center space-x-2">
            <Image
              alt="Springer Finance"
              className="h-10 w-auto object-contain rounded-lg"
              src="/logo.jpg"
              height={40}
              width={160}
            />
          </Link>

          {user?.organization && (
            <div className="hidden sm:flex items-center space-x-2 pl-3 border-l border-slate-300">
              <Building2 className="h-4 w-4 text-blue-600" />
              <span className="font-semibold text-slate-900 text-sm hidden md:inline">
                {user.organization.name}
              </span>
              <DepartmentSwitcher user={user} departments={departments} />
            </div>
          )}
        </div>

        {/* Account Actions */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {user ? (
            <>
              {/* User Dropdown Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="rounded-full h-9 w-9 p-0 bg-slate-100 border-slate-300">
                    <span className="font-bold text-xs text-slate-700">
                      {user.name?.charAt(0)?.toUpperCase() || "U"}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-semibold text-slate-900 leading-none">{user.name}</p>
                      <p className="text-xs text-muted-foreground leading-none">{user.email}</p>
                      <div className="pt-1 flex items-center gap-1">
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                          {user.role}
                        </span>
                        {user.department && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 truncate max-w-[120px]">
                            {user.department.name}
                          </span>
                        )}
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />

                  <DropdownMenuItem asChild>
                    <Link href="/profile" className="flex items-center cursor-pointer">
                      <User className="h-4 w-4 mr-2 text-slate-500" />
                      <span>Profile & Settings</span>
                    </Link>
                  </DropdownMenuItem>

                  {user.role === "ADMIN" && (
                    <>
                      <DropdownMenuItem asChild>
                        <Link href="/reports/inbox" className="flex items-center cursor-pointer">
                          <FileCheck className="h-4 w-4 mr-2 text-emerald-600" />
                          <span>Report Review Inbox</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/organization/employees" className="flex items-center cursor-pointer">
                          <Users className="h-4 w-4 mr-2 text-indigo-500" />
                          <span>Staff & Role Management</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/organization/departments" className="flex items-center cursor-pointer">
                          <Layers className="h-4 w-4 mr-2 text-purple-500" />
                          <span>Department Settings</span>
                        </Link>
                      </DropdownMenuItem>
                    </>
                  )}

                  <DropdownMenuSeparator />

                  <form action={handleLogout}>
                    <button type="submit" className="w-full flex items-center px-2 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-sm cursor-pointer">
                      <LogOut className="h-4 w-4 mr-2" />
                      <span>Sign Out</span>
                    </button>
                  </form>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost" size="sm">
                  Sign In
                </Button>
              </Link>
              <Link href="/register">
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                  Register Business
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}