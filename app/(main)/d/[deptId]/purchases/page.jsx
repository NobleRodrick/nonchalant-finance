import { db } from "@/lib/prisma";
import { departmentPage, pageDate } from "@/lib/page-guards";
import { periodLabel, resolvePeriod } from "@/lib/reports/periods";
import { rangeBounds, toDateKey } from "@/lib/timezone";
import { METHOD_LABELS } from "@/lib/finance/money-math";
import { bookableItems } from "@/lib/rental/item-queries";
import { RENTAL_ITEM_CATEGORIES } from "@/lib/domains/rental";
import { serialize } from "@/lib/serialize";
import { formatMoney } from "@/lib/format";
import { PageHeader, StatCard } from "@/components/kit/primitives";
import { PeriodPicker } from "@/components/kit/period-picker";
import { PurchasesBoard } from "@/components/rental/purchases/purchases-board";
import { TradePurchasesPage } from "@/components/trade/pages/trade-purchases-page";
import { TRADE_DOMAINS } from "@/lib/domains/trade";

export const dynamic = "force-dynamic";
export const metadata = { title: "Purchases" };

/** Event rental: purchases of items and materials of a period (the stock grows with each). */
export default async function PurchasesPage({ params, searchParams }) {
  const { deptId } = await params;
  const sp = (await searchParams) || {};
  const page = await departmentPage(deptId, { module: "purchases" });
  if (TRADE_DOMAINS.includes(page.department.domain)) return <TradePurchasesPage page={page} searchParams={sp} />;
  const { user, department, domain, perms } = page;
  const { todayKey, timeZone } = pageDate(user, null);
  const range = resolvePeriod(sp, todayKey, "month");
  const { start, end } = rangeBounds(range.fromKey, range.toKey, timeZone);
  const [rows, items] = await Promise.all([
    db.purchase.findMany({ where: { departmentId: department.id, date: { gte: start, lte: end }, lines: { some: { rentalItemId: { not: null } } } }, include: { lines: { include: { rentalItem: { select: { name: true } } } }, transaction: { select: { referenceNo: true, receivedByName: true } }, user: { select: { name: true } } }, orderBy: { date: "desc" } }),
    bookableItems(department.id),
  ]);
  const [assets, files] = await Promise.all([
    db.fixedAsset.findMany({ where: { purchaseId: { in: rows.map((r) => r.id) } }, select: { purchaseId: true, code: true } }),
    db.attachment.findMany({ where: { entityType: "Transaction", entityId: { in: rows.map((r) => r.transactionId).filter(Boolean) } }, select: { id: true, entityId: true, fileName: true } }),
  ]);
  const purchases = rows.map((p) => ({
    id: p.id,
    referenceNo: p.transaction?.referenceNo || "—",
    dateKey: toDateKey(p.date, timeZone),
    supplier: p.supplierName,
    method: METHOD_LABELS[p.paymentMethod] || p.paymentMethod,
    reference: p.reference,
    boughtBy: p.transaction?.receivedByName || p.user?.name,
    total: Number(p.totalAmount),
    voided: p.status === "VOIDED",
    lines: p.lines.map((l) => ({ name: l.rentalItem?.name || l.description, quantity: Number(l.quantity), unitCost: Number(l.unitCost) })),
    assets: assets.filter((a) => a.purchaseId === p.id).map((a) => a.code),
    proofs: files.filter((f) => f.entityId === p.transactionId).map((f) => ({ id: f.id, fileName: f.fileName })),
  }));
  const live = purchases.filter((p) => !p.voided);
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title="Purchases" description={`${periodLabel(range)}. Items and materials bought: the stock grows with each purchase and the item's purchase price follows.`}>
        <div className="mt-3"><PeriodPicker range={range} /></div>
      </PageHeader>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Purchases" value={live.length} />
        <StatCard label="Spent on items" value={formatMoney(live.reduce((s, p) => s + p.total, 0))} hint="investments in stock" />
        <StatCard label="Units bought" value={live.reduce((s, p) => s + p.lines.reduce((x, l) => x + l.quantity, 0), 0)} />
      </div>
      <datalist id="rental-categories">{RENTAL_ITEM_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
      <PurchasesBoard departmentId={department.id} purchases={serialize(purchases)} items={serialize(items)} canRecord={perms.rentalManage} canVoid={perms.void} canExport={perms.export} currentUserName={user.name} periodKey={`${range.fromKey}-${range.toKey}`} />
    </div>
  );
}
