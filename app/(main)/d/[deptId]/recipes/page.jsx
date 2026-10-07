import { departmentPage } from "@/lib/page-guards";
import { recipeBoard } from "@/lib/production/queries";
import { productList } from "@/lib/trade/queries";
import { serialize } from "@/lib/serialize";
import { PageHeader } from "@/components/kit/primitives";
import { RecipesBoard } from "@/components/production/recipes-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Recipes" };

/** Production: what one round of each product uses, its cost per unit and margin. */
export default async function RecipesPage({ params }) {
  const { deptId } = await params;
  const { department, domain, perms } = await departmentPage(deptId, { module: "recipes" });
  const [recipes, products] = await Promise.all([recipeBoard({ departmentId: department.id }), productList({ departmentId: department.id })]);
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title="Recipes" description="What one round of each product uses and how many units it makes. The cost follows the materials' average cost, so the margin is always up to date." />
      <RecipesBoard departmentId={department.id} recipes={serialize(recipes)} products={serialize(products.filter((p) => p.kind === "GOODS" && p.isActive))} materials={serialize(products.filter((p) => p.kind !== "SERVICE" && p.isActive))} canManage={perms.manageStock} />
    </div>
  );
}
