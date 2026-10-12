"use server";

import { runAction } from "@/lib/action";
import { requireOrgUser } from "@/lib/access";
import { db } from "@/lib/prisma";
import { ActionError } from "@/lib/errors";
import { copilotConfigured, geminiModel } from "@/lib/copilot/models";
import { decideCopilotAction, runCopilotTurn } from "@/lib/copilot/agent";

/** Sends a message to the Finance Copilot (a new conversation when sessionId is empty). */
export async function askCopilot({ sessionId = null, message } = {}) {
  return runAction("askCopilot", async () => {
    const user = await requireOrgUser();
    if (!copilotConfigured()) throw new ActionError("UNAVAILABLE", "The Finance Copilot is not configured on this server (GEMINI_API_KEY).");
    return runCopilotTurn({ user, sessionId, message, model: geminiModel() });
  });
}

/** Approves (runs) or rejects a change the copilot proposed. */
export async function decideCopilotProposal({ actionId, approve } = {}) {
  return runAction("decideCopilotProposal", async () => {
    const user = await requireOrgUser();
    return decideCopilotAction({ user, actionId, approve: approve === true });
  });
}

/** A conversation of this person: its messages and proposals (for reopening it). */
export async function loadCopilotSession({ sessionId } = {}) {
  return runAction("loadCopilotSession", async () => {
    const user = await requireOrgUser();
    const session = await db.copilotSession.findFirst({ where: { id: sessionId || "-", userId: user.id, organizationId: user.organizationId } });
    if (!session) throw new ActionError("NOT_FOUND", "Conversation not found.");
    const [events, actions] = await Promise.all([
      db.copilotEvent.findMany({ where: { sessionId: session.id, type: { in: ["user_message", "reply"] } }, orderBy: { createdAt: "asc" } }),
      db.copilotAction.findMany({ where: { sessionId: session.id }, orderBy: { createdAt: "asc" } }),
    ]);
    return {
      id: session.id,
      title: session.title,
      messages: events.map((e) => ({ role: e.type === "user_message" ? "user" : "assistant", text: e.payload?.text || "", turn: e.turn, proposals: e.payload?.proposals || [] })),
      actions: actions.map((a) => ({ id: a.id, kind: a.kind, summary: a.summary, amount: a.amount, status: a.status, error: a.error, expiresAt: a.expiresAt })),
    };
  });
}
