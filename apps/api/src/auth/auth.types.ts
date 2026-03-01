import { Role } from "@prisma/client";

export type SessionPayload = {
  userId: string;
  organizationId: string;
  role?: Role;
  iat: number;
  exp: number;
};
