import { db } from "@/lib/prisma";
import { requirePageUser } from "@/lib/page-guards";
import { redirect } from "next/navigation";
import { copilotConfigured } from "@/lib/copilot/models";
import { PageHeader } from "@/components/kit/primitives";
import { CopilotChat } from "@/components/copilot/copilot-chat";

export const dynamic = "force-dynamic";
export const metadata = { title: "Finance Copilot" };

/**
 * The Finance Copilot: an assistant that reads this person's figures (cash, results, debts,
 * forecast, financing) and prepares changes for them to approve. It never writes on its own.
 */
export default async function CopilotPage() {
  const user = await requirePageUser();
  if (!["ADMIN", "HEAD"].includes(user.role)) redirect("/home");
  const sessions = await db.copilotSession.findMany({ where: { userId: user.id, organizationId: user.organizationId }, orderBy: { updatedAt: "desc" }, take: 8, select: { id: true, title: true, updatedAt: true } });
  const suggestions =
    user.role === "ADMIN"
      ? ["How is the business doing this month compared with last month?", "Will we run short of cash in the next 30 days?", "Who owes us the most, and for how long?", "I need 2 000 000 FCFA for new equipment over 12 months: what are my options?"]
      : ["How much cash should be in my drawer now?", "What were my biggest expenses this month?", "Which customers owe money for more than 30 days?", "Record 8 000 FCFA paid for cooking gas today."];
  return (
    <div>
      <PageHeader
        eyebrow="AI assistant"
        title="Finance Copilot"
        description="Ask about your cash, results, customer debts, cash forecast or financing. It reads your figures only, and prepares changes that you approve: it never records anything by itself."
      />
      <CopilotChat configured={copilotConfigured()} sessions={sessions.map((s) => ({ id: s.id, title: s.title, updatedAt: s.updatedAt.toISOString() }))} suggestions={suggestions} />
    </div>
  );
}
