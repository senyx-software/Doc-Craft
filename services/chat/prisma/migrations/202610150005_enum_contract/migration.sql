-- The original migration used TEXT while Prisma has always required enums.
-- Invalid legacy values abort the transaction; no row is deleted or reset.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ChatSessionStatus') THEN
    CREATE TYPE "ChatSessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ABANDONED', 'EXPIRED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MessageRole') THEN
    CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL');
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name='chat_sessions' AND column_name='status' AND udt_name <> 'ChatSessionStatus') THEN
    ALTER TABLE "chat_sessions" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "chat_sessions" ALTER COLUMN "status" TYPE "ChatSessionStatus" USING "status"::"ChatSessionStatus";
    ALTER TABLE "chat_sessions" ALTER COLUMN "status" SET DEFAULT 'ACTIVE'::"ChatSessionStatus";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name='chat_messages' AND column_name='role' AND udt_name <> 'MessageRole') THEN
    ALTER TABLE "chat_messages" ALTER COLUMN "role" TYPE "MessageRole" USING "role"::"MessageRole";
  END IF;
END $$;
