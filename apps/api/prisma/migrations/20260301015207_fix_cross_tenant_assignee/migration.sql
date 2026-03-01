-- Step 1: Add composite unique index on memberships(id, organizationId)
-- This is required so PostgreSQL can use (id, organizationId) as a composite FK target.
CREATE UNIQUE INDEX "memberships_id_organizationId_key" ON "memberships"("id", "organizationId");

-- Step 2: Drop old FK and index that referenced users.id
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_assignedToId_fkey";
DROP INDEX "conversations_assignedToId_idx";

-- Step 3: Remove old column, add new column
ALTER TABLE "conversations" DROP COLUMN "assignedToId";
ALTER TABLE "conversations" ADD COLUMN "assignedMembershipId" TEXT;

-- Step 4: Add composite FK — DB enforces same-org assignment at constraint level
-- ON DELETE RESTRICT: caller must unassign conversation before removing a membership.
ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_assignedMembershipId_organizationId_fkey"
  FOREIGN KEY ("assignedMembershipId", "organizationId")
  REFERENCES "memberships"("id", "organizationId")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

-- Step 5: Index for efficient assignee filtering
CREATE INDEX "conversations_assignedMembershipId_idx" ON "conversations"("assignedMembershipId");
