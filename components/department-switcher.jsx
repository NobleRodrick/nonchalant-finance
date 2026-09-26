"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { switchActiveDepartment } from "@/actions/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDown, Check, Layers, Loader2 } from "lucide-react";
import { getDomainConfig } from "@/lib/domain-capabilities";
import { toast } from "sonner";

export function DepartmentSwitcher({ user, departments = [] }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (!departments || departments.length === 0) return null;

  const currentDeptId = user.activeDepartmentId || user.departmentId;
  const currentDept =
    departments.find((d) => d.id === currentDeptId) || departments[0];

  const handleSelect = (deptId) => {
    if (deptId === currentDeptId) return;

    startTransition(async () => {
      const res = await switchActiveDepartment(deptId);
      if (res?.success) {
        toast.success("Switched active department");
        router.refresh();
      } else {
        toast.error(res?.error || "Failed to switch department");
      }
    });
  };

  const domainConfig = getDomainConfig(currentDept?.domain);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={isPending}
          className="h-8 px-2.5 text-xs font-semibold border-slate-200 bg-slate-50 hover:bg-slate-100 flex items-center gap-1.5"
        >
          {isPending ? (
            <Loader2 className="h-3 w-3 animate-spin text-blue-600" />
          ) : (
            <Layers className="h-3.5 w-3.5 text-blue-600" />
          )}
          <span className="max-w-[130px] truncate">{currentDept?.name || "Select Dept"}</span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded border font-medium hidden md:inline-block ${domainConfig.badgeColor}`}>
            {domainConfig.label.split(" ")[0]}
          </span>
          <ChevronDown className="h-3 w-3 text-slate-400" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Switch Department
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {departments.map((dept) => {
          const config = getDomainConfig(dept.domain);
          const isSelected = dept.id === currentDeptId;

          return (
            <DropdownMenuItem
              key={dept.id}
              onClick={() => handleSelect(dept.id)}
              className="flex items-center justify-between text-xs cursor-pointer py-2"
            >
              <div className="flex flex-col">
                <span className="font-semibold text-slate-800">{dept.name}</span>
                <span className="text-[10px] text-muted-foreground">{config.label}</span>
              </div>
              {isSelected && <Check className="h-3.5 w-3.5 text-blue-600 font-bold" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
