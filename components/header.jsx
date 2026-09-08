import Link from "next/link";
import Image from "next/image";
import { getCurrentUser } from "@/lib/auth";
import { logoutUser } from "@/actions/auth";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  LayoutDashboard,
  PenBox,
  FileText,
  Users,
  Layers,
  User,
  LogOut,
  Building2,
  Shield,
  Briefcase,
} from "lucide-react";

export default async function Header() {
  const user = await getCurrentUser();

  const handleLogout = async () => {
    "use server";
    await logoutUser();
  };

  return (
    <header className="fixed top-0 w-full bg-white/95 backdrop-blur-md z-50 border-b border-slate-200">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        {/* Brand / Logo + Organization Title */}
        <div className="flex items-center space-x-3">
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
            <div className="hidden sm:flex items-center space-x-1.5 pl-3 border-l border-slate-300">
              <Building2 className="h-4 w-4 text-blue-600" />
              <span className="font-semibold text-slate-900 text-sm">{user.organization.name}</span>
              {user.department && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                  {user.department.name}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Navigation Actions */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {user ? (
            <>
              {/* Common Links */}
              <Link href="/dashboard">
                <Button variant="ghost" size="sm" className="flex items-center gap-1.5 text-slate-700">
                  <LayoutDashboard className="h-4 w-4 text-blue-600" />
                  <span className="hidden md:inline font-medium">Dashboard</span>
                </Button>
              </Link>

              {/* Boss-only links */}
              {user.role === "ADMIN" && (
                <>
                  <Link href="/organization/employees">
                    <Button variant="ghost" size="sm" className="hidden lg:flex items-center gap-1.5 text-slate-700">
                      <Users className="h-4 w-4 text-indigo-600" />
                      <span className="font-medium">Staff & Roles</span>
                    </Button>
                  </Link>
                  <Link href="/organization/departments">
                    <Button variant="ghost" size="sm" className="hidden lg:flex items-center gap-1.5 text-slate-700">
                      <Layers className="h-4 w-4 text-purple-600" />
                      <span className="font-medium">Departments</span>
                    </Button>
                  </Link>
                </>
              )}

              {/* Reports Link (for both Boss and Accountants) */}
              <Link href="/reports">
                <Button variant="ghost" size="sm" className="flex items-center gap-1.5 text-slate-700">
                  <FileText className="h-4 w-4 text-emerald-600" />
                  <span className="hidden sm:inline font-medium">Reports</span>
                </Button>
              </Link>

              {/* Record Transaction Button */}
              <Link href="/transaction/create">
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5">
                  <PenBox className="h-4 w-4" />
                  <span className="hidden sm:inline">Add Transaction</span>
                </Button>
              </Link>

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