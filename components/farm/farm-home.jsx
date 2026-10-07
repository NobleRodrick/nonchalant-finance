import Link from "next/link";
import { pageDate } from "@/lib/page-guards";
import { farmBoard, farmWarnings, lastEventKeys } from "@/lib/farm/queries";
import { formatMoney } from "@/lib/format";
import { Section, StatCard } from "@/components/kit/primitives";
import { TradeHome } from "@/components/trade/trade-home";
import { BatchCard } from "./batch-card";

/** Dashboard of a farm: its batches (alive, deaths, cost, profit), then sales and stock. */
export async function FarmHome({ page }) {
  const { user, department } = page;
  const { todayKey, timeZone } = pageDate(user, null);
  const [board, last] = await Promise.all([farmBoard({ departmentId: department.id, todayKey, timeZone, status: "ACTIVE" }), lastEventKeys({ departmentId: department.id, timeZone })]);
  const base = `/d/${department.id}`;
  const body = (
    <Section title="Active batches" description={`${board.totals.active} batch(es) · ${board.totals.animals} animals and fish alive · ${board.totals.deathsToday} death(s) today · cost ${formatMoney(board.totals.cost)}`} actions={<Link className="text-sm underline" href={`${base}/batches`}>All batches</Link>}>
      {board.batches.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="farm-batches">{board.batches.map((b) => <BatchCard key={b.id} base={base} b={b} />)}</div> : <div className="grid gap-3 sm:grid-cols-2"><StatCard label="No active batch" value="—" hint="Start one on the Batches & fields page" href={`${base}/batches`} /></div>}
    </Section>
  );
  return <TradeHome page={page} extra={{ warnings: farmWarnings(board.batches, todayKey, last), body }} />;
}
