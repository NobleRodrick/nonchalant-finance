"use client";

import { useState } from "react";
import {
  createMenuItem,
  updateMenuItem,
  deactivateMenuItem,
  setMenuRecipe,
  removeMenuRecipe,
} from "@/actions/restaurant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Utensils,
  Plus,
  Pencil,
  Trash2,
  ChefHat,
  Layers,
  Loader2,
  AlertTriangle,
  Scale,
} from "lucide-react";

export function DishesTab({ menuItems = [], stockItems = [], departmentId, onRefresh }) {
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [recipeModalOpen, setRecipeModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form states
  const [name, setName] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [inventoryMode, setInventoryMode] = useState("DIRECT_PLATE");
  const [openingQuantity, setOpeningQuantity] = useState("");
  const [description, setDescription] = useState("");

  const [selectedDish, setSelectedDish] = useState(null);

  // Recipe states
  const [recipeStockItemId, setRecipeStockItemId] = useState("");
  const [recipeQuantity, setRecipeQuantity] = useState("");

  const openAddModal = () => {
    setName("");
    setSellingPrice("");
    setCostPrice("");
    setInventoryMode("DIRECT_PLATE");
    setOpeningQuantity("20");
    setDescription("");
    setAddModalOpen(true);
  };

  const openEditModal = (dish) => {
    setSelectedDish(dish);
    setName(dish.name);
    setSellingPrice(dish.sellingPrice?.toString() || "");
    setCostPrice(dish.costPrice?.toString() || "");
    setInventoryMode(dish.inventoryMode || "DIRECT_PLATE");
    setOpeningQuantity(dish.currentQuantity?.toString() || "0");
    setDescription(dish.description || "");
    setEditModalOpen(true);
  };

  const openRecipeModal = (dish) => {
    setSelectedDish(dish);
    setRecipeStockItemId(stockItems[0]?.id || "");
    setRecipeQuantity("");
    setRecipeModalOpen(true);
  };

  const handleCreateDish = async (e) => {
    e.preventDefault();
    if (!name.trim() || !sellingPrice) {
      toast.error("Dish name and selling price are required");
      return;
    }

    setLoading(true);
    try {
      const res = await createMenuItem({
        name,
        sellingPrice: Number(sellingPrice),
        costPrice: Number(costPrice) || 0,
        inventoryMode,
        openingQuantity: Number(openingQuantity) || 0,
        description,
        departmentId,
      });

      if (res.success) {
        toast.success(`Dish "${name}" added to menu!`);
        setAddModalOpen(false);
        onRefresh();
      } else {
        toast.error(res.error || "Failed to create dish");
      }
    } catch (err) {
      toast.error(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateDish = async (e) => {
    e.preventDefault();
    if (!selectedDish || !name.trim() || !sellingPrice) return;

    setLoading(true);
    try {
      const res = await updateMenuItem({
        id: selectedDish.id,
        name,
        sellingPrice: Number(sellingPrice),
        costPrice: Number(costPrice) || 0,
        inventoryMode,
        currentQuantity: Number(openingQuantity) || 0,
        description,
      });

      if (res.success) {
        toast.success(`Dish "${name}" updated!`);
        setEditModalOpen(false);
        setSelectedDish(null);
        onRefresh();
      } else {
        toast.error(res.error || "Failed to update dish");
      }
    } catch (err) {
      toast.error(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivate = async (dish) => {
    if (!confirm(`Are you sure you want to deactivate "${dish.name}" from the menu?`)) return;

    try {
      const res = await deactivateMenuItem(dish.id);
      if (res.success) {
        toast.success(`"${dish.name}" deactivated`);
        onRefresh();
      } else {
        toast.error(res.error || "Failed to deactivate dish");
      }
    } catch (err) {
      toast.error(err.message || "Failed to deactivate dish");
    }
  };

  const handleAddRecipeIngredient = async (e) => {
    e.preventDefault();
    if (!selectedDish || !recipeStockItemId || !recipeQuantity) {
      toast.error("Please select a stock item and quantity per plate");
      return;
    }

    setLoading(true);
    try {
      const res = await setMenuRecipe({
        menuItemId: selectedDish.id,
        stockItemId: recipeStockItemId,
        quantity: Number(recipeQuantity),
        departmentId,
      });

      if (res.success) {
        toast.success("Recipe ingredient attached successfully!");
        setRecipeQuantity("");
        onRefresh();
      } else {
        toast.error(res.error || "Failed to attach recipe ingredient");
      }
    } catch (err) {
      toast.error(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveRecipeIngredient = async (stockItemId) => {
    if (!selectedDish) return;
    try {
      const res = await removeMenuRecipe(selectedDish.id, stockItemId);
      if (res.success) {
        toast.success("Ingredient removed from recipe");
        onRefresh();
      } else {
        toast.error(res.error || "Failed to remove ingredient");
      }
    } catch (err) {
      toast.error(err.message || "An error occurred");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Food Menu & Dish Catalog</h2>
          <p className="text-xs text-muted-foreground">
            Manage your kitchen dishes, plate stock availability, selling prices, and recipe structures.
          </p>
        </div>

        <Button onClick={openAddModal} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
          <Plus className="h-4 w-4 mr-1.5" /> Add New Dish
        </Button>
      </div>

      {menuItems.length === 0 ? (
        <Card className="border-dashed border-2 bg-slate-50/50">
          <CardContent className="py-12 text-center space-y-3">
            <Utensils className="h-10 w-10 mx-auto text-slate-400" />
            <h3 className="font-semibold text-slate-800">No dishes on the menu yet</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Add your first restaurant dish to begin taking itemized orders and tracking plate inventory.
            </p>
            <Button onClick={openAddModal} variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-1" /> Add Dish
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {menuItems.map((dish) => {
            const isDirect = dish.inventoryMode === "DIRECT_PLATE";
            const isLowStock = dish.availableQuantity <= 5;

            return (
              <Card key={dish.id} className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-base text-slate-900">{dish.name}</span>
                      </div>
                      {dish.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1">{dish.description}</p>
                      )}
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[10px] uppercase font-bold shrink-0 ${
                        isDirect
                          ? "bg-blue-50 text-blue-700 border-blue-200"
                          : "bg-purple-50 text-purple-700 border-purple-200"
                      }`}
                    >
                      {isDirect ? "Direct Plate Stock" : "Recipe Mode"}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4 pt-1">
                  <div className="grid grid-cols-2 gap-3 py-2 px-3 bg-slate-50 rounded-lg border border-slate-100 text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Selling Price</span>
                      <span className="font-extrabold text-slate-900 text-sm">
                        {dish.sellingPrice?.toLocaleString()} FCFA
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Available Plates</span>
                      <span
                        className={`font-extrabold text-sm flex items-center gap-1 ${
                          isLowStock ? "text-amber-600" : "text-emerald-700"
                        }`}
                      >
                        {dish.availableQuantity} plates
                        {isLowStock && <AlertTriangle className="h-3.5 w-3.5" />}
                      </span>
                    </div>
                  </div>

                  {dish.recipe && dish.recipe.length > 0 && (
                    <div className="space-y-1 pt-1">
                      <span className="text-[10px] font-bold uppercase text-slate-400 block">
                        Recipe Ingredients ({dish.recipe.length}):
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {dish.recipe.map((r) => (
                          <span
                            key={r.id}
                            className="text-[11px] bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded shadow-2xs"
                          >
                            {r.quantity} {r.stockItem?.unit} {r.stockItem?.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openRecipeModal(dish)}
                      className="text-xs text-purple-700 hover:text-purple-800 hover:bg-purple-50 h-8 px-2"
                    >
                      <ChefHat className="h-3.5 w-3.5 mr-1" />
                      Recipe ({dish.recipe?.length || 0})
                    </Button>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditModal(dish)}
                        className="h-8 w-8 text-slate-600 hover:text-slate-900"
                        title="Edit Dish"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeactivate(dish)}
                        className="h-8 w-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                        title="Deactivate Dish"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Dish Modal */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Menu Dish</DialogTitle>
            <DialogDescription>
              Configure a sellable food item with direct plate stock or ingredient recipe.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateDish} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Dish / Food Name *</label>
              <Input
                placeholder="e.g. Grilled Chicken & Alloco"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Selling Price (FCFA) *</label>
                <Input
                  type="number"
                  placeholder="e.g. 4500"
                  required
                  min="1"
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Estimated Cost (FCFA)</label>
                <Input
                  type="number"
                  placeholder="e.g. 2000"
                  min="0"
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Stock Control Mode *</label>
              <select
                value={inventoryMode}
                onChange={(e) => setInventoryMode(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                <option value="DIRECT_PLATE">Direct Plate Stock (Prepared dishes counted by plate)</option>
                <option value="RECIPE">Recipe Deduction (Deducts kg/litres from ingredients)</option>
              </select>
            </div>

            {inventoryMode === "DIRECT_PLATE" && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Opening Plates Available</label>
                <Input
                  type="number"
                  placeholder="e.g. 25"
                  min="0"
                  value={openingQuantity}
                  onChange={(e) => setOpeningQuantity(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  Number of ready plates prepared and available for sale today.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Description (Optional)</label>
              <Input
                placeholder="Portion size, spices, or accompaniment notes"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" onClick={() => setAddModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Dish"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dish Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Dish: {selectedDish?.name}</DialogTitle>
            <DialogDescription>Modify pricing, plate stock count, or inventory mode.</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleUpdateDish} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Dish Name *</label>
              <Input required value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Selling Price (FCFA) *</label>
                <Input
                  type="number"
                  required
                  min="1"
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Cost Price (FCFA)</label>
                <Input
                  type="number"
                  min="0"
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Stock Control Mode *</label>
              <select
                value={inventoryMode}
                onChange={(e) => setInventoryMode(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                <option value="DIRECT_PLATE">Direct Plate Stock</option>
                <option value="RECIPE">Recipe Deduction Mode</option>
              </select>
            </div>

            {inventoryMode === "DIRECT_PLATE" && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Current Available Plates</label>
                <Input
                  type="number"
                  min="0"
                  value={openingQuantity}
                  onChange={(e) => setOpeningQuantity(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Description</label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="outline" onClick={() => setEditModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Recipe Management Modal */}
      <Dialog open={recipeModalOpen} onOpenChange={setRecipeModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ChefHat className="h-5 w-5 text-purple-600" /> Recipe: {selectedDish?.name}
            </DialogTitle>
            <DialogDescription>
              Specify which raw stock ingredients are deducted when a plate of this dish is sold.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Existing recipe lines */}
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Configured Ingredients
              </span>
              {selectedDish?.recipe?.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-2">No ingredients configured yet.</p>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                  {selectedDish?.recipe?.map((r) => (
                    <div key={r.id} className="flex items-center justify-between p-2.5 text-xs bg-white">
                      <div>
                        <span className="font-semibold text-slate-800">{r.stockItem?.name}</span>
                        <span className="text-muted-foreground ml-2">
                          ({r.quantity} {r.stockItem?.unit} per plate)
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleRemoveRecipeIngredient(r.stockItemId)}
                        className="text-rose-600 hover:bg-rose-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add ingredient form */}
            <form onSubmit={handleAddRecipeIngredient} className="space-y-3 pt-2 border-t border-slate-100">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                Attach Ingredient
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-600">Stock Item</label>
                  <select
                    value={recipeStockItemId}
                    onChange={(e) => setRecipeStockItemId(e.target.value)}
                    className="w-full h-9 px-2 rounded-md border border-slate-200 bg-white text-xs"
                  >
                    {stockItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.unit})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-600">Qty Per Plate</label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 0.25"
                    className="h-9 text-xs"
                    required
                    value={recipeQuantity}
                    onChange={(e) => setRecipeQuantity(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <Button type="submit" size="sm" className="bg-purple-600 hover:bg-purple-700 text-white" disabled={loading}>
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                  Add to Recipe
                </Button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
