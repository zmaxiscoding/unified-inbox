import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { ConversationStatus } from "@prisma/client";

export class ListConversationsQueryDto {
  @IsOptional()
  @IsEnum(ConversationStatus, {
    message: "status must be one of: OPEN, RESOLVED, SNOOZED",
  })
  status?: ConversationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsString()
  assignedTo?: string;
}
