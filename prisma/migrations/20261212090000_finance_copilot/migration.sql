-- Finance Copilot: conversations, their audit trail, and the changes the agent proposed.
CREATE TABLE "copilot_sessions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "history" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "copilot_sessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "copilot_sessions_userId_updatedAt_idx" ON "copilot_sessions"("userId", "updatedAt");
ALTER TABLE "copilot_sessions" ADD CONSTRAINT "copilot_sessions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "copilot_sessions" ADD CONSTRAINT "copilot_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "copilot_events" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "turn" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "tool" TEXT,
    "tier" TEXT,
    "payload" JSONB NOT NULL,
    "latencyMs" INTEGER,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "copilot_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "copilot_events_sessionId_createdAt_idx" ON "copilot_events"("sessionId", "createdAt");
ALTER TABLE "copilot_events" ADD CONSTRAINT "copilot_events_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "copilot_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "copilot_actions" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "amount" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "result" JSONB,
    "error" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "copilot_actions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "copilot_actions_userId_status_idx" ON "copilot_actions"("userId", "status");
ALTER TABLE "copilot_actions" ADD CONSTRAINT "copilot_actions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "copilot_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
