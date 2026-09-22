"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarIcon, Loader2, Building2, ShoppingCart, ReceiptText, Tag, Banknote, DollarSign } from "lucide-react";
import { format } from "date-fns";
import { useRouter, useSearchParams } from "next/navigation";
import useFetch from "@/hooks/use-fetch";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { createTransaction, updateTransaction } from "@/actions/transaction";
import { transactionSchema } from "@/app/lib/schema";
import { ReceiptScanner } from "./recipt-scanner";

export function AddTransactionForm({
  accounts = [],
  departments = [],
  currentUser,
  categories = [],
  editMode = false,
  initialData = null,
  stockItems = [],
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");

  const defaultDeptId =
    initialData?.departmentId ||
    currentUser?.departmentId ||
    departments[0]?.id ||
    "";

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
    getValues,
    reset,
  } = useForm({
    resolver: zodResolver(transactionSchema),
    defaultValues:
      editMode && initialData
        ? {
            type: initialData.type,
            amount: initialData.amount.toString(),
            description: initialData.description || "",
            departmentId: initialData.departmentId || defaultDeptId,
            accountId: initialData.accountId || "",
            stockItemId: initialData.stockItemId || "",
            stockQuantity: initialData.stockQuantity?.toString() || "",
            category: initialData.category,
            date: new Date(initialData.date),
            isRecurring: initialData.isRecurring,
            ...(initialData.recurringInterval && {
              recurringInterval: initialData.recurringInterval,
            }),
          }
        : {
            type: "PURCHASE",
            amount: "",
            description: "",
            departmentId: defaultDeptId,
            accountId: accounts.find((ac) => ac.isDefault)?.id || accounts[0]?.id || "",
            stockItemId: "",
            stockQuantity: "",
            category: "purchase-meat",
            date: new Date(),
            isRecurring: false,
          },
  });

  const {
    loading: transactionLoading,
    fn: transactionFn,
    data: transactionResult,
  } = useFetch(editMode ? updateTransaction : createTransaction);

  const onSubmit = (data) => {
    const formData = {
      ...data,
      amount: parseFloat(data.amount),
      departmentId: data.departmentId || defaultDeptId,
    };

    if (editMode) {
      transactionFn(editId, formData);
    } else {
      transactionFn(formData);
    }
  };

  const handleScanComplete = (scannedData) => {
    if (scannedData) {
      setValue("amount", scannedData.amount.toString());
      setValue("date", new Date(scannedData.date));
      if (scannedData.type) {
        setValue("type", scannedData.type);
      }
      if (scannedData.description) {
        setValue("description", scannedData.description);
      }
      if (scannedData.category) {
        setValue("category", scannedData.category);
      }
      toast.success("Receipt details extracted and filled into form!");
    }
  };

  useEffect(() => {
    if (transactionResult?.success && !transactionLoading) {
      toast.success(
        editMode
          ? "Transaction updated successfully"
          : "Transaction recorded successfully"
      );
      reset();
      router.push("/dashboard");
      router.refresh();
    }
  }, [transactionResult, transactionLoading, editMode, reset, router]);

  const type = watch("type");
  const isRecurring = watch("isRecurring");
  const date = watch("date");

  // Filter matching categories or fallback
  const filteredCategories = categories.filter(
    (category) => category.type === type
  );
  const displayCategories = filteredCategories.length > 0 ? filteredCategories : categories;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Receipt / Invoice AI Scanner */}
      {!editMode && <ReceiptScanner onScanComplete={handleScanComplete} />}

      {/* Operational Sector / Department */}
      <div className="space-y-2">
        <label className="text-sm font-semibold">Operational Sector / Department</label>
        {currentUser?.role === "ADMIN" ? (
          <Select
            onValueChange={(value) => setValue("departmentId", value)}
            defaultValue={getValues("departmentId") || defaultDeptId}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select department" />
            </SelectTrigger>
            <SelectContent>
              {departments.map((dept) => (
                <SelectItem key={dept.id} value={dept.id}>
                  {dept.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="flex items-center gap-2 p-3 bg-slate-50 border rounded-lg text-sm">
            <Building2 className="h-4 w-4 text-blue-600" />
            <span className="font-semibold text-slate-800">
              {currentUser?.departmentName || departments[0]?.name || "Assigned Sector"}
            </span>
            <span className="text-xs text-muted-foreground ml-auto">
              (Auto-attributed to your authorized department)
            </span>
          </div>
        )}
      </div>

      {/* Transaction Type */}
      <div className="space-y-2">
        <label className="text-sm font-semibold">Transaction Classification</label>
        <Select
          onValueChange={(value) => {
            setValue("type", value);
            // Auto pick first matching category
            const match = categories.find((c) => c.type === value);
            if (match) setValue("category", match.id);
          }}
          defaultValue={type}
        >
          <SelectTrigger className="h-11">
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="PURCHASE">
              📦 Purchases / Raw Stock (Meat, Rice, Drinks, Vegetables)
            </SelectItem>
            <SelectItem value="EXPENSE">
              💡 Operating Expenses / Overheads (Electricity, Fuel, Repairs, Cleaning)
            </SelectItem>
            <SelectItem value="SALE">
              💵 Direct Customer Sale
            </SelectItem>
            <SelectItem value="DISCOUNT">
              🏷️ Discount Given
            </SelectItem>
            <SelectItem value="INCOME">
              💰 Other Income / Non-operating
            </SelectItem>
          </SelectContent>
        </Select>
        {errors.type && (
          <p className="text-sm text-red-500">{errors.type.message}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {type === "PURCHASE" && "Recorded as Cost of Goods Sold (Raw food, beverage ingredients, kitchen supplies)."}
          {type === "EXPENSE" && "Recorded as Operating Overhead (Electricity, transport, generator fuel, maintenance)."}
          {type === "SALE" && "Direct customer sales or dining bills."}
          {type === "DISCOUNT" && "Reductions or concessions granted to customers or promotions."}
        </p>
      </div>

      {/* Amount & Category */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-semibold">Amount (FCFA) *</label>
          <Input
            type="number"
            step="any"
            min="0"
            placeholder="e.g. 45000"
            className="text-lg font-bold h-11"
            {...register("amount")}
          />
          {errors.amount && (
            <p className="text-sm text-red-500">{errors.amount.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold">Specific Category *</label>
          <Select
            onValueChange={(value) => setValue("category", value)}
            defaultValue={getValues("category")}
          >
            <SelectTrigger className="h-11">
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {displayCategories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.category && (
            <p className="text-sm text-red-500">{errors.category.message}</p>
          )}
        </div>
      </div>

      {type === "PURCHASE" && stockItems.length > 0 && (
        <div className="grid gap-6 md:grid-cols-2 rounded-lg border border-blue-200 bg-blue-50/50 p-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold">Stock Item</label>
            <Select onValueChange={(value) => setValue("stockItemId", value)} defaultValue={getValues("stockItemId")}>
              <SelectTrigger className="h-11 bg-white"><SelectValue placeholder="Select purchased stock item" /></SelectTrigger>
              <SelectContent>
                {stockItems.map((item) => <SelectItem key={item.id} value={item.id}>{item.name} ({item.unit})</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">The purchase will increase this item&apos;s current quantity.</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold">Purchased Quantity</label>
            <Input type="number" min="0.01" step="any" placeholder="e.g. 20" className="h-11 bg-white" {...register("stockQuantity")} />
            <p className="text-xs text-muted-foreground">Use the item&apos;s unit, such as bottles, kg, crates, or rooms.</p>
          </div>
        </div>
      )}

      {/* Date */}
      <div className="space-y-2">
        <label className="text-sm font-semibold">Transaction Date *</label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full pl-3 text-left font-normal h-11",
                !date && "text-muted-foreground"
              )}
            >
              {date ? format(date, "PPP") : <span>Pick a date</span>}
              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={date}
              onSelect={(d) => setValue("date", d || new Date())}
              disabled={(d) =>
                d > new Date() || d < new Date("1900-01-01")
              }
              initialFocus
            />
          </PopoverContent>
        </Popover>
        {errors.date && (
          <p className="text-sm text-red-500">{errors.date.message}</p>
        )}
      </div>

      {/* Description */}
      <div className="space-y-2">
        <label className="text-sm font-semibold">Description / Supplier / Merchant / Details</label>
        <Input placeholder="e.g. Purchased 20kg beef from Central Market, or ENEO electricity recharge" {...register("description")} />
        {errors.description && (
          <p className="text-sm text-red-500">{errors.description.message}</p>
        )}
      </div>

      {type === "PURCHASE" && (
        <div className="grid gap-6 rounded-lg border border-blue-200 bg-blue-50/50 p-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-semibold">Supplier</label>
            <Input placeholder="Supplier or market name" {...register("purchaseSupplier")} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold">Invoice / Reference</label>
            <Input placeholder="Receipt or invoice reference" {...register("purchaseReference")} />
          </div>
        </div>
      )}

      {/* Optional Bank / Cash Account */}
      {accounts.length > 0 && (
        <div className="space-y-2">
          <label className="text-sm font-semibold">Account / Cash Drawer Paid From</label>
          <Select
            onValueChange={(value) => setValue("accountId", value)}
            defaultValue={getValues("accountId")}
          >
            <SelectTrigger className="h-11">
              <SelectValue placeholder="Select account (or cash drawer)" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name} ({account.type}) - Balance: {account.balance} FCFA
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Recurring Toggle */}
      <div className="flex flex-row items-center justify-between rounded-lg border p-4 bg-slate-50">
        <div className="space-y-0.5">
          <label className="text-base font-medium">Recurring Entry</label>
          <div className="text-sm text-muted-foreground">
            Schedule this entry to recur automatically (e.g. monthly rent or recurring suppliers)
          </div>
        </div>
        <Switch
          checked={isRecurring}
          onCheckedChange={(checked) => setValue("isRecurring", checked)}
        />
      </div>

      {/* Recurring Interval */}
      {isRecurring && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Recurring Interval</label>
          <Select
            onValueChange={(value) => setValue("recurringInterval", value)}
            defaultValue={getValues("recurringInterval")}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select interval" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="DAILY">Daily</SelectItem>
              <SelectItem value="WEEKLY">Weekly</SelectItem>
              <SelectItem value="MONTHLY">Monthly</SelectItem>
              <SelectItem value="YEARLY">Yearly</SelectItem>
            </SelectContent>
          </Select>
          {errors.recurringInterval && (
            <p className="text-sm text-red-500">
              {errors.recurringInterval.message}
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-4 pt-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={() => router.back()}
        >
          Cancel
        </Button>
        <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold h-11" disabled={transactionLoading}>
          {transactionLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {editMode ? "Updating..." : "Recording..."}
            </>
          ) : editMode ? (
            "Update Entry"
          ) : (
            "Save Operation Entry"
          )}
        </Button>
      </div>
    </form>
  );
}
