import { departmentPage } from "@/lib/page-guards";
import { TradeProductsPage } from "@/components/trade/pages/trade-products-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Products" };

/** Shop, bar, other activity: the catalogue of products (and services). */
export default async function ProductsPage({ params, searchParams }) {
  const { deptId } = await params;
  const page = await departmentPage(deptId, { module: "products" });
  return <TradeProductsPage page={page} searchParams={await searchParams} />;
}
