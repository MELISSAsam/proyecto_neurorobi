CREATE TABLE "LoginAttempt" (
  "ipHash" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 1,
  "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("ipHash")
);

CREATE INDEX "LoginAttempt_windowStartedAt_idx" ON "LoginAttempt"("windowStartedAt");
