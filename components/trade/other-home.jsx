import { TradeHome } from "./trade-home";
import { jobsExtra } from "@/components/services/service-home";

/** Dashboard of an other activity: its sales and stock, and its jobs when it takes any. */
export async function OtherHome({ page }) {
  return <TradeHome page={page} extra={await jobsExtra(page)} />;
}
