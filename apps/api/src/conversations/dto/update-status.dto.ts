import { IsEnum } from "class-validator";
import { ConversationStatus } from "@prisma/client";

export class UpdateStatusDto {
  @IsEnum(ConversationStatus, {
    message: "status must be one of: OPEN, RESOLVED, SNOOZED",
  })
  status!: ConversationStatus;
}
