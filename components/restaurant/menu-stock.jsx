"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Boxes, ClipboardCheck, History, MoreHorizontal, Pencil, PlusCircle, Printer, RotateCcw, Search, Trash2, UtensilsCrossed, Wallet, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState, Money, Plates, StatCard, StatusBadge, inputClass } from "@/components/kit/primitives";
import { runWithToast, useLiveRefresh } from "@/components/kit/client";
import { countOf, formatMoney } from "@/lib/format";
import { removeDish, restoreRemovedDish } from "@/actions/menu-stock";
import { AddDishDialog, AddStockDialog, CorrectCountDialog, DishHistoryDialog, EditDishDialog, OpeningStockDialog } from "./menu-stock-dialogs";
import { cn } from "@/lib/utils";

/**
 * Menu & Stock: the list of dishes (the menu) and the plates of each (the stock) on one page.
 * Opening + Added − Sold = Closing, per dish and in total, with the value at the unit price.
 */
export function MenuStockBoard({ departmentId, departmentName, dateKey, dateLabel, isToday, locked, canManage, canBuy, showRemoved, stock }) {
  useLiveRefresh(20);
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [q, setQ] = useState("");
  const [dialog, setDialog] = useState(null); // { type, dish }
  const editable = canManage && !locked;
  const { rows, totals, showSpoiled, showCorrected } = stock;
  const activeRows = rows.filter((r) => r.isActive);
  const filtered = useMemo(() => rows.filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase())), [rows, q]);
  const low = activeRows.filter((r) => r.lowStock);

  const open = (type, dish = null) => setDialog({ type, dish });
  const close = () => setDialog(null);
  const toggleRemoved = () => {
    const next = new URLSearchParams(search.toString());
    if (showRemoved) next.delete("removed");
    else next.set("removed", "1");
    router.push(`${pathname}${next.toString() ? `?${next}` : ""}`);
  };
  const remove = async (r) => {
    if (await runWithToast(removeDish({ departmentId, dishId: r.dishId }), { success: `"${r.name}" removed from the menu.` })) router.refresh();
  };
  const restore = async (r) => {
    if (await runWithToast(restoreRemovedDish({ departmentId, dishId: r.dishId }), { success: `"${r.name}" is back on the menu.` })) router.refresh();
  };

  const formula = ["Opening", "+ Added", "− Sold", showSpoiled ? "− Spoiled" : null, showCorrected ? "± Corrections" : null].filter(Boolean).join(" ");

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 print:hidden">
        <StatCard icon={UtensilsCrossed} label="Dishes on the menu" value={totals.dishes} hint={low.length ? `${low.length} low or out of stock` : "All in stock"} tone={low.length ? "warn" : "default"} />
        <StatCard icon={Boxes} label={isToday ? "Plates in stock now" : "Plates at closing"} value={<Plates value={totals.closing} />} hint={`Opening ${totals.opening} · added ${totals.added}`} />
        <StatCard icon={Wallet} label={isToday ? "Stock value now" : "Closing stock value"} value={<Money value={totals.value} />} hint={<>Opening value <Money value={totals.openingValue} /></>} tone="in" />
        <StatCard icon={ShoppingBag} label={isToday ? "Sold today" : "Sold that day"} value={<><Plates value={totals.sold} /> <span className="text-sm font-normal text-slate-500">plates</span></>} hint={<>Worth <Money value={totals.soldValue} /></>} />
      </div>

      {low.length ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 print:hidden">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>Low or out of stock:</strong> {low.map((r) => `${r.name} (${r.closing})`).join(", ")}.
          </span>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between print:hidden">
        <div className="flex flex-wrap gap-2">
          {editable ? (
            <>
              <Button onClick={() => open("addDish")}>
                <PlusCircle className="h-4 w-4" /> Add dish
              </Button>
              <Button variant="outline" onClick={() => open("addStock")}>
                <Boxes className="h-4 w-4" /> Add stock
              </Button>
              <Button variant="outline" onClick={() => open("opening")} disabled={!activeRows.length}>
                <Pencil className="h-4 w-4" /> Edit opening stock
              </Button>
              <Button variant="outline" onClick={() => open("count")} disabled={!activeRows.length}>
                <ClipboardCheck className="h-4 w-4" /> Correct a count
              </Button>
            </>
          ) : null}
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print stock sheet
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input aria-label="Search dishes" className={cn(inputClass, "w-56 pl-9")} placeholder="Search dishes…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 whitespace-nowrap text-sm text-slate-600">
            <input type="checkbox" checked={showRemoved} onChange={toggleRemoved} className="h-4 w-4" /> Show removed
          </label>
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block">
        <div className="flex items-end justify-between border-b-2 border-slate-900 pb-2">
          <div>
            <div className="text-lg font-bold">Stock sheet — {departmentName}</div>
            <div className="text-sm">{dateLabel}</div>
          </div>
          <div className="text-right text-xs" suppressHydrationWarning>Printed {new Date().toLocaleString("en-GB", { timeZone: "Africa/Douala" })}</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={UtensilsCrossed}
          title="No dishes yet"
          description="Add the dishes you sell, with their unit price and the plates available. They become your menu and your stock."
          action={editable ? <Button onClick={() => open("addDish")}><PlusCircle className="h-4 w-4" /> Add your first dish</Button> : null}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs print:rounded-none print:border-slate-400 print:shadow-none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="menu-stock-table">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                  <th className="px-4 py-3 text-left font-medium">Dish</th>
                  <th className="px-3 py-3 text-right font-medium">Unit price</th>
                  <th className="px-3 py-3 text-right font-medium">Opening</th>
                  <th className="px-3 py-3 text-right font-medium">Added</th>
                  <th className="px-3 py-3 text-right font-medium">Sold</th>
                  {showSpoiled ? <th className="px-3 py-3 text-right font-medium">Spoiled</th> : null}
                  {showCorrected ? <th className="px-3 py-3 text-right font-medium">Corrections</th> : null}
                  <th className="px-3 py-3 text-right font-semibold text-slate-700">Closing</th>
                  <th className="px-3 py-3 text-right font-medium">Value</th>
                  <th className="hidden px-3 py-3 text-right font-medium print:table-cell">Counted</th>
                  <th className="w-12 px-2 py-3 print:hidden" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.dishId} className={cn("border-b border-slate-100 last:border-0 hover:bg-slate-50/70", !r.isActive && "bg-slate-50 text-slate-400")} data-testid={`dish-row-${r.name}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 font-medium text-slate-900">
                        {r.name}
                        {!r.isActive ? <StatusBadge status="INACTIVE" label="Removed" /> : r.closing <= 0 ? <StatusBadge status="LATE" label="Out of stock" /> : r.lowStock ? <StatusBadge status="RETURNED" label="Low" /> : null}
                      </div>
                      {r.description ? <div className="text-xs text-slate-500">{r.description}</div> : null}
                    </td>
                    <td className="px-3 py-3 text-right"><Money value={r.unitPrice} suffix={false} /></td>
                    <td className="px-3 py-3 text-right">
                      <Plates value={r.opening} />
                      {r.openingCorrection ? <div className="text-[11px] text-slate-400">set by head ({r.openingCorrection > 0 ? "+" : ""}{r.openingCorrection})</div> : null}
                    </td>
                    <td className="px-3 py-3 text-right text-emerald-700">{r.added ? <>+<Plates value={r.added} /></> : <span className="text-slate-300">0</span>}</td>
                    <td className="px-3 py-3 text-right text-rose-700">{r.sold ? <>−<Plates value={r.sold} /></> : <span className="text-slate-300">0</span>}</td>
                    {showSpoiled ? <td className="px-3 py-3 text-right text-rose-700">{r.spoiled ? <>−<Plates value={r.spoiled} /></> : <span className="text-slate-300">0</span>}</td> : null}
                    {showCorrected ? <td className="px-3 py-3 text-right">{r.corrected ? <>{r.corrected > 0 ? "+" : ""}<Plates value={r.corrected} /></> : <span className="text-slate-300">0</span>}</td> : null}
                    <td className="px-3 py-3 text-right text-base font-semibold text-slate-900"><Plates value={r.closing} /></td>
                    <td className="px-3 py-3 text-right font-medium"><Money value={r.value} suffix={false} /></td>
                    <td className="hidden border-l border-slate-300 px-3 py-3 print:table-cell" />
                    <td className="px-2 py-2 text-right print:hidden">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${r.name}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          {editable && r.isActive ? (
                            <>
                              <DropdownMenuItem onClick={() => open("addStock", r)}><Boxes className="h-4 w-4" /> Add stock</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => open("count", r)}><ClipboardCheck className="h-4 w-4" /> Correct count</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => open("edit", r)}><Pencil className="h-4 w-4" /> Edit dish</DropdownMenuItem>
                            </>
                          ) : null}
                          <DropdownMenuItem onClick={() => open("history", r)}><History className="h-4 w-4" /> History</DropdownMenuItem>
                          {editable ? <DropdownMenuSeparator /> : null}
                          {editable && r.isActive ? (
                            <DropdownMenuItem onClick={() => remove(r)} className="text-rose-700"><Trash2 className="h-4 w-4" /> Remove from menu</DropdownMenuItem>
                          ) : null}
                          {editable && !r.isActive ? (
                            <DropdownMenuItem onClick={() => restore(r)}><RotateCcw className="h-4 w-4" /> Put back on the menu</DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-900" data-testid="menu-stock-totals">
                  <td className="px-4 py-3">Total ({countOf(totals.dishes, "dish", "dishes")})</td>
                  <td className="px-3 py-3" />
                  <td className="px-3 py-3 text-right"><Plates value={totals.opening} /></td>
                  <td className="px-3 py-3 text-right text-emerald-700">+<Plates value={totals.added} /></td>
                  <td className="px-3 py-3 text-right text-rose-700">−<Plates value={totals.sold} /></td>
                  {showSpoiled ? <td className="px-3 py-3 text-right text-rose-700">−<Plates value={totals.spoiled} /></td> : null}
                  {showCorrected ? <td className="px-3 py-3 text-right"><Plates value={totals.corrected} /></td> : null}
                  <td className="px-3 py-3 text-right text-base"><Plates value={totals.closing} /></td>
                  <td className="px-3 py-3 text-right"><Money value={totals.value} /></td>
                  <td className="hidden print:table-cell" />
                  <td className="print:hidden" />
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="flex flex-col gap-1 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:justify-between">
            <span>
              <strong className="text-slate-700">Closing = {formula}</strong> · value = closing plates × unit price
              {totals.costValue !== null ? <> · value at cost: {formatMoney(totals.costValue)}</> : null}
            </span>
            {isToday ? <span className="print:hidden">Updates automatically after every sale.</span> : null}
          </div>
        </div>
      )}

      <div className="hidden pt-10 print:grid print:grid-cols-2 print:gap-12 print:text-sm">
        <div className="border-t border-slate-500 pt-1">Counted by (name & signature)</div>
        <div className="border-t border-slate-500 pt-1">Checked by (name & signature)</div>
      </div>

      {!canManage ? (
        <p className="text-xs text-slate-500 print:hidden">Only the department head can change the menu and the stock. <Link className="underline" href={`/d/${departmentId}/sell`}>Go to Sell</Link></p>
      ) : null}

      {dialog?.type === "addDish" ? <AddDishDialog open onOpenChange={(v) => !v && close()} departmentId={departmentId} /> : null}
      {dialog?.type === "edit" ? <EditDishDialog open onOpenChange={(v) => !v && close()} departmentId={departmentId} dish={dialog.dish} /> : null}
      {dialog?.type === "addStock" ? <AddStockDialog open onOpenChange={(v) => !v && close()} departmentId={departmentId} dishes={activeRows} initialDishId={dialog.dish?.dishId} dateKey={dateKey} canBuy={canBuy} /> : null}
      {dialog?.type === "count" ? <CorrectCountDialog open onOpenChange={(v) => !v && close()} departmentId={departmentId} dishes={activeRows} initialDishId={dialog.dish?.dishId} dateKey={dateKey} isToday={isToday} /> : null}
      {dialog?.type === "opening" ? <OpeningStockDialog open onOpenChange={(v) => !v && close()} departmentId={departmentId} rows={rows} dateKey={dateKey} dateLabel={dateLabel} /> : null}
      {dialog?.type === "history" ? <DishHistoryDialog open onOpenChange={(v) => !v && close()} departmentId={departmentId} dish={dialog.dish} canManage={editable} /> : null}
    </div>
  );
}
