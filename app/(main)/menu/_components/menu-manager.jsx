"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createMenuItem, setMenuRecipe } from "@/actions/restaurant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Utensils, Plus, Link2 } from "lucide-react";

export function MenuManager({ departmentId, menuItems = [], stockItems = [] }) {
  const router = useRouter();
  const [savingMenu, setSavingMenu] = useState(false);
  const [savingRecipe, setSavingRecipe] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [recipeMenuId, setRecipeMenuId] = useState("");
  const [recipeStockId, setRecipeStockId] = useState("");
  const [recipeQuantity, setRecipeQuantity] = useState("");

  async function addMenuItem(event) {
    event.preventDefault();
    setSavingMenu(true);
    try {
      const result = await createMenuItem({ departmentId, name, sellingPrice: price });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Menu item created");
      setName("");
      setPrice("");
      router.refresh();
    } catch (error) {
      toast.error(error.message || "Unable to create menu item");
    } finally {
      setSavingMenu(false);
    }
  }

  async function addRecipe(event) {
    event.preventDefault();
    setSavingRecipe(true);
    try {
      const result = await setMenuRecipe({ departmentId, menuItemId: recipeMenuId, stockItemId: recipeStockId, quantity: recipeQuantity });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Recipe ingredient saved");
      setRecipeQuantity("");
      router.refresh();
    } catch (error) {
      toast.error(error.message || "Unable to save recipe ingredient");
    } finally {
      setSavingRecipe(false);
    }
  }

  return <div className="space-y-6">
    <div><h1 className="flex items-center gap-2 text-3xl font-bold"><Utensils className="h-7 w-7 text-emerald-600" /> Food Menu</h1><p className="mt-1 text-sm text-muted-foreground">Define what this department sells and what stock each plate consumes.</p></div>
    <div className="grid gap-6 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Add menu item</CardTitle><CardDescription>Only menu items belonging to this department can be sold here.</CardDescription></CardHeader><CardContent><form onSubmit={addMenuItem} className="space-y-4"><Input placeholder="Food name, e.g. Grilled Chicken" value={name} onChange={(e) => setName(e.target.value)} required /><Input type="number" min="1" step="any" placeholder="Selling price (FCFA)" value={price} onChange={(e) => setPrice(e.target.value)} required /><Button type="submit" disabled={savingMenu} className="w-full">{savingMenu ? "Creating..." : <><Plus className="h-4 w-4" /> Add menu item</>}</Button></form></CardContent></Card>
      <Card><CardHeader><CardTitle>Attach recipe ingredient</CardTitle><CardDescription>Quantity consumed whenever one menu item is sold.</CardDescription></CardHeader><CardContent><form onSubmit={addRecipe} className="space-y-4"><Select value={recipeMenuId} onValueChange={setRecipeMenuId}><SelectTrigger><SelectValue placeholder="Menu item" /></SelectTrigger><SelectContent>{menuItems.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select><Select value={recipeStockId} onValueChange={setRecipeStockId}><SelectTrigger><SelectValue placeholder="Stock ingredient" /></SelectTrigger><SelectContent>{stockItems.map((item) => <SelectItem key={item.id} value={item.id}>{item.name} ({item.unit})</SelectItem>)}</SelectContent></Select><Input type="number" min="0.0001" step="any" placeholder="Quantity per plate" value={recipeQuantity} onChange={(e) => setRecipeQuantity(e.target.value)} required /><Button type="submit" disabled={savingRecipe} className="w-full">{savingRecipe ? "Saving..." : <><Link2 className="h-4 w-4" /> Save recipe</>}</Button></form></CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle>Current menu</CardTitle></CardHeader><CardContent><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{menuItems.map((item) => <div key={item.id} className="rounded-lg border p-4"><div className="font-semibold">{item.name}</div><div className="text-emerald-700">{Number(item.sellingPrice).toLocaleString()} FCFA</div><div className="mt-2 text-xs text-muted-foreground">{item.recipe?.length || 0} recipe ingredients</div></div>)}</div>{menuItems.length === 0 && <p className="text-sm text-muted-foreground">No menu items have been created.</p>}</CardContent></Card>
  </div>;
}
