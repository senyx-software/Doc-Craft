-- Additive reconciliation for persisted conversation metadata and worker records.
ALTER TABLE "chat_sessions" ADD COLUMN IF NOT EXISTS "title" TEXT NOT NULL DEFAULT 'Untitled Session';
ALTER TABLE "chat_sessions" ADD COLUMN IF NOT EXISTS "isArchived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
CREATE INDEX IF NOT EXISTS "chat_sessions_userId_isArchived_createdAt_idx" ON "chat_sessions"("userId", "isArchived", "createdAt");


CREATE TABLE IF NOT EXISTS "generated_documents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "documentTypeId" TEXT NOT NULL,
    "documentNumber" TEXT,
    "slots" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL,
    "pdfUrl" TEXT,
    "fileName" TEXT,
    "watermarked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "generatedAt" TIMESTAMP(3),

    CONSTRAINT "generated_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "generated_documents_documentNumber_key" ON "generated_documents"("documentNumber");

CREATE INDEX IF NOT EXISTS "generated_documents_userId_idx" ON "generated_documents"("userId");

CREATE INDEX IF NOT EXISTS "generated_documents_sessionId_idx" ON "generated_documents"("sessionId");

CREATE INDEX IF NOT EXISTS "generated_documents_templateId_idx" ON "generated_documents"("templateId");

CREATE INDEX IF NOT EXISTS "generated_documents_documentTypeId_idx" ON "generated_documents"("documentTypeId");

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'generated_documents_documentTypeId_fkey') THEN ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "document_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'generated_documents_sessionId_fkey') THEN ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'generated_documents_templateId_fkey') THEN ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;

CREATE TABLE IF NOT EXISTS "tool_executions" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "input" JSONB NOT NULL DEFAULT '{}',
    "output" JSONB,
    "status" TEXT NOT NULL,
    "durationMs" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tool_executions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "tool_executions_sessionId_idx" ON "tool_executions"("sessionId");

CREATE INDEX IF NOT EXISTS "tool_executions_toolName_idx" ON "tool_executions"("toolName");

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tool_executions_sessionId_fkey') THEN ALTER TABLE "tool_executions" ADD CONSTRAINT "tool_executions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;

CREATE TABLE IF NOT EXISTS "ai_usages" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL,
    "completionTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "estimatedCost" DOUBLE PRECISION,
    "responseTimeMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ai_usages_sessionId_idx" ON "ai_usages"("sessionId");

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_usages_sessionId_fkey') THEN ALTER TABLE "ai_usages" ADD CONSTRAINT "ai_usages_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;
