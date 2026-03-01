-- Ensure only one pending invite exists per organization/email.
CREATE UNIQUE INDEX "invitations_org_email_pending_unique"
ON "invitations"("organizationId", "email")
WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;
