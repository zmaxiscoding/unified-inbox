ALTER TABLE "users"
ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

-- Low-risk rollout: existing password-backed accounts are treated as already verified
-- so current tenants are not blocked when verification tracking ships.
UPDATE "users"
SET "emailVerifiedAt" = "createdAt"
WHERE "passwordHash" IS NOT NULL
  AND "emailVerifiedAt" IS NULL;

CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "invalidatedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_verification_tokens" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "invalidatedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key"
ON "password_reset_tokens"("tokenHash");

CREATE UNIQUE INDEX "email_verification_tokens_tokenHash_key"
ON "email_verification_tokens"("tokenHash");

CREATE INDEX "password_reset_tokens_userId_createdAt_idx"
ON "password_reset_tokens"("userId", "createdAt" DESC);

CREATE INDEX "email_verification_tokens_userId_createdAt_idx"
ON "email_verification_tokens"("userId", "createdAt" DESC);

-- DB-level guarantee: a user can have at most one active token of each type.
CREATE UNIQUE INDEX "password_reset_tokens_userId_active_unique"
ON "password_reset_tokens"("userId")
WHERE "usedAt" IS NULL AND "invalidatedAt" IS NULL;

CREATE UNIQUE INDEX "email_verification_tokens_userId_active_unique"
ON "email_verification_tokens"("userId")
WHERE "usedAt" IS NULL AND "invalidatedAt" IS NULL;

ALTER TABLE "password_reset_tokens"
ADD CONSTRAINT "password_reset_tokens_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "email_verification_tokens"
ADD CONSTRAINT "email_verification_tokens_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
