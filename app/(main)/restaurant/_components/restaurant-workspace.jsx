"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DishesTab } from "./dishes-tab";
import { StockTab } from "./stock-tab";
import { SalesTab } from "./sales-tab";
import { PurchasesTab } from "./purchases-tab";
import { DailyCloseTab } from "./daily-close-tab";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Utensils,
  Boxes,
  ShoppingCart,
  ShoppingBag,
  CalendarCheck,
  Building2,
  Layers,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { getDomainConfig } from "@/lib/domain-capabilities";

export function RestaurantWorkspace({
  user,
  department,
  menuItems = [],
  stockItems = [],
  accounts = [],
  purchases = [],
  dailyCloseData = null,
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("dishes");
  const [refreshing, setRefreshing] = useState(false);

  const domainConfig = getDomainConfig(department?.domain);

  const handleRefresh = () => {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 600);
  };

  const totalStockValuation = stockItems.reduce(
    (sum, s) => sum + (Number(s.currentQuantity) || 0) * (Number(s.valuationUnitCost) || 0),
    0
  );

  const totalAvailablePlates = menuItems.reduce(
    (sum, m) => sum + (Number(m.availableQuantity) || 0),
    0
  );

  const tabs = [
    { id: "dishes", label: "Dishes & Menu", icon: Utensils, count: menuItems.length },
    { id: "stock", label: "Raw Stock & Ingredients", icon: Boxes, count: stockItems.length },
    { id: "pos", label: "Record Sale (POS)", icon: ShoppingCart, highlight: true },
    { id: "purchases", label: "Restock / Purchases", icon: ShoppingBag },
    { id: "daily-close", label: "Daily Close & Handover", icon: CalendarCheck },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Workspace Banner */}
      <div className="rounded-2xl p-6 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-extrabold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              {domainConfig.label}
            </span>
            <span className="text-xs text-slate-300">Operations Hub</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black tracking-tight flex items-center gap-3">
            {department?.name || "Restaurant Department"}
          </h1>

          <p className="text-xs text-slate-300 max-w-xl">
            Unified catalog, plate stock availability, raw ingredient deduction, itemized food sales, and daily executive cash reconciliation.
          </p>
        </div>

        {/* Quick KPI pills */}
        <div className="grid grid-cols-2 gap-3 shrink-0">
          <div className="bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/10 text-center">
            <span className="text-[10px] uppercase font-bold text-slate-300 block">Available Plates</span>
            <span className="text-xl font-black text-emerald-400 font-mono">
              {totalAvailablePlates}
            </span>
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/10 text-center">
            <span className="text-[10px] uppercase font-bold text-slate-300 block">Inventory Value</span>
            <span className="text-xl font-black text-amber-300 font-mono">
              {totalStockValuation.toLocaleString()} <span className="text-[10px] font-sans">FCFA</span>
            </span>
          </div>
        </div>
      </div>

      {/* Tab Navigation Strip */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-2 overflow-x-auto gap-2 [scrollbar-width:none]">
        <div className="flex items-center gap-1.5 shrink-0">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  isActive
                    ? "bg-slate-900 text-white shadow-sm"
                    : tab.highlight
                    ? "bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? "text-white" : tab.highlight ? "text-emerald-700" : "text-slate-500"}`} />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      isActive ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
          className="text-xs text-slate-600 hover:text-slate-900 shrink-0 h-8"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Tab Content Panes */}
      <div className="pt-2">
        {activeTab === "dishes" && (
          <DishesTab
            menuItems={menuItems}
            stockItems={stockItems}
            departmentId={department?.id}
            onRefresh={handleRefresh}
          />
        )}

        {activeTab === "stock" && (
          <StockTab
            stockItems={stockItems}
            departmentId={department?.id}
            onRefresh={handleRefresh}
          />
        )}

        {activeTab === "pos" && (
          <SalesTab
            menuItems={menuItems}
            accounts={accounts}
            departmentId={department?.id}
            onSaleComplete={handleRefresh}
          />
        )}

        {activeTab === "purchases" && (
          <PurchasesTab
            stockItems={stockItems}
            menuItems={menuItems}
            accounts={accounts}
            recentPurchases={purchases}
            departmentId={department?.id}
            onPurchaseComplete={handleRefresh}
          />
        )}

        {activeTab === "daily-close" && (
          <DailyCloseTab
            dailyCloseData={dailyCloseData}
            accounts={accounts}
            departmentId={department?.id}
            onRefresh={handleRefresh}
          />
        )}
      </div>
    </div>
  );
}
