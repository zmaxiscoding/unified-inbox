import { Role } from "@prisma/client";

export type SessionPayload = {
  userId: string;
  organizationId: string;
  sessionVersion: number;
  role?: Role;
  iat: number;
  exp: number;
};
