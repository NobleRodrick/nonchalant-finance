"use client";

import { useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays } from "lucide-react";
import { format, subMonths, startOfMonth } from "date-fns";

export function MonthSelector({ selectedMonth, onMonthChange }) {
  // Generate list of the last 12 months + "all"
  const monthOptions = useMemo(() => {
    const options = [
      { value: "all", label: "All Months (Consolidated)" },
    ];

    const current = startOfMonth(new Date());
    for (let i = 0; i < 12; i++) {
      const m = subMonths(current, i);
      const val = format(m, "yyyy-MM");
      const label = format(m, "MMMM yyyy");
      options.push({ value: val, label });
    }

    return options;
  }, []);

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase text-slate-700 whitespace-nowrap">
        <CalendarDays className="h-4 w-4 text-indigo-600" />
        <span>Accounting Period:</span>
      </div>
      <Select value={selectedMonth} onValueChange={onMonthChange}>
        <SelectTrigger className="h-9 w-[190px] text-xs font-bold bg-white border-slate-300">
          <SelectValue placeholder="Select Period" />
        </SelectTrigger>
        <SelectContent>
          {monthOptions.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="text-xs font-medium">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
